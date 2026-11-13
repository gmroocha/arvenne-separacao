import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Vazio } from "@/components/comum/Vazio"
import { Check, ChevronUp, Copy, ExternalLink, HandCoins, Link2, PackageSearch, RefreshCw, TriangleAlert, X } from "lucide-react"
import { AreaRolavel } from "@/components/comum/AreaRolavel"
import CampoReais from "@/components/CampoReais"
import { BuscaPecas } from "@/components/BuscaPecas"
import CartaoCatalogo from "@/components/catalogo/CartaoCatalogo"
import { MarcaCheck, SeloFoto } from "@/components/comum/Bolha"
import Foto from "@/components/Foto"
import RespDialog from "@/components/RespDialog"
import ConfirmarTroca from "@/components/pedido/ConfirmarTroca"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useIsMobile } from "@/hooks/use-mobile"
import { msg, useAprovarCarrinho, useAprovarTroca, useCategorias, useCobrirTroca, useCriarTroca, useEnviarTroca, useAtualizacaoAutomaticaCatalogo, useOpcaoTroca, useSugestoes, useTroca, useValorPago, type PedidoDetalhe } from "@/lib/api"
import { mensagemTroca } from "@/lib/agente"
import { numeroParaTexto, reais } from "@/lib/formato"
import { chaveModelo, codigoDoModelo, numeroTamanho, separarTamanho } from "@/lib/variante"
import { fotoTamanho } from "@/lib/foto"
import { COR_TEXTO_AVISO } from "@/lib/selo"
import { COBRIR_TUDO, cobreTudo, listaEscolhida, rotuloPagamento, textoSituacao, valorDaOpcao } from "@/lib/trocaTexto"
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

// "ANEL" -> "Anel" (o banco guarda em maiúsculas; o valor do filtro continua o original).
const rotuloCategoria = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : c)

// Diferença já calculada no banco (só inverte o sinal para o texto).
function Diferenca({ s }: { s: Sugestao }) {
  // A loja cobre (parte da) diferença: o rótulo mostra o que a Arvenne cobre e o que sobra para a cliente.
  if (s.situacao === "paga_diferenca" && (s.coberto_previsto ?? 0) > 0)
    return (
      <span className={cn("text-xs font-medium tabular-nums", (s.cliente_paga_previsto ?? 0) > 0 ? "text-warning" : "text-success")}>
        {rotuloPagamento({ diferenca: s.diferenca, coberto: s.coberto_previsto, clientePaga: s.cliente_paga_previsto })}
      </span>
    )
  if (s.situacao === "paga_diferenca") return <span className="text-xs font-medium text-warning tabular-nums">+{reais(s.diferenca)} a pagar</span>
  if (s.situacao === "credito") return <span className="text-xs font-medium text-success tabular-nums">{reais(-s.diferenca)} de crédito</span>
  return <span className="text-xs text-muted-foreground">mesmo valor</span>
}

// Cartão de uma variante sem tamanho (cor, pedra, mm): uma foto por cartão.
const SeloNoPedido = <SeloFoto>No pedido</SeloFoto>

function CartaoSugestao({ s, marcada, aoTocar }: { s: Sugestao; marcada: boolean; aoTocar: (s: Sugestao) => void }) {
  return (
    <CartaoCatalogo
      foto={s.foto_url}
      alt={s.produto}
      codigo={s.sku ?? "sem código"}
      variante={s.variante}
      selecionado={marcada}
      selo={s.no_pedido ? SeloNoPedido : undefined}
      preco={
        <>
          <LinhaPreco s={s} />
          <Diferenca s={s} />
        </>
      }
      acao={{ rotulo: "Oferecer", rotuloMarcado: "Oferecida" }}
      onCard={() => aoTocar(s)}
    />
  )
}

function LinhaPreco({ s }: { s: Sugestao }) {
  const cheioDiferente = s.preco != null && s.preco !== s.preco_cliente
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-base leading-tight font-semibold tabular-nums">{reais(s.preco_cliente)}</span>
      {cheioDiferente && <span className="text-xs text-muted-foreground tabular-nums line-through">{reais(s.preco)}</span>}
    </div>
  )
}

// Variações de tamanho do mesmo produto, mesma pedra/cor e mesmo preço viram UM cartão com seletor de tamanho.
type Grupo = { chave: string; unica?: Sugestao; tamanhos: { s: Sugestao; tamanho: string }[] }

