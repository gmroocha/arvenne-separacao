import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, ChevronUp, Copy, MessageCircle, PackageSearch, RefreshCw, TriangleAlert, X } from "lucide-react"
import { BuscaPecas } from "@/components/BuscaPecas"
import Foto from "@/components/Foto"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"
import { msg, useCategorias, useCriarTroca, useEnviarTroca, useOpcaoTroca, useSugestoes, useTroca, useValorPago, type PedidoDetalhe } from "@/lib/api"
import { mensagemTroca } from "@/lib/agente"
import { linkWhatsApp, reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import { textoSituacao, valorDaOpcao } from "@/lib/trocaTexto"
import type { CategoriaCatalogo, Item, NovoItem, Sugestao, Troca, TrocaOpcao, TrocaPeca, ValorPago } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  pedido: PedidoDetalhe
  // Todas as peças em falta (ou com defeito, que na tela vale como falta) do pedido: uma troca, um link.
  itens: Item[]
  // Peça que abre selecionada.
  inicial?: string
}

type Aba = "variantes" | "preco" | "buscar"
type Faixa = "20" | "40" | "qualquer"
const FAIXAS: Record<Faixa, number | null> = { "20": 0.2, "40": 0.4, qualquer: null }

const opcaoIgual = (o: TrocaOpcao, n: NovoItem) =>
  o.shopify_variant_id != null ? o.shopify_variant_id === n.shopify_variant_id : o.peca_clube_id != null && o.peca_clube_id === n.peca_clube_id

const doSugestao = (s: Sugestao): NovoItem => ({
  chave: `sug-${s.variant_id}`,
  origem: "shopify",
  shopify_variant_id: s.variant_id,
  peca_clube_id: null,
  sku: s.sku,
  nome: s.produto,
  variante: s.variante,
  foto_url: s.foto_url,
  qtd: 1,
  preco: s.preco,
})

// Primeira palavra do nome (Anel, Brinco, Colar...), igual ao filtro do banco.
const categoriaDe = (nome: string) => nome.trim().split(/\s+/)[0]?.toUpperCase() ?? ""

// Diferença já calculada no banco (só inverte o sinal para o texto).
function Diferenca({ s }: { s: Sugestao }) {
  if (s.situacao === "paga_diferenca") return <span className="text-xs font-medium text-amber-700 tabular-nums dark:text-amber-400">+{reais(s.diferenca)} a pagar</span>
  if (s.situacao === "credito") return <span className="text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-400">{reais(-s.diferenca)} de crédito</span>
  return <span className="text-xs text-muted-foreground">mesmo valor</span>
}

function CartaoSugestao({ s, marcada, aoTocar }: { s: Sugestao; marcada: boolean; aoTocar: (s: Sugestao) => void }) {
  const cheioDiferente = s.preco != null && s.preco !== s.preco_cliente
  return (
    <button
      type="button"
      aria-pressed={marcada}
      onClick={() => aoTocar(s)}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-1.5 text-left transition-colors hover:bg-muted/50",
        marcada && "border-primary bg-primary/5",
      )}
    >
      <div className="relative">
        <Foto url={fotoTamanho(s.foto_url, 300)} alt={s.produto} className="w-full" />
        {marcada && (
          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
        <span className="font-mono text-sm leading-tight font-semibold break-all">{s.sku ?? "sem código"}</span>
        <span className="text-sm leading-tight">{s.variante ?? "sem variante"}</span>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-base leading-tight font-semibold tabular-nums">{reais(s.preco_cliente)}</span>
          {cheioDiferente && <span className="text-xs text-muted-foreground tabular-nums line-through">{reais(s.preco)}</span>}
        </div>
        <Diferenca s={s} />
      </div>
    </button>
  )
}

// p-1 dá folga para a borda do cartão não ser cortada pelo contêiner rolável.
function GradeSugestoes({ sugestoes, selecionada, aoTocar }: { sugestoes: Sugestao[]; selecionada: (n: NovoItem) => boolean; aoTocar: (n: NovoItem) => void }) {
  const tocar = (s: Sugestao) => aoTocar(doSugestao(s))
  return (
    <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
      {sugestoes.map((s) => (
        <CartaoSugestao key={s.variant_id} s={s} marcada={selecionada(doSugestao(s))} aoTocar={tocar} />
      ))}
    </div>
  )
}

