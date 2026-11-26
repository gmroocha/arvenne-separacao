import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CircleCheck, ClipboardPaste, Plus, RefreshCw, Send, StickyNote, Trash2, TriangleAlert } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import Foto from "@/components/Foto"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { blingGerar, blingPreparar, lerLista, useBlingSituacao, type Conferencia, type Gerado } from "@/lib/bling"
import { lerNumero, quando, reais, reaisTexto } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Peça que já vem do pedido (etapa Nota fiscal): foto, variante e recado ajudam a conferir.
export type LinhaInicial = { sku: string | null; qtd: number; nome?: string | null; variante?: string | null; foto_url?: string | null; nota?: string | null }

type Linha = {
  id: number
  sku: string | null
  codigo: string
  qtd: string
  valor: string // texto do campo de preço
  valorEditado: boolean // só o preço digitado à mão vai para a conferência; o resto vem do cadastro do Bling
  nome: string | null
  variante: string | null
  foto: string | null
  nota: string | null
  achou?: boolean
  descricao?: string | null
  lembrado: boolean // o código veio da lista que o app lembra
  lembrar: boolean // marcar "Lembrar para as próximas"
}

let proximoId = 1
const nova = (p: Partial<Linha> = {}): Linha => ({
  id: proximoId++, sku: null, codigo: "", qtd: "1", valor: "", valorEditado: false, nome: null, variante: null, foto: null, nota: null,
  lembrado: false, lembrar: true, ...p,
})
const doPedido = (l: LinhaInicial) => nova({ sku: l.sku, codigo: l.sku ?? "", qtd: String(l.qtd), nome: l.nome ?? null, variante: l.variante ?? null, foto: l.foto_url ?? null, nota: l.nota ?? null })
const qtdDe = (l: Linha) => (/^\d+$/.test(l.qtd.trim()) ? Number(l.qtd) : 0)

type Props = {
  pedidoId?: string // com pedido: vale quem vê o pedido e o passo "Pedido LR" é marcado; sem: só o gestor
  inicial?: LinhaInicial[]
  aoGerar?: (r: Gerado) => void
  fixarAcoes?: boolean // botões fixos no pé da área rolável (janela do pedido)
}

