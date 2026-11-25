import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import EditorVariantes from "@/components/clube/EditorVariantes"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useSalvarModeloClube, type CatalogoClube, type ItemModeloClube } from "@/lib/api"
import { enviarEmParalelo, errosDoProduto, novaLinhaVariante, variantesParaSalvar, type LinhaVariante } from "@/lib/clubeModelos"
import { enviarFoto } from "@/lib/foto"
import { hojeISO, lerNumero } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Uma linha por foto: sobe a foto (no máximo 3 por vez) e a pessoa preenche código, nome, preço e, se quiser, as variantes.
type Linha = {
  chave: string
  arquivo: File
  previa: string
  foto: "enviando" | "ok" | "erro"
  fotoUrl: string | null
  erroFoto: string | null
  codigo: string
  nome: string
  preco: string
  comVariantes: boolean
  variantes: LinhaVariante[]
  mostrarErros: boolean
  erroBanco: string | null
}

const novaLinha = (arquivo: File): Linha => ({
  chave: crypto.randomUUID(), arquivo, previa: URL.createObjectURL(arquivo), foto: "enviando", fotoUrl: null, erroFoto: null,
  codigo: "", nome: "", preco: "", comVariantes: false, variantes: [novaLinhaVariante([{ tipo: "tamanho", valor: "" }])], mostrarErros: false, erroBanco: null,
})

const textoErro = (e: unknown) => (e instanceof Error ? e.message : "erro desconhecido")