function agrupar(sugestoes: Sugestao[]): Grupo[] {
  const grupos: Grupo[] = []
  const porChave = new Map<string, Grupo>()
  for (const s of sugestoes) {
    const { tamanho } = separarTamanho(s.variante)
    if (!tamanho) {
      grupos.push({ chave: `v-${s.variant_id}`, unica: s, tamanhos: [] })
      continue
    }
    const chave = `${s.produto_id ?? ""}|${chaveModelo(s.produto, s.variante)}|${s.preco_cliente}|${s.preco ?? ""}`
    let g = porChave.get(chave)
    if (!g) {
      g = { chave, tamanhos: [] }
      porChave.set(chave, g)
      grupos.push(g)
    }
    g.tamanhos.push({ s, tamanho })
  }
  for (const g of grupos) g.tamanhos.sort((a, b) => numeroTamanho(a.tamanho) - numeroTamanho(b.tamanho))
  return grupos
}

function CartaoTamanhos({ g, selecionada, aoTocar }: { g: Grupo; selecionada: (s: Sugestao) => boolean; aoTocar: (s: Sugestao) => void }) {
  const primeira = g.tamanhos[0].s
  const { base } = separarTamanho(primeira.variante)
  const porId = new Map(g.tamanhos.map((t) => [String(t.s.variant_id), t.s]))
  return (
    <CartaoCatalogo
      foto={primeira.foto_url}
      alt={primeira.produto}
      codigo={codigoDoModelo(g.tamanhos.map((t) => ({ sku: t.s.sku, tamanho: t.tamanho })))}
      variante={base}
      selecionado={g.tamanhos.some((t) => selecionada(t.s))}
      selo={g.tamanhos.some((t) => t.s.no_pedido) ? SeloNoPedido : undefined}
      preco={
        <>
          <LinhaPreco s={primeira} />
          <Diferenca s={primeira} />
        </>
      }
      chips={g.tamanhos.map(({ s, tamanho }) => ({ id: String(s.variant_id), rotulo: tamanho, selecionado: selecionada(s), tracejado: s.no_pedido, titulo: s.sku ?? undefined }))}
      onChip={(id) => {
        const s = porId.get(id)
        if (s) aoTocar(s)
      }}
    />
  )
}

// p-1 dá folga para a borda do cartão não ser cortada pelo contêiner rolável.
function GradeSugestoes({ sugestoes, selecionada, aoTocar }: { sugestoes: Sugestao[]; selecionada: (n: NovoItem) => boolean; aoTocar: (n: NovoItem) => void }) {
  const tocar = (s: Sugestao) => aoTocar(doSugestao(s))
  const marcada = (s: Sugestao) => selecionada(doSugestao(s))
  return (
    <div className="grid grid-cols-2 gap-4 p-1 sm:grid-cols-3 lg:grid-cols-3">
      {agrupar(sugestoes).map((g) =>
        g.unica ? <CartaoSugestao key={g.chave} s={g.unica} marcada={marcada(g.unica)} aoTocar={tocar} /> : <CartaoTamanhos key={g.chave} g={g} selecionada={marcada} aoTocar={tocar} />,
      )}
    </div>
  )
}