// Monta o pedido de venda da LR e gera no Bling. A conta (preço do cadastro e total) é do Bling/da função: a tela só exibe.
// Qualquer mudança nas linhas pede "Conferir no Bling" de novo antes de gerar.
export default function MontarPedidoLr({ pedidoId, inicial, aoGerar, fixarAcoes }: Props) {
  const qc = useQueryClient()
  const situacao = useBlingSituacao().data
  const [linhas, setLinhas] = useState<Linha[]>(() => (inicial ?? []).map(doPedido))
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)
  const [ocupado, setOcupado] = useState<"conferir" | "gerar" | null>(null)
  const [colando, setColando] = useState(false)
  const [texto, setTexto] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [repetir, setRepetir] = useState(false)
  const [gerado, setGerado] = useState<Gerado | null>(null)
  const primeira = useRef(true)

  const editar = (id: number, campos: Partial<Linha>) => {
    setConferencia(null)
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...campos } : l)))
  }
  // Ao conferir só vai o preço digitado à mão (o resto vem do Bling); ao gerar vai o preço que a pessoa está vendo.
  const itens = (todos = false) => linhas.map((l) => ({ sku: l.sku, codigo: l.codigo.trim(), qtd: qtdDe(l), valor: todos || l.valorEditado ? lerNumero(l.valor) : null }))
  const linhasValidas = linhas.length > 0 && linhas.every((l) => qtdDe(l) >= 1 && (l.codigo.trim() || l.sku))

  async function conferir() {
    if (!linhasValidas) return toast.error("Confira o código e a quantidade de cada linha.")
    setOcupado("conferir")
    try {
      const r = await blingPreparar(itens(), pedidoId)
      setLinhas((atual) =>
        atual.map((l, i) => {
          const c = r.linhas[i]
          if (!c) return l
          return {
            ...l, codigo: c.codigo, lembrado: c.lembrado, achou: c.achou, descricao: c.descricao,
            valor: l.valorEditado ? l.valor : c.valor != null ? reaisTexto(c.valor) : "",
          }
        }),
      )
      setConferencia(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível falar com o Bling.")
    } finally {
      setOcupado(null)
    }
  }

  // Peças que já vêm do pedido: confere sozinho ao abrir, para os preços aparecerem sem um toque a mais.
  const pronto = !!situacao?.conectado && !!situacao.contatoDefinido
  useEffect(() => {
    if (!primeira.current || !pronto) return
    primeira.current = false
    if (inicial?.length) void conferir()
    // Só na primeira vez em que o Bling está pronto; depois, conferir é com o botão.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto])

  function colar() {
    const { linhas: lidas, ignoradas } = lerLista(texto)
    if (!lidas.length) return toast.error("Não encontrei nenhuma peça no texto colado.")
    setConferencia(null)
    setLinhas((atual) => {
      let novas = atual
      for (const l of lidas) {
        const igual = novas.find((x) => (x.codigo.trim() || x.sku || "").toLowerCase() === l.sku.toLowerCase())
        novas = igual
          ? novas.map((x) => (x === igual ? { ...x, qtd: String(qtdDe(x) + l.qtd) } : x))
          : [...novas, nova({ sku: l.sku, codigo: l.sku, qtd: String(l.qtd) })]
      }
      return novas
    })
    if (ignoradas.length) toast.warning(`${ignoradas.length} ${ignoradas.length === 1 ? "linha foi ignorada" : "linhas foram ignoradas"}: ${ignoradas.slice(0, 3).join(" | ")}`)
    setTexto("")
    setColando(false)
  }

  async function gerar() {
    setOcupado("gerar")
    try {
      const lembrar = linhas.filter((l) => l.lembrar && l.sku && l.codigo.trim() !== l.sku && !l.lembrado).map((l) => ({ sku: l.sku!, codigo: l.codigo.trim() }))
      const r = await blingGerar({ itens: itens(true), lembrar, pedidoId, confirmarRepetido: repetir })
      toast.success(`Pedido nº ${r.numero} gerado no Bling`)
      for (const a of r.avisos ?? []) toast.warning(a)
      setConfirmando(false)
      setGerado(r)
      for (const k of [["bling"], ["pedido", pedidoId], ["pedidos"]]) void qc.invalidateQueries({ queryKey: k })
      aoGerar?.(r)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o pedido.")
    } finally {
      setOcupado(null)
    }
  }

  if (gerado)
    return (
      <Alert aria-label="Pedido gerado no Bling">
        <CircleCheck />
        <AlertTitle>Pedido nº {gerado.numero} gerado no Bling</AlertTitle>
        <AlertDescription>
          Total no Bling: {reais(gerado.total)}.
          {!pedidoId && (
            <Button className="mt-2 w-full sm:w-fit" variant="outline" size="toque" onClick={() => { setGerado(null); setLinhas([]); setConferencia(null); setRepetir(false) }}>
              <Plus /> Montar outro pedido
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )

  const faltando = linhas.some((l) => l.achou === false)
  const podeGerar = conferencia !== null && !faltando && linhasValidas && !ocupado
  const pecas = linhas.reduce((n, l) => n + qtdDe(l), 0)

  return (
    <div className="flex flex-col gap-3">
      {linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma peça ainda. Adicione uma peça ou cole a lista.</p>}
      <ul className="flex flex-col gap-2" aria-label="Peças do pedido no Bling">
        {linhas.map((l, n) => {
          const sugerirLembrar = !!l.sku && l.codigo.trim() !== l.sku && !l.lembrado
          return (
            <li key={l.id} className={cn("flex flex-col gap-2 rounded-lg border p-2", l.achou === false && "border-destructive/60 bg-destructive/5", l.achou === true && "border-success/40")}>
              <div className="flex items-start gap-2">
                {l.foto && <Foto url={l.foto} alt={l.nome ?? ""} className="size-12 shrink-0 rounded-md" />}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {(l.sku || l.nome || l.variante) && (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {l.sku && <span className="font-mono">{l.sku}</span>}
                      {l.variante && <span className="break-words">{l.variante}</span>}
                    </span>
                  )}
                  <Input
                    className="h-11 font-mono lg:h-9"
                    aria-label={`Código no Bling da linha ${n + 1}`}
                    aria-invalid={l.achou === false || undefined}
                    placeholder="Código no Bling"
                    value={l.codigo}
                    disabled={!!ocupado}
                    onChange={(e) => editar(l.id, { codigo: e.target.value, achou: undefined, descricao: null, lembrado: false })}
                  />
                </div>
                <Button variant="ghost" size="icon-toque" className="shrink-0" aria-label={`Remover linha ${n + 1}`} disabled={!!ocupado}
                  onClick={() => { setConferencia(null); setLinhas((atual) => atual.filter((x) => x.id !== l.id)) }}>
                  <Trash2 />
                </Button>
              </div>
              {l.nota && (
                <p className="flex items-start gap-1.5 rounded-md bg-muted p-2 text-sm font-medium">
                  <StickyNote className="mt-0.5 size-4 shrink-0" /> <span className="break-words">Recado: {l.nota}</span>
                </p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  className="h-11 w-20 shrink-0 tabular-nums lg:h-9"
                  inputMode="numeric"
                  aria-label={`Quantidade da linha ${n + 1}`}
                  aria-invalid={qtdDe(l) < 1 || undefined}
                  value={l.qtd}
                  disabled={!!ocupado}
                  onChange={(e) => editar(l.id, { qtd: e.target.value.replace(/\D/g, "") })}
                />
                <CampoReais
                  className="h-11 min-w-0 flex-1 sm:max-w-44 lg:h-9"
                  aria-label={`Preço da linha ${n + 1}`}
                  value={l.valor}
                  disabled={!!ocupado || l.achou == null}
                  placeholder="Confira no Bling"
                  onValueChange={(v) => editar(l.id, { valor: v, valorEditado: true })}
                />
              </div>
              {l.achou === true && <p className="flex items-start gap-1.5 text-sm text-success"><CircleCheck className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{l.descricao}{l.lembrado && " · código lembrado"}</span></p>}
              {l.achou === false && (
                <p className="flex items-start gap-1.5 text-sm text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> Não achei este código no Bling. Corrija e confira de novo.
                </p>
              )}
              {sugerirLembrar && (
                <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={l.lembrar} onCheckedChange={(c) => setLinhas((atual) => atual.map((x) => (x.id === l.id ? { ...x, lembrar: c === true } : x)))} aria-label={`Lembrar o código da linha ${n + 1} para as próximas`} />
                  Lembrar para as próximas ({l.sku} → {l.codigo.trim() || "…"})
                </label>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="toque" disabled={!!ocupado} onClick={() => { setConferencia(null); setLinhas((atual) => [...atual, nova()]) }}>
          <Plus /> Adicionar peça
        </Button>
        <Button variant="outline" size="toque" disabled={!!ocupado} onClick={() => setColando((v) => !v)}>
          <ClipboardPaste /> Colar lista
        </Button>
      </div>
      {colando && (
        <div className="flex flex-col gap-2">
          <Textarea aria-label="Lista de peças" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"AN-001 x2\nBR-014 3\n2 CO-020"} />
          <Button size="toque" className="w-full sm:w-fit" disabled={!texto.trim()} onClick={colar}>Adicionar à lista</Button>
        </div>
      )}

      {conferencia?.ja_gerado && (
        <Alert aria-label="Pedido já gerado">
          <TriangleAlert />
          <AlertTitle>Este pedido já foi gerado no Bling</AlertTitle>
          <AlertDescription>Nº {conferencia.ja_gerado.numero ?? conferencia.ja_gerado.bling_id}, em {quando(conferencia.ja_gerado.criado_em)}. Para gerar outro, confirme na próxima tela.</AlertDescription>
        </Alert>
      )}
      {/* Na janela do pedido os botões ficam sempre à vista, no pé da rolagem. */}
      <div className={cn("flex flex-col gap-2", fixarAcoes && "sticky bottom-0 z-10 -mx-4 -mb-4 border-t bg-popover px-4 py-3")}>
        {conferencia && !faltando && <p className="text-sm font-medium tabular-nums" aria-label="Total no Bling">Total no Bling: {reais(conferencia.total)}</p>}
        {conferencia && faltando && <p className="text-sm text-destructive">Corrija os códigos em destaque e confira de novo.</p>}
        {!conferencia && linhas.length > 0 && <p className="text-xs text-muted-foreground">Confira no Bling para ver o preço de cada peça e liberar o botão de gerar.</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant={conferencia ? "outline" : "default"} size="xl" className="w-full sm:w-fit" disabled={!linhasValidas || !!ocupado} onClick={conferir}>
            {ocupado === "conferir" ? <Spinner /> : <RefreshCw />} Conferir no Bling
          </Button>
          <Button size="xl" className="w-full sm:w-fit" disabled={!podeGerar} onClick={() => { setRepetir(false); setConfirmando(true) }}>
            <Send /> Gerar pedido no Bling
          </Button>
        </div>
      </div>

      <Dialog open={confirmando} onOpenChange={(a) => !ocupado && setConfirmando(a)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar o pedido no Bling?</DialogTitle>
            <DialogDescription>Confira antes de enviar para a LR.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="font-medium">{situacao?.contatoNome ?? "—"}</dd>
            <dt className="text-muted-foreground">Peças</dt>
            <dd className="font-medium tabular-nums">{pecas} em {linhas.length} {linhas.length === 1 ? "linha" : "linhas"}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">{conferencia ? reais(conferencia.total) : "—"}</dd>
          </dl>
          {conferencia?.ja_gerado && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={repetir} onCheckedChange={(c) => setRepetir(c === true)} aria-label="Gerar mais um pedido mesmo assim" />
              <span>Este pedido já foi gerado (nº {conferencia.ja_gerado.numero ?? conferencia.ja_gerado.bling_id}). Gerar mais um mesmo assim.</span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" size="toque" disabled={ocupado === "gerar"} onClick={() => setConfirmando(false)}>Voltar</Button>
            <Button size="toque" disabled={ocupado === "gerar" || (!!conferencia?.ja_gerado && !repetir)} onClick={gerar}>
              {ocupado === "gerar" ? <Spinner /> : <Send />} Gerar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