// Cadastro em massa do Clube: várias fotos de uma vez, cada uma vira uma linha para preencher, e "Salvar todas" grava tudo numa
// chamada só (salvar_modelo_clube): se uma linha tem problema, nada fica salvo e a linha aparece marcada.
// Na Live ("catalogo" = 'live'), todas as linhas levam a mesma data da live (liveInicial ou hoje, editável).
export default function ClubeEmMassa({ aoSalvar, catalogo = "clube", liveInicial }: { aoSalvar: () => void; catalogo?: CatalogoClube; liveInicial?: string }) {
  const naLive = catalogo === "live"
  const [liveEm, setLiveEm] = useState(() => liveInicial ?? hojeISO())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const salvar = useSalvarModeloClube()
  const entrada = useRef<HTMLInputElement>(null)
  const previas = useRef<string[]>([])
  const mudar = (chave: string, parcial: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)))

  useEffect(() => () => previas.current.forEach((u) => URL.revokeObjectURL(u)), [])

  async function subir(novas: Linha[]) {
    await enviarEmParalelo(
      novas,
      (l) => enviarFoto(l.arquivo),
      {
        limite: 3,
        aoMudar: (i, estado, resultado) => {
          const chave = novas[i].chave
          if (estado === "enviando") mudar(chave, { foto: "enviando", erroFoto: null })
          else if (resultado?.ok) mudar(chave, { foto: "ok", fotoUrl: resultado.valor })
          else mudar(chave, { foto: "erro", erroFoto: resultado && !resultado.ok ? textoErro(resultado.erro) : "erro desconhecido" })
        },
      },
    )
  }

  function escolher(arquivos: FileList | null) {
    const lista = [...(arquivos ?? [])].filter((a) => a.type.startsWith("image/"))
    if (entrada.current) entrada.current.value = ""
    if (lista.length === 0) return
    const novas = lista.map(novaLinha)
    previas.current.push(...novas.map((l) => l.previa))
    setLinhas((ls) => [...ls, ...novas])
    void subir(novas)
  }

  function tentarDeNovo(l: Linha) {
    void subir([l])
  }

  function remover(l: Linha) {
    URL.revokeObjectURL(l.previa)
    setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))
  }

  const enviadas = linhas.filter((l) => l.foto === "ok").length
  const enviando = linhas.some((l) => l.foto === "enviando")
  const comErroDeFoto = linhas.some((l) => l.foto === "erro")

  async function salvarTodas() {
    const erros = linhas.map((l) => errosDoProduto({ codigo: l.codigo, nome: l.nome, preco: l.preco, linhas: l.comVariantes ? l.variantes : [] }))
    if (erros.some((e) => e.length > 0)) {
      setLinhas((ls) => ls.map((l, i) => ({ ...l, mostrarErros: erros[i].length > 0, erroBanco: null })))
      const n = erros.filter((e) => e.length > 0).length
      return void toast.error(`${n} ${n === 1 ? "linha precisa" : "linhas precisam"} de ajuste. Veja os avisos em vermelho.`)
    }
    if (naLive && !liveEm) return void toast.error("Informe a data da live")
    const itens: ItemModeloClube[] = linhas.map((l) => {
      const preco = l.preco.trim() ? lerNumero(l.preco) : null
      const base = { codigo: l.codigo.trim(), nome: l.nome.trim(), preco, foto_url: l.fotoUrl, ...(naLive ? { catalogo, live_em: liveEm } : {}) }
      return l.comVariantes && l.variantes.length > 0 ? { ...base, variantes: variantesParaSalvar(l.codigo, l.variantes) } : base
    })
    try {
      await salvar.mutateAsync(itens)
      toast.success(`${itens.length} ${itens.length === 1 ? "peça salva" : "peças salvas"} ${naLive ? "na Live" : "no Clube"}`)
      linhas.forEach((l) => URL.revokeObjectURL(l.previa))
      setLinhas([])
      aoSalvar()
    } catch (e) {
      // "Linha 3: informe o nome": marca a linha. Nada foi salvo.
      const msg = textoErro(e)
      const n = Number(msg.match(/^Linha (\d+):/)?.[1])
      setLinhas((ls) => ls.map((l, i) => ({ ...l, erroBanco: n === i + 1 ? msg : null, mostrarErros: n === i + 1 })))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input ref={entrada} type="file" accept="image/*" multiple className="sr-only" aria-label="Escolher fotos" onChange={(e) => escolher(e.target.files)} />
      {naLive && (
        <Field className="max-w-48">
          <FieldLabel htmlFor="massa-live-em">Data da live</FieldLabel>
          <Input id="massa-live-em" type="date" required value={liveEm} onChange={(e) => setLiveEm(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={linhas.length ? "outline" : "default"} size="toque" onClick={() => entrada.current?.click()}>
          <ImagePlus /> {linhas.length ? "Adicionar mais fotos" : "Escolher fotos"}
        </Button>
        {linhas.length > 0 && (
          <div className="flex min-w-48 flex-1 flex-col gap-1" role="status" aria-live="polite">
            <span className="text-sm text-muted-foreground tabular-nums">
              {enviando ? `Enviando fotos: ${enviadas} de ${linhas.length}` : comErroDeFoto ? `${enviadas} de ${linhas.length} fotos enviadas` : `${linhas.length} ${linhas.length === 1 ? "foto enviada" : "fotos enviadas"}`}
            </span>
            <Progress aria-label="Fotos enviadas" value={(enviadas / linhas.length) * 100} />
          </div>
        )}
      </div>
      {linhas.length === 0 && <p className="text-sm text-muted-foreground">Escolha as fotos das peças novas: cada foto vira uma linha para preencher código, nome e preço. Se a peça tem tamanhos ou cores, ligue "Com variantes".</p>}

      <ul className="flex flex-col gap-3">
        {linhas.map((l, n) => {
          const erros = l.mostrarErros ? errosDoProduto({ codigo: l.codigo, nome: l.nome, preco: l.preco, linhas: l.comVariantes ? l.variantes : [] }) : []
          const problema = erros.length > 0 || !!l.erroBanco
          return (
            <li key={l.chave} className={cn("flex flex-col gap-3 rounded-lg border p-3", problema && "border-destructive/60")} aria-label={`Linha ${n + 1}`}>
              <div className="flex gap-3">
                <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  <img src={l.previa} alt={`Foto ${n + 1}`} className="size-full object-cover" />
                  {l.foto === "enviando" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Spinner />
                    </div>
                  )}
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`mc-${l.chave}`}>Código</FieldLabel>
                    <Input id={`mc-${l.chave}`} aria-label={`Linha ${n + 1}: Código`} value={l.codigo} onChange={(e) => mudar(l.chave, { codigo: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`mp-${l.chave}`}>Preço</FieldLabel>
                    <CampoReais id={`mp-${l.chave}`} aria-label={`Linha ${n + 1}: Preço`} value={l.preco} onValueChange={(preco) => mudar(l.chave, { preco })} />
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={`mn-${l.chave}`}>Nome</FieldLabel>
                    <Input id={`mn-${l.chave}`} aria-label={`Linha ${n + 1}: Nome`} value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} />
                  </Field>
                </div>
              </div>
              {l.foto === "erro" && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
                  <span>Não foi possível enviar a foto: {l.erroFoto}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => tentarDeNovo(l)}>
                    <RefreshCw /> Tentar de novo
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch size="default" checked={l.comVariantes} onCheckedChange={(comVariantes) => mudar(l.chave, { comVariantes })} aria-label={`Linha ${n + 1}: Com variantes`} />
                  Com variantes
                </label>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remover(l)}>
                  <Trash2 /> Remover linha
                </Button>
              </div>
              {l.comVariantes && (
                <EditorVariantes base={l.codigo} linhas={l.variantes} aoMudar={(variantes) => mudar(l.chave, { variantes })} mostrarErros={l.mostrarErros} precoBase={l.preco} prefixo={`Linha ${n + 1}: variante`} />
              )}
              {problema && (
                <ul role="alert" className="list-disc pl-5 text-xs text-destructive">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {l.erroBanco && <li>{l.erroBanco}</li>}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {linhas.length > 0 && (
        <Button type="button" size="xl" disabled={enviando || comErroDeFoto || salvar.isPending} onClick={() => void salvarTodas()}>
          {(salvar.isPending || enviando) && <Spinner />} Salvar todas ({linhas.length})
        </Button>
      )}
      {comErroDeFoto && <p className="text-xs text-muted-foreground">Tente enviar de novo as fotos com erro ou remova essas linhas para poder salvar.</p>}
    </div>
  )
}