// Seletor das peças em falta (topo): cartões retangulares, coerentes com os demais.
function ChipsPecas({ itens, troca, atualId, aoEscolher }: { itens: Item[]; troca: Troca | undefined; atualId: string | undefined; aoEscolher: (id: string) => void }) {
  return (
    <div className="sem-barra flex min-w-0 gap-2 overflow-x-auto p-1" role="tablist" aria-label="Peças em falta">
      {itens.map((i) => {
        const atual = i.id === atualId
        const peca = troca?.pecas.find((x) => x.item_id === i.id)
        const n = peca?.opcoes.length ?? 0
        // Já resolvida (trocada/crédito) ou já escolhida pela cliente: mostra no seletor, com o visto.
        const estado = peca?.concluida_em
          ? peca.escolha_tipo === "credito" ? "Crédito dado" : "Trocada"
          : peca?.escolha_tipo === "opcao" ? "Cliente escolheu"
          : peca?.escolha_tipo === "credito" ? "Quer crédito"
          : null
        return (
          <button
            key={i.id}
            type="button"
            role="tab"
            aria-selected={atual}
            onClick={() => aoEscolher(i.id)}
            className={cn("flex shrink-0 items-center gap-2 rounded-lg bg-card p-1.5 pr-3 text-left text-xs ring-1 ring-foreground/10 transition-colors", atual && "ring-2 ring-foreground/40")}
          >
            <span className="relative shrink-0">
              <Foto url={fotoTamanho(i.foto_url, 100)} alt={i.nome} className="size-10" />
              {estado && <MarcaCheck solida pequena className="absolute -top-1.5 -right-1.5 size-5 [&>svg]:size-3" />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-mono font-semibold">{i.sku ?? "sem código"}</span>
              {troca && !peca ? (
                <span className="flex items-center gap-1 text-xs leading-none text-muted-foreground" role="status">
                  <Spinner className="size-3" /> preparando
                </span>
              ) : (
                <span className={cn("text-xs leading-none", estado ? "font-medium text-success" : n > 0 ? "text-muted-foreground" : COR_TEXTO_AVISO)}>
                  {estado ?? (n > 0 ? `${n} ${n === 1 ? "opção" : "opções"}` : "sem opção")}
                </span>
              )}
            </span>
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
              <SelectItem key={c.categoria} value={c.categoria}>
                {rotuloCategoria(c.categoria)}
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
              className="h-10 flex-1 px-4 text-sm sm:flex-none"
            >
              {f === "qualquer" ? "Qualquer" : `Até ${f}%`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {unitario != null && faixa !== "qualquer" && (
          <p className="text-xs text-muted-foreground">Perto de {reais(unitario)} por unidade</p>
        )}
      </div>
    </div>
  )
}

// O que a cliente montou no carrinho (troca_escolhas): lista com quantidades, total e diferença (v_troca_carrinho).
function EscolhaCliente({ item, peca, ocupado, tudo, aoAprovar }: { item: Item; peca: TrocaPeca; ocupado: boolean; tudo: boolean; aoAprovar: () => void }) {
  const linhas = (peca.escolhas ?? []).flatMap((e) => {
    const o = peca.opcoes.find((x) => x.id === e.opcao_id)
    return o ? [{ o, qtd: e.qtd }] : []
  })
  if (peca.concluida_em || linhas.length === 0) return null
  const c = peca.carrinho
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-success/5 p-2 ring-1 ring-success/40" aria-label={`Escolha da cliente: ${item.sku ?? item.nome}`}>
      <div className="text-xs font-semibold">Escolha da cliente</div>
      {linhas.map(({ o, qtd }) => (
        <div key={o.id} className="flex min-w-0 items-center gap-2">
          <Foto url={fotoTamanho(o.foto_url, 100)} alt={o.nome} className="size-9 shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate font-mono text-sm font-semibold">{o.sku ?? "sem código"}</div>
            <div className="truncate text-muted-foreground">{o.variante ?? o.nome}</div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{qtd}×</span>
        </div>
      ))}
      {c && (
        <div className="flex flex-col gap-0.5 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Escolhido {reais(c.valor_escolhido)} de {reais(c.valor_pago_item)}
          </span>
          <span className="font-medium">{rotuloPagamento({ diferenca: c.diferenca, coberto: c.coberto_previsto, clientePaga: c.cliente_paga_previsto }, tudo)}</span>
        </div>
      )}
      <Button className="h-9 w-full text-sm" disabled={ocupado || !c} onClick={aoAprovar}>
        <Check /> Aprovar escolha da cliente
      </Button>
    </div>
  )
}

// Opções já escolhidas, agrupadas por peça em falta. Cada opção tem o valor e o botão "Aprovar";
// a peça tem "Dar crédito". As peças já resolvidas aparecem como "Aprovada"/"Trocada" com o resultado.
function PainelOpcoes({
  itens,
  pedidoItens,
  troca,
  ocupado,
  tudo,
  aoRemover,
  aoAprovar,
  aoAprovarCarrinho,
}: {
  itens: Item[]
  pedidoItens: Item[]
  troca: Troca | undefined
  ocupado: boolean
  // A loja cobre a diferença inteira ("cobrir tudo").
  tudo: boolean
  aoRemover: (o: TrocaOpcao) => void
  aoAprovar: (item: Item, peca: TrocaPeca, opcao: TrocaOpcao | null) => void
  aoAprovarCarrinho: (item: Item, peca: TrocaPeca) => void
}) {
  const concluidas = (troca?.pecas ?? []).filter((p) => p.concluida_em)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {itens.map((item) => {
        const peca = troca?.pecas.find((p) => p.item_id === item.id)
        const opcoes = peca?.opcoes ?? []
        return (
          <section key={item.id} className="flex min-w-0 flex-col gap-3" aria-label={item.sku ?? item.nome}>
            {itens.length > 1 && <h4 className="truncate font-mono text-sm font-semibold">{item.sku ?? "sem código"}</h4>}
            {peca && <EscolhaCliente item={item} peca={peca} ocupado={ocupado} tudo={tudo} aoAprovar={() => aoAprovarCarrinho(item, peca)} />}
            {opcoes.length === 0 ? (
              <Vazio className="p-3">Nenhuma opção ainda.</Vazio>
            ) : (
              opcoes.map((o) => (
                <div key={o.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
                  <div className="flex min-w-0 items-center gap-2">
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
                  <Button
                    variant="secondary"
                    className="h-9 w-full text-sm"
                    disabled={!peca || ocupado || o.id.startsWith("tmp-")}
                    onClick={() => peca && aoAprovar(item, peca, o)}
                  >
                    <Check /> Aprovar
                  </Button>
                </div>
              ))
            )}
            {peca && (
              <Button variant="outline" className="h-9 w-full text-sm" disabled={ocupado} onClick={() => aoAprovar(item, peca, null)}>
                <HandCoins /> Dar crédito
              </Button>
            )}
          </section>
        )
      })}
      {concluidas.map((p) => {
        const item = pedidoItens.find((i) => i.id === p.item_id)
        const novas = p.escolha_tipo === "opcao" ? (p.escolhas ?? []).flatMap((e) => p.opcoes.filter((o) => o.id === e.opcao_id).map((o) => `${e.qtd > 1 ? `${e.qtd}× ` : ""}${o.sku ?? o.nome}`)) : []
        const nova = p.escolha_tipo === "opcao" ? p.opcoes.find((o) => o.id === p.escolha_opcao_id) : undefined
        const dif = p.resultado_diferenca
        return (
          <section key={p.id} className="flex min-w-0 flex-col gap-1 rounded-lg bg-success/10 p-2 text-sm" aria-label="Peça resolvida">
            <div className="flex items-center gap-2 font-medium text-success">
              <Check className="size-4 shrink-0" /> {p.escolhida_por === "equipe" ? "Aprovada" : "Trocada"}
            </div>
            <div className="truncate font-mono font-semibold">
              {item?.sku ?? "peça"}
              {novas.length > 0 ? ` → ${novas.join(" + ")}` : nova ? ` → ${nova.sku ?? nova.nome}` : " · crédito"}
            </div>
            {dif != null && (
              <div className="text-xs text-muted-foreground tabular-nums">{rotuloPagamento({ diferenca: dif, coberto: p.coberto, clientePaga: p.cliente_paga }, tudo)}</div>
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
  const aprovar = useAprovarTroca()
  const aprovarCarrinho = useAprovarCarrinho()
  const cobrirMut = useCobrirTroca()
  const categorias = useCategorias(aberto)

  const [itemId, setItemId] = useState(inicial ?? itens[0]?.id ?? "")
  const [aba, setAba] = useState<Aba>("variantes")
  const [catEscolhida, setCatEscolhida] = useState<Record<string, string>>({}) // "" = todas
  const [faixa, setFaixa] = useState<Faixa>("20")
  const [verOpcoes, setVerOpcoes] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [incluir, setIncluir] = useState(false)
  const [soSemEstoque, setSoSemEstoque] = useState(true)
  const [conf, setConf] = useState<{ item: Item; peca: TrocaPeca; opcao: TrocaOpcao | null; carrinho?: boolean } | null>(null)

  // Cada abertura começa limpa: na peça clicada, na aba de variantes e com o resumo fechado.
  // (Ajuste durante a renderização, sem efeito: evita um quadro com o estado velho.)
  const [estavaAberto, setEstavaAberto] = useState(aberto)
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto)
    if (aberto) {
      setItemId(inicial ?? "")
      setAba("variantes")
      setVerOpcoes(false)
      setIncluir(false)
      setSoSemEstoque(true)
      setConf(null)
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
    if (itens.length === 0 || !trocaQ.isSuccess || criando || criou.current === chaveItens) return
    if (troca && !faltaPeca) return
    criou.current = chaveItens
    criarTroca({ pedidoId: pedido.id, itemIds: itens.map((i) => i.id) })
  }, [aberto, trocaQ.isSuccess, troca, faltaPeca, criando, criarTroca, chaveItens, pedido.id, itens])

  const erroTroca = trocaQ.isError || criar.isError
  // V39: com a troca já lida a tela abre na hora; só a peça que ainda não tem troca_peca espera o garantir_troca.
  const pronta = !!troca
  const preparando = (id: string) => !!troca && !troca.pecas.some((p) => p.item_id === id) && !erroTroca
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
  useAtualizacaoAutomaticaCatalogo(aberto)
  const sug = useSugestoes(item?.id, aba === "preco" ? "preco" : "variantes", { categoria: categoria || null, faixa: FAIXAS[faixa] }, ativa, incluir, soSemEstoque)

  const opcoes = peca?.opcoes ?? []
  const selecionada = (n: NovoItem) => opcoes.some((o) => opcaoIgual(o, n))
  // Peças vivas do pedido (as removidas não contam), para o selo "Já no pedido" na busca.
  const vivas = pedido.pedido_itens.filter((i) => i.status !== "removido")
  const jaNoPedido = (n: NovoItem) =>
    vivas.some((i) => (n.shopify_variant_id != null && i.shopify_variant_id === n.shopify_variant_id) || (n.peca_clube_id != null && i.peca_clube_id === n.peca_clube_id))

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
  const cobrirAte = troca?.cobrir_ate ?? 0
  const texto = troca ? mensagemTroca(pedido, ativos, link, cobrirAte) : ""

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

  const difTotal = troca?.resumo?.diferenca_total ?? 0
  const coberto = troca?.resumo?.coberto ?? 0
  const bruta = troca?.resumo?.diferenca_bruta ?? difTotal + coberto
  const respondidas = troca?.resumo?.pecas_respondidas ?? 0
  const escolhas = (troca?.pecas ?? []).flatMap((p) => {
    const it = pedido.pedido_itens.find((i) => i.id === p.item_id)
    const op = p.escolha_tipo === "opcao" ? p.opcoes.find((o) => o.id === p.escolha_opcao_id) : undefined
    let texto: string | null = null
    if (p.concluida_em) texto = `${p.escolhida_por === "equipe" ? "aprovada" : "trocada"}${op ? ` por ${op.sku ?? op.nome}` : " com crédito"}`
    else if (op) texto = `escolheu ${op.sku ?? op.nome}`
    else if (p.escolha_tipo === "credito") texto = "prefere crédito"
    else if (p.escolha_tipo === "whatsapp") texto = "quer falar no WhatsApp"
    return texto ? [{ id: p.id, sku: it?.sku ?? "peça", texto }] : []
  })
  const mostrarResumo = pronta && (respondidas > 0 || faltamOpcao.length > 0)
  const resumo = mostrarResumo && (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      {escolhas.map((e) => (
        <div key={e.id} className="text-xs break-words">
          <span className="font-mono font-semibold">{e.sku}</span> <span className="text-muted-foreground">{e.texto}</span>
        </div>
      ))}
      {respondidas > 0 && (
        <div className="flex flex-col gap-1 tabular-nums">
          {coberto > 0 && (
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>Diferença</span>
              <span>+ {reais(bruta)}</span>
            </div>
          )}
          <div className="font-semibold">{rotuloPagamento({ diferenca: coberto > 0 ? bruta : difTotal, coberto, clientePaga: difTotal > 0 ? difTotal : 0 }, cobreTudo(cobrirAte))}</div>
        </div>
      )}
      {faltamOpcao.length > 0 && <div className="text-xs text-muted-foreground">Falta escolher opções de: {faltamOpcao.map((i) => i.sku ?? i.nome).join(", ")}</div>}
    </div>
  )

  // Cobertura: a loja cobre até um valor da diferença. Liga/desliga no Switch; o valor grava ao sair do campo.
  const trava = !troca || troca.status === ("concluida" as string) || cobrirMut.isPending
  const [cobrirLigado, setCobrirLigado] = useState(false)
  const [cobrirTxt, setCobrirTxt] = useState("")
  const [cobrirErro, setCobrirErro] = useState(false)
  const [cobrirVisto, setCobrirVisto] = useState<number | null>(null)
  // "Tudo" grava COBRIR_TUDO (a loja cobre a diferença inteira) e esconde o campo; "Até" mostra o campo.
  const [cobrirModo, setCobrirModo] = useState<"tudo" | "ate">("ate")
  // Passou de "Tudo" para "Até": o banco volta a 0 até a pessoa digitar, mas o bloco segue ligado.
  const [cobrirManter, setCobrirManter] = useState(false)
  if (troca && cobrirVisto !== cobrirAte) {
    setCobrirVisto(cobrirAte)
    setCobrirLigado(cobrirAte > 0 || cobrirManter)
    setCobrirModo(cobreTudo(cobrirAte) ? "tudo" : "ate")
    setCobrirTxt(cobrirAte > 0 && !cobreTudo(cobrirAte) ? numeroParaTexto(cobrirAte) : "")
    setCobrirErro(false)
    if (cobrirAte > 0) setCobrirManter(false)
  }
  function alternarCobrir(v: boolean) {
    if (!troca) return
    setCobrirLigado(v)
    setCobrirErro(false)
    setCobrirManter(false)
    if (!v) {
      setCobrirTxt("")
      setCobrirModo("ate")
      if (cobrirAte > 0) cobrirMut.mutate({ trocaId: troca.id, valor: 0 })
    }
  }
  function mudarModoCobrir(modo: "tudo" | "ate") {
    if (!troca || modo === cobrirModo) return
    setCobrirModo(modo)
    setCobrirErro(false)
    setCobrirTxt("")
    if (modo === "tudo") cobrirMut.mutate({ trocaId: troca.id, valor: COBRIR_TUDO })
    else if (cobrirAte > 0) {
      setCobrirManter(true)
      cobrirMut.mutate({ trocaId: troca.id, valor: 0 })
    }
  }
  function salvarCobrir(n: number | null) {
    if (!troca || !cobrirLigado || n == null) return
    if (n <= 0) {
      setCobrirErro(true)
      return
    }
    setCobrirErro(false)
    if (n !== cobrirAte) cobrirMut.mutate({ trocaId: troca.id, valor: n })
  }

  // Link da cliente: copiar ou abrir marca a troca como enviada, porque a página só abre troca enviada.
  async function copiarLink() {
    if (!troca) return
    setEnviando(true)
    const copia = navigator.clipboard.writeText(link).then(() => true, () => false)
    try {
      await enviar.mutateAsync({ troca })
      if (await copia) toast.success("Link copiado")
      else toast.error("A troca foi salva, mas não foi possível copiar o link")
    } catch {
      // o erro do envio já aparece no aviso do próprio hook
    } finally {
      setEnviando(false)
    }
  }

  async function abrirPagina() {
    if (!troca) return
    setEnviando(true)
    const nova = window.open("about:blank", "_blank")
    try {
      await enviar.mutateAsync({ troca })
      if (nova) nova.location.href = link
      else window.open(link, "_blank")
    } catch {
      nova?.close()
    } finally {
      setEnviando(false)
    }
  }

  const blocoCobrir = (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="cobrir-diferenca" className="text-sm font-normal">
            Cobrir diferença
          </Label>
          <Switch id="cobrir-diferenca" checked={cobrirLigado} disabled={trava} onCheckedChange={alternarCobrir} />
        </div>
        {cobrirLigado && (
          <ToggleGroup type="single" variant="outline" size="sm" spacing={1} value={cobrirModo} disabled={trava} onValueChange={(v) => v && mudarModoCobrir(v as "tudo" | "ate")} aria-label="Quanto a loja cobre">
            <ToggleGroupItem value="tudo">Tudo</ToggleGroupItem>
            <ToggleGroupItem value="ate">{cobrirAte > 0 && !cobreTudo(cobrirAte) ? `Até ${reais(cobrirAte)}` : "Até um valor"}</ToggleGroupItem>
          </ToggleGroup>
        )}
        {cobrirLigado && cobrirModo === "tudo" && <p className="text-xs text-muted-foreground">A Arvenne cobre a diferença inteira da troca.</p>}
        {cobrirLigado && cobrirModo === "ate" && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="cobrir-ate" className="text-sm font-normal text-muted-foreground">
                até
              </Label>
              <CampoReais
                id="cobrir-ate"
                placeholder="10,00"
                className="h-9 w-36"
                value={cobrirTxt}
                disabled={trava}
                invalid={cobrirErro}
                onValueChange={(t) => {
                  setCobrirTxt(t)
                  setCobrirErro(false)
                }}
                onCommit={salvarCobrir}
              />
              {cobrirMut.isPending && <Spinner />}
            </div>
            {cobrirErro && <p className="text-xs text-destructive">Valor inválido. Use um número maior que zero, como 10,00.</p>}
          </div>
        )}
      </div>
    </div>
  )

  // Uma linha só, no celular e no PC. No celular, rótulos curtos para caber em 390 px.
  const botoes = (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
      <Button variant="outline" className="h-10 min-w-0 px-2 text-sm sm:px-3" disabled={bloqueado} onClick={copiar}>
        {enviando ? <Spinner /> : <Copy />} <span className="sm:hidden">Mensagem</span>
        <span className="hidden sm:inline">Copiar mensagem</span>
      </Button>
      <Button variant="outline" className="h-10 min-w-0 px-2 text-sm sm:px-3" disabled={bloqueado} onClick={copiarLink}>
        <Link2 /> <span className="sm:hidden">Link</span>
        <span className="hidden sm:inline">Copiar link</span>
      </Button>
      <Button variant="outline" className="h-10 min-w-0 px-2 text-sm sm:px-3" disabled={bloqueado} onClick={abrirPagina}>
        <ExternalLink /> <span className="sm:hidden">Abrir</span>
        <span className="hidden sm:inline">Abrir página</span>
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

  const linhas = sug.data?.linhas
  const filtrando = soSemEstoque && !sug.data?.filtroIndisponivel
  const grade = (
    <>
      {sug.isError && !sug.data && tentarSug}
      {sug.isFetching && soSemEstoque && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" /> Conferindo na loja quais peças vendem sem estoque…
        </p>
      )}
      {sug.isPending && !sug.isError && (
        <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3" aria-label="Carregando sugestões">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      )}
      {linhas && linhas.length === 0 && (
        <Vazio>
          {filtrando
            ? "Nenhuma peça marcada como “vender sem estoque” aqui. Desmarque a caixa acima para ver todas."
            : aba === "variantes"
              ? "Este produto não tem outras variantes. Veja \"Preço parecido\" ou \"Buscar\"."
              : "Nenhuma peça nesta faixa. Mude a categoria ou a faixa de preço."}
        </Vazio>
      )}
      {linhas && linhas.length > 0 && (
        <div className={cn("transition-opacity", sug.isPlaceholderData && "pointer-events-none opacity-50")}>
          <GradeSugestoes sugestoes={linhas} selecionada={selecionada} aoTocar={(n) => alternar(n, aba === "preco" ? "mesmo_valor" : "mesmo_modelo")} />
        </div>
      )}
      {sug.data?.filtroIndisponivel && soSemEstoque && (
        <p className="text-xs text-muted-foreground">
          {sug.data.catalogoSemMarca
            ? "Mostrando todas as peças: não foi possível ler da loja quais vendem sem estoque agora. Tente de novo mais tarde."
            : "Filtro “vender sem estoque” disponível após atualizar o banco"}
        </p>
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
    <div className="flex min-w-0 flex-col gap-5">
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
        <Vazio>Todas as peças desta troca já foram resolvidas.</Vazio>
      )}
      {pronta && item && (
        <>
          <ChipsPecas itens={ativos} troca={troca} atualId={item.id} aoEscolher={setItemId} />
          <CabecalhoPeca item={item} pago={pagoQ.data} />
          {preparando(item.id) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner /> Preparando esta peça…
            </div>
          ) : (
            <>
              <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
                <TabsList className="w-full">
                  <TabsTrigger value="variantes">Variantes</TabsTrigger>
                  <TabsTrigger value="preco">Preço parecido</TabsTrigger>
                  <TabsTrigger value="buscar">Buscar</TabsTrigger>
                </TabsList>
              </Tabs>
              {filtrosPreco}
              {aba === "buscar" ? (
                aberto && <BuscaPecas aoEscolher={(n) => alternar(n, "busca")} selecionada={selecionada} noPedido={jaNoPedido} notaPreco="valor com desconto aparece ao escolher" />
              ) : (
                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id="incluir-pedido" checked={incluir} onCheckedChange={(v) => setIncluir(v === true)} />
                    <Label htmlFor="incluir-pedido" className="text-sm font-normal">
                      Incluir peças que já estão no pedido
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="so-sem-estoque" checked={soSemEstoque} onCheckedChange={(v) => setSoSemEstoque(v === true)} />
                    <Label htmlFor="so-sem-estoque" className="text-sm font-normal">
                      Incluir apenas peças marcadas como “vender sem estoque”
                    </Label>
                  </div>
                  {grade}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )

  const painel = (
    <PainelOpcoes
      itens={ativos}
      pedidoItens={pedido.pedido_itens}
      troca={troca}
      tudo={cobreTudo(cobrirAte)}
      ocupado={aprovar.isPending || aprovarCarrinho.isPending}
      aoAprovarCarrinho={(item, peca) => setConf({ item, peca, opcao: null, carrinho: true })}
      aoRemover={(o) => !o.id.startsWith("tmp-") && remover.mutate({ opcaoId: o.id })}
      aoAprovar={(item, peca, opcao) => setConf({ item, peca, opcao })}
    />
  )
  // O que entra na confirmação: o carrinho todo, uma opção, ou nada (crédito).
  const entraConf = !conf ? [] : conf.carrinho ? listaEscolhida(conf.peca) : conf.opcao ? [{ opcao: conf.opcao, qtd: 0 }] : []
  function confirmarAprovacao() {
    if (!troca || !conf) return
    const { peca: p, opcao } = conf
    if (conf.carrinho) {
      aprovarCarrinho.mutate(
        { troca, peca: p },
        {
          onSuccess: () => {
            setConf(null)
            toast.success("Troca feita")
          },
        },
      )
      return
    }
    aprovar.mutate(
      { troca, peca: p, tipo: opcao ? "opcao" : "credito", opcaoId: opcao?.id },
      {
        onSuccess: () => {
          setConf(null)
          toast.success(opcao ? "Troca feita" : "Crédito registrado")
        },
      },
    )
  }
  const totalOpcoes = pecasAtivas.reduce((n, p) => n + (p?.opcoes.length ?? 0), 0)
  const rotuloOpcoes = `${totalOpcoes} ${totalOpcoes === 1 ? "opção escolhida" : "opções escolhidas"}`

  return (
    <>
    <RespDialog
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Troca de peças em falta"
      descricao="Escolha as opções de cada peça e envie um link só para a cliente"
      largo
      rolagemPropria
    >
      {celular ? (
        <div className="flex min-w-0 flex-col gap-3">
          {conteudo}
          <Collapsible open={verOpcoes} onOpenChange={setVerOpcoes} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3 pb-4">
            <CollapsibleContent>
              <AreaRolavel className="max-h-[40svh] pb-3">
                <div className="flex flex-col gap-4">
                  {painel}
                  {resumo}
                  {blocoCobrir}
                </div>
              </AreaRolavel>
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
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid h-[calc(min(92svh,980px)-13rem)] grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            {/* A linha divisória é do lado esquerdo: a barra de rolagem fica colada nela e os dois lados têm o mesmo respiro. */}
            <AreaRolavel className="min-w-0 border-r pr-4">{conteudo}</AreaRolavel>
            <div className="flex min-h-0 min-w-0 flex-col gap-4 pl-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PackageSearch className="size-4" /> Opções <span className="font-normal text-muted-foreground">({rotuloOpcoes})</span>
              </h3>
              <AreaRolavel className="flex-1 p-1">{painel}</AreaRolavel>
              {resumo}
              {blocoCobrir}
            </div>
          </div>
          <div className="border-t pt-5">{botoes}</div>
        </div>
      )}
    </RespDialog>
    <ConfirmarTroca
      aberto={!!conf}
      aoMudar={(a) => !a && setConf(null)}
      sai={conf?.item ?? null}
      peca={conf?.peca ?? null}
      entra={entraConf}
      pendente={aprovar.isPending || aprovarCarrinho.isPending}
      aoConfirmar={confirmarAprovacao}
    />
    </>
  )
}