// Seletor das peças em falta (topo): cartões retangulares, coerentes com os demais.
function ChipsPecas({ itens, troca, atualId, aoEscolher }: { itens: Item[]; troca: Troca | undefined; atualId: string | undefined; aoEscolher: (id: string) => void }) {
  return (
    <div className="sem-barra flex min-w-0 gap-2 overflow-x-auto p-1" role="tablist" aria-label="Peças em falta">
      {itens.map((i) => {
        const atual = i.id === atualId
        const tem = (troca?.pecas.find((x) => x.item_id === i.id)?.opcoes.length ?? 0) > 0
        return (
          <button
            key={i.id}
            type="button"
            role="tab"
            aria-selected={atual}
            onClick={() => aoEscolher(i.id)}
            className={cn("flex shrink-0 items-center gap-2 rounded-lg border bg-card p-1.5 pr-3 text-left text-xs transition-colors", atual && "border-primary bg-primary/5")}
          >
            <span className="relative">
              <Foto url={fotoTamanho(i.foto_url, 100)} alt={i.nome} className="size-10" />
              {tem && (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="size-3" />
                </span>
              )}
            </span>
            <span className="font-mono font-semibold">{i.sku ?? "sem código"}</span>
          </button>
        )
      })}
    </div>
  )
}

// Peça em falta: foto, código, variante e o que a cliente pagou (valores do banco).
function CabecalhoPeca({ item, pago }: { item: Item; pago: ValorPago | null | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border p-2.5">
      <Foto url={fotoTamanho(item.foto_url, 300)} alt={item.nome} ampliar className="size-16 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-base leading-tight font-semibold break-all">{item.sku ?? "sem código"}</span>
        {item.variante && <span className="text-sm leading-tight">{item.variante}</span>}
        <span className="line-clamp-1 text-xs text-muted-foreground">{item.nome}</span>
        {pago && (
          <span className="text-sm tabular-nums">
            Cliente pagou {reais(pago.valor_pago)}
            {pago.qtd > 1 && <span className="text-muted-foreground"> ({reais(pago.valor_pago_unit)} cada)</span>}
          </span>
        )}
      </div>
    </div>
  )
}

// Filtros do "Preço parecido": categoria (Select) e faixa (segmentado, com estado ativo bem marcado).
function FiltroPreco({
  categorias,
  carregando,
  categoria,
  aoCategoria,
  faixa,
  aoFaixa,
  unitario,
}: {
  categorias: CategoriaCatalogo[]
  carregando: boolean
  categoria: string
  aoCategoria: (c: string) => void
  faixa: Faixa
  aoFaixa: (f: Faixa) => void
  unitario: number | undefined
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Categoria</Label>
        <Select value={categoria || "todas"} onValueChange={(v) => aoCategoria(v === "todas" ? "" : v)} disabled={carregando}>
          <SelectTrigger className="h-10 w-full sm:w-64" aria-label="Categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.categoria} value={c.categoria} className="capitalize">
                {c.categoria.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Faixa de preço</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={faixa}
          onValueChange={(v) => v && aoFaixa(v as Faixa)}
          className="w-full sm:w-auto"
          aria-label="Faixa de preço"
        >
          {(["20", "40", "qualquer"] as Faixa[]).map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className="h-10 flex-1 px-4 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none"
            >
              {f === "qualquer" ? "Qualquer" : `Até ${f}%`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {unitario != null && faixa !== "qualquer" && (
          <p className="text-xs text-muted-foreground">Perto de {reais(unitario)}, o que a cliente pagou por unidade</p>
        )}
      </div>
    </div>
  )
}

// Opções já escolhidas, agrupadas por peça em falta.
function PainelOpcoes({ itens, troca, aoRemover }: { itens: Item[]; troca: Troca | undefined; aoRemover: (o: TrocaOpcao) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {itens.map((item) => {
        const peca = troca?.pecas.find((p) => p.item_id === item.id)
        const opcoes = peca?.opcoes ?? []
        return (
          <section key={item.id} className="flex min-w-0 flex-col gap-2" aria-label={item.sku ?? item.nome}>
            <div className="flex min-w-0 items-baseline gap-2">
              <h4 className="truncate font-mono text-sm font-semibold">{item.sku ?? "sem código"}</h4>
              <span className="truncate text-xs text-muted-foreground">{item.variante ?? item.nome}</span>
            </div>
            {opcoes.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhuma opção ainda.</p>
            ) : (
              opcoes.map((o) => (
                <div key={o.id} className="flex min-w-0 items-center gap-2 rounded-lg border p-1.5">
                  <Foto url={fotoTamanho(o.foto_url, 200)} alt={o.nome} className="size-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-semibold">{o.sku ?? "sem código"}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.variante ?? o.nome}</div>
                    <div className="truncate text-xs font-medium">{peca ? textoSituacao(valorDaOpcao(peca, o)) : ""}</div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Tirar opção" onClick={() => aoRemover(o)}>
                    <X />
                  </Button>
                </div>
              ))
            )}
          </section>
        )
      })}
    </div>
  )
}

// Troca de peças em falta: a equipe monta as opções de cada peça e manda UM link para a cliente.
export default function TrocaDialog({ aberto, aoMudar, pedido, itens, inicial }: Props) {
  const celular = useIsMobile()
  const trocaQ = useTroca(pedido.id)
  const troca = trocaQ.data ?? undefined
  const criar = useCriarTroca()
  const { adicionar, remover } = useOpcaoTroca(pedido.id)
  const enviar = useEnviarTroca()
  const categorias = useCategorias(aberto)

  const [itemId, setItemId] = useState(inicial ?? itens[0]?.id ?? "")
  const [aba, setAba] = useState<Aba>("variantes")
  const [catEscolhida, setCatEscolhida] = useState<Record<string, string>>({}) // "" = todas
  const [faixa, setFaixa] = useState<Faixa>("20")
  const [verOpcoes, setVerOpcoes] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Cada abertura começa limpa: na peça clicada, na aba de variantes e com o resumo fechado.
  // (Ajuste durante a renderização, sem efeito: evita um quadro com o estado velho.)
  const [estavaAberto, setEstavaAberto] = useState(aberto)
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto)
    if (aberto) {
      setItemId(inicial ?? "")
      setAba("variantes")
      setVerOpcoes(false)
    }
  }

  // Peças em falta que fazem parte da troca (as já fechadas saem).
  const ativos = itens.filter((i) => {
    const p = troca?.pecas.find((x) => x.item_id === i.id)
    return !p || !p.concluida_em
  })
  const item = ativos.find((i) => i.id === itemId) ?? ativos[0]
  const peca: TrocaPeca | undefined = item ? troca?.pecas.find((p) => p.item_id === item.id) : undefined

  // Garante a troca e uma peça para cada item em falta, uma vez por conjunto de itens.
  const chaveItens = itens.map((i) => i.id).sort().join(",")
  const criou = useRef<string | null>(null)
  const { mutate: criarTroca, isPending: criando } = criar
  const faltaPeca = !!troca && itens.some((i) => !troca.pecas.some((p) => p.item_id === i.id))
  useEffect(() => {
    if (!aberto) {
      criou.current = null
      return
    }
    if (!trocaQ.isSuccess || criando || criou.current === chaveItens) return
    if (troca && !faltaPeca) return
    criou.current = chaveItens
    criarTroca({ pedidoId: pedido.id, itemIds: itens.map((i) => i.id) })
  }, [aberto, trocaQ.isSuccess, troca, faltaPeca, criando, criarTroca, chaveItens, pedido.id, itens])

  const erroTroca = trocaQ.isError || criar.isError
  const pronta = !!troca && !faltaPeca
  function tentarDeNovo() {
    if (trocaQ.isError) {
      trocaQ.refetch()
      return
    }
    criou.current = chaveItens
    criarTroca({ pedidoId: pedido.id, itemIds: itens.map((i) => i.id) })
  }

  // Filtros da aba "Preço parecido": categoria (padrão = a da peça) e faixa em volta do valor pago por unidade.
  // As contas (valor pago, preço da cliente, diferença) são do banco.
  const pagoQ = useValorPago(pronta ? item?.id : undefined)
  const categoriaPadrao = item ? categoriaDe(item.nome) : ""
  const listaCats = categorias.data ?? []
  const categoria = item ? (catEscolhida[item.id] ?? (listaCats.some((c) => c.categoria === categoriaPadrao) ? categoriaPadrao : "")) : ""
  // No modo "Preço parecido" espera as categorias chegarem, para não buscar "todas" e depois buscar de novo.
  const ativa = aberto && pronta && aba !== "buscar" && (aba !== "preco" || !categorias.isPending)
  const sug = useSugestoes(item?.id, aba === "preco" ? "preco" : "variantes", { categoria: categoria || null, faixa: FAIXAS[faixa] }, ativa)

  const opcoes = peca?.opcoes ?? []
  const selecionada = (n: NovoItem) => opcoes.some((o) => opcaoIgual(o, n))

  function alternar(n: NovoItem, motivo: TrocaOpcao["motivo"]) {
    if (!peca) return
    const existente = opcoes.find((o) => opcaoIgual(o, n))
    if (existente) {
      if (!existente.id.startsWith("tmp-")) remover.mutate({ opcaoId: existente.id })
    } else adicionar.mutate({ trocaPecaId: peca.id, opcao: n, motivo })
  }

  const pecasAtivas = ativos.map((i) => troca?.pecas.find((p) => p.item_id === i.id))
  const todasComOpcao = pronta && pecasAtivas.length > 0 && pecasAtivas.every((p) => p && p.opcoes.length > 0 && !p.opcoes.some((o) => o.id.startsWith("tmp-")))
  const faltamOpcao = ativos.filter((i) => (troca?.pecas.find((p) => p.item_id === i.id)?.opcoes.length ?? 0) === 0)
  const bloqueado = !todasComOpcao || enviando

  const link = troca ? `${window.location.origin}/t/${troca.token}` : ""
  const credito = troca?.resumo ? reais(troca.resumo.total_pago) : null
  const texto = troca ? mensagemTroca(pedido, ativos, link, credito) : ""
  const wa = linkWhatsApp(pedido.cliente_telefone, texto)

  async function copiar() {
    if (!troca) return
    setEnviando(true)
    // O copiar começa antes do await, ainda no toque (o navegador exige).
    const copia = navigator.clipboard.writeText(texto).then(() => true, () => false)
    try {
      await enviar.mutateAsync({ troca })
      if (await copia) toast.success("Mensagem copiada. Cole no WhatsApp da cliente.")
      else toast.error("A troca foi salva, mas não foi possível copiar a mensagem")
      aoMudar(false)
    } catch {
      // o erro do envio já aparece no aviso do próprio hook
    } finally {
      setEnviando(false)
    }
  }

  async function enviarWhatsApp() {
    if (!troca || !wa) return
    setEnviando(true)
    // Abre a aba já no toque (celular bloqueia janela aberta depois de esperar).
    const aba = window.open("about:blank", "_blank")
    try {
      await enviar.mutateAsync({ troca })
      if (aba) aba.location.href = wa
      else window.open(wa, "_blank")
      toast.success("Troca enviada")
      aoMudar(false)
    } catch {
      aba?.close()
    } finally {
      setEnviando(false)
    }
  }

  const resumo = (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="font-medium">
        {ativos.length} {ativos.length === 1 ? "peça em falta" : "peças em falta"}
      </div>
      {troca?.resumo && <div className="text-muted-foreground tabular-nums">Cliente pagou {reais(troca.resumo.total_pago)} nelas</div>}
      {pronta && faltamOpcao.length > 0 && (
        <div className="text-xs text-muted-foreground">Falta escolher opções de: {faltamOpcao.map((i) => i.sku ?? i.nome).join(", ")}</div>
      )}
    </div>
  )

  // Celular: empilhados e de largura cheia. PC: em linha, à direita, do tamanho do texto.
  const botoes = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" className="h-10 w-full text-sm sm:w-auto" disabled={bloqueado} onClick={copiar}>
        {enviando ? <Spinner /> : <Copy />} Copiar mensagem
      </Button>
      <Button className="h-10 w-full text-sm sm:w-auto" disabled={bloqueado || !wa} onClick={enviarWhatsApp}>
        <MessageCircle /> Enviar no WhatsApp
      </Button>
    </div>
  )

  const tentarSug = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      Não foi possível carregar as sugestões.
      <Button variant="outline" className="h-10" onClick={() => sug.refetch()}>
        <RefreshCw /> Tentar de novo
      </Button>
    </div>
  )

  const grade = (
    <>
      {sug.isError && !sug.data && tentarSug}
      {sug.isPending && !sug.isError && (
        <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3" aria-label="Carregando sugestões">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      )}
      {sug.data && sug.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {aba === "variantes"
            ? "Este produto não tem outras variantes. Veja \"Preço parecido\" ou \"Buscar\"."
            : "Nenhuma peça nesta faixa. Mude a categoria ou a faixa de preço."}
        </p>
      )}
      {sug.data && sug.data.length > 0 && (
        <div className={cn("transition-opacity", sug.isPlaceholderData && "pointer-events-none opacity-50")}>
          <GradeSugestoes sugestoes={sug.data} selecionada={selecionada} aoTocar={(n) => alternar(n, aba === "preco" ? "mesmo_valor" : "mesmo_modelo")} />
        </div>
      )}
      {sug.isError && sug.data && tentarSug}
    </>
  )

  const filtrosPreco = aba === "preco" && item && (
    <FiltroPreco
      categorias={listaCats}
      carregando={categorias.isPending}
      categoria={categoria}
      aoCategoria={(c) => setCatEscolhida((x) => ({ ...x, [item.id]: c }))}
      faixa={faixa}
      aoFaixa={setFaixa}
      unitario={pagoQ.data?.valor_pago_unit}
    />
  )

  const conteudo = (
    <div className="flex min-w-0 flex-col gap-4">
      {erroTroca && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 shrink-0" /> Não foi possível montar a troca. Tente de novo.
          </div>
          <p className="text-xs break-words opacity-80">{msg(trocaQ.error ?? criar.error)}</p>
          <Button variant="outline" className="h-10 w-fit bg-background text-foreground" disabled={criando || trocaQ.isFetching} onClick={tentarDeNovo}>
            {criando || trocaQ.isFetching ? <Spinner /> : <RefreshCw />} Tentar de novo
          </Button>
        </div>
      )}
      {!erroTroca && !pronta && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Montando a troca…
        </div>
      )}
      {ativos.length === 0 && pronta && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Todas as peças desta troca já foram resolvidas.</p>
      )}
      {pronta && item && (
        <>
          <ChipsPecas itens={ativos} troca={troca} atualId={item.id} aoEscolher={setItemId} />
          <CabecalhoPeca item={item} pago={pagoQ.data} />
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <TabsList className="w-full">
              <TabsTrigger value="variantes">Variantes</TabsTrigger>
              <TabsTrigger value="preco">Preço parecido</TabsTrigger>
              <TabsTrigger value="buscar">Buscar</TabsTrigger>
            </TabsList>
          </Tabs>
          {filtrosPreco}
          {aba === "buscar" ? (
            aberto && <BuscaPecas aoEscolher={(n) => alternar(n, "busca")} selecionada={selecionada} notaPreco="valor com desconto aparece ao escolher" />
          ) : (
            <div className="flex min-w-0 flex-col gap-3">{grade}</div>
          )}
        </>
      )}
    </div>
  )

  const painel = <PainelOpcoes itens={ativos} troca={troca} aoRemover={(o) => !o.id.startsWith("tmp-") && remover.mutate({ opcaoId: o.id })} />
  const totalOpcoes = pecasAtivas.reduce((n, p) => n + (p?.opcoes.length ?? 0), 0)
  const rotuloOpcoes = `${totalOpcoes} ${totalOpcoes === 1 ? "opção escolhida" : "opções escolhidas"}`

  return (
    <RespDialog
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Troca de peças em falta"
      descricao="Escolha as opções de cada peça e envie um link só para a cliente"
      largo
    >
      {celular ? (
        <div className="flex min-w-0 flex-col gap-3">
          {conteudo}
          <Collapsible open={verOpcoes} onOpenChange={setVerOpcoes} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3">
            <CollapsibleContent className="max-h-[40svh] overflow-y-auto pb-3">
              <div className="flex flex-col gap-3">
                {painel}
                {resumo}
              </div>
            </CollapsibleContent>
            <div className="flex flex-col gap-2 pb-1">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-10 justify-between" disabled={!pronta}>
                  {rotuloOpcoes}
                  <ChevronUp className={verOpcoes ? "rotate-180" : ""} />
                </Button>
              </CollapsibleTrigger>
              {botoes}
            </div>
          </Collapsible>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid h-[calc(min(90svh,780px)-14rem)] grid-cols-[minmax(0,1fr)_minmax(0,19rem)] gap-6">
            <div className="min-h-0 min-w-0 overflow-y-auto p-1">{conteudo}</div>
            <div className="flex min-h-0 min-w-0 flex-col gap-3 border-l pl-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PackageSearch className="size-4" /> Opções <span className="font-normal text-muted-foreground">({rotuloOpcoes})</span>
              </h3>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">{painel}</div>
              {resumo}
            </div>
          </div>
          <div className="border-t pt-4">{botoes}</div>
        </div>
      )}
    </RespDialog>
  )
}
