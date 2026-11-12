import { useEffect, useRef, useState } from "react"
import { Plus, RefreshCw, Search, SearchX } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import CartaoCatalogo from "@/components/catalogo/CartaoCatalogo"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtualizarCatalogo, useBuscaSite, useAtualizacaoAutomaticaCatalogo, useCatalogoInfo, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"
import { useDebounce } from "@/lib/useDebounce"
import { itemDoClube, itemDoSite } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"
import { agruparPorTamanho, codigoDoModelo, separarTamanho } from "@/lib/variante"

export type Tocar = (item: NovoItem) => void

// Como a busca marca as peças já escolhidas: quantidade no carrinho (Adicionar peça)
// ou seleção com check (Troca de peça em falta).
type Marcas = {
  // Texto pequeno sob o preço (ex.: aviso de que o valor com desconto aparece ao escolher).
  notaPreco?: string
  quantidade?: (item: NovoItem) => number
  selecionada?: (item: NovoItem) => boolean
  // Peça que já está no pedido: ganha o selo "Já no pedido".
  noPedido?: (item: NovoItem) => boolean
  // Quantas unidades da peça já estão no pedido (0 = nenhuma): selo de aviso "No pedido · N×".
  qtdNoPedido?: (item: NovoItem) => number
  // Só a venda mostra preço; nas etapas de separação a busca não exibe valores.
  comPreco?: boolean
}

function Busca({ valor, aoMudar, carregando }: { valor: string; aoMudar: (v: string) => void; carregando?: boolean }) {
  return <CampoBusca valor={valor} aoMudar={aoMudar} carregando={carregando} placeholder="Buscar por nome ou código" />
}

// "há 5 min", "há 3 h", "há 2 dias".
function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return "agora há pouco"
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return `há ${d} ${d === 1 ? "dia" : "dias"}`
}

function SemResultado() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>Nada encontrado</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

// Preço do cartão (só na venda), com a nota pequena quando houver.
function PrecoCartao({ item, notaPreco }: { item: NovoItem; notaPreco?: string }) {
  if (item.preco == null) return null
  return (
    <>
      <span className="text-base leading-tight font-semibold tabular-nums">{reais(item.preco)}</span>
      {notaPreco && <span className="text-xs leading-tight text-muted-foreground">{notaPreco}</span>}
    </>
  )
}

function Selos({ noCarrinho, jaNoPedido, qtdNoPedido }: { noCarrinho: number; jaNoPedido: boolean; qtdNoPedido: number }) {
  if (!noCarrinho && !jaNoPedido && !qtdNoPedido) return null
  return (
    <>
      {qtdNoPedido > 0 ? (
        <Badge variant="warning" className="h-5 px-1.5 text-xs">No pedido · {qtdNoPedido}×</Badge>
      ) : (
        jaNoPedido && <Badge variant="secondary" className="h-5 px-1.5 text-xs">No pedido</Badge>
      )}
      {noCarrinho > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">×{noCarrinho}</Badge>}
    </>
  )
}

// Grade de cartões: tamanhos do mesmo modelo juntos (só Site); variante de outro tipo fica em cartão próprio.
function GradeResultados({ itens, agrupar, aoTocar, quantidade, selecionada, noPedido, qtdNoPedido, notaPreco, comPreco }: { itens: NovoItem[]; agrupar?: boolean } & Pick<Marcas, "quantidade" | "selecionada" | "noPedido" | "qtdNoPedido" | "notaPreco" | "comPreco"> & { aoTocar: Tocar }) {
  const qtd = (i: NovoItem) => quantidade?.(i) ?? 0
  const marcada = (i: NovoItem) => selecionada?.(i) ?? false
  const nped = (i: NovoItem) => qtdNoPedido?.(i) ?? 0
  // Carrinho (quantidade) adiciona; troca (seleção) oferece.
  const acao = quantidade ? { rotulo: "Adicionar", rotuloMarcado: "Adicionada" } : { rotulo: "Oferecer", rotuloMarcado: "Oferecida" }
  const grupos = agruparPorTamanho(itens, (i) => ({ id: String(i.shopify_variant_id ?? i.peca_clube_id ?? i.chave), produto: i.nome, variante: agrupar ? i.variante : null, extra: String(i.preco ?? "") }))
  // p-1: folga para o anel do cartão marcado não ser cortado pela área rolável.
  return (
    <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
      {grupos.map((g) => {
        if (g.unica) {
          const i = g.unica
          return (
            <CartaoCatalogo
              key={g.chave}
              foto={i.foto_url}
              alt={i.nome}
              codigo={i.sku ?? "sem código"}
              variante={i.variante}
              nome={i.nome}
              selecionado={marcada(i) || qtd(i) > 0}
              selo={<Selos noCarrinho={qtd(i)} jaNoPedido={noPedido?.(i) ?? false} qtdNoPedido={nped(i)} />}
              preco={comPreco ? <PrecoCartao item={i} notaPreco={notaPreco} /> : undefined}
              acao={acao}
              onCard={() => aoTocar(i)}
            />
          )
        }
        const primeiro = g.tamanhos[0].item
        const porId = new Map(g.tamanhos.map((t) => [String(t.item.shopify_variant_id ?? t.item.chave), t.item]))
        return (
          <CartaoCatalogo
            key={g.chave}
            foto={primeiro.foto_url}
            alt={primeiro.nome}
            codigo={codigoDoModelo(g.tamanhos.map((t) => ({ sku: t.item.sku, tamanho: t.tamanho })))}
            variante={separarTamanho(primeiro.variante).base}
            nome={primeiro.nome}
            selecionado={g.tamanhos.some((t) => marcada(t.item) || qtd(t.item) > 0)}
            selo={<Selos noCarrinho={0} jaNoPedido={g.tamanhos.some((t) => noPedido?.(t.item))} qtdNoPedido={g.tamanhos.reduce((n, t) => n + nped(t.item), 0)} />}
            preco={comPreco ? <PrecoCartao item={primeiro} notaPreco={notaPreco} /> : undefined}
            chips={g.tamanhos.map((t) => ({
              id: String(t.item.shopify_variant_id ?? t.item.chave),
              rotulo: t.tamanho,
              contagem: qtd(t.item),
              selecionado: marcada(t.item) || qtd(t.item) > 0,
              tracejado: (noPedido?.(t.item) ?? false) || nped(t.item) > 0,
              titulo: t.item.sku ?? undefined,
            }))}
            onChip={(id) => {
              const i = porId.get(id)
              if (i) aoTocar(i)
            }}
          />
        )
      })}
    </div>
  )
}

function AbaSite({ aoTocar, quantidade, selecionada, notaPreco, noPedido, qtdNoPedido, comPreco }: { aoTocar: Tocar } & Marcas) {
  const [termo, setTermo] = useState("")
  const busca = useDebounce(termo.trim(), 300)
  const { data, isFetching } = useBuscaSite(busca)
  const info = useCatalogoInfo()
  const total = { data: info.data?.total }
  const atualizar = useAtualizarCatalogo()
  useAtualizacaoAutomaticaCatalogo(true)
  const iniciou = useRef(false)

  // Catálogo vazio (primeiro uso): busca tudo da Shopify sozinho, uma vez.
  useEffect(() => {
    if (total.data !== undefined && total.data < 20 && !iniciou.current) {
      iniciou.current = true
      atualizar.mutate({ completo: true })
    }
  }, [total.data, atualizar])

  if ((total.data !== undefined && total.data < 20 && !atualizar.isSuccess) || atualizar.isPending)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{atualizar.isError ? <SearchX /> : <Spinner />}</EmptyMedia>
          <EmptyTitle>
            {atualizar.isError ? "Não foi possível carregar o catálogo" : "Carregando o catálogo da loja…"}
          </EmptyTitle>
        </EmptyHeader>
        <EmptyDescription>{atualizar.isError ? "Veja o aviso na tela e tente de novo." : "Só na primeira vez. Leva até um minuto."}</EmptyDescription>
        {atualizar.isError && (
          <Button variant="outline" size="sm" onClick={() => atualizar.mutate({ completo: true })}>
            <RefreshCw /> Tentar de novo
          </Button>
        )}
      </Empty>
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Busca valor={termo} aoMudar={setTermo} carregando={isFetching} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground lg:size-9" aria-label="Atualizar catálogo" disabled={atualizar.isPending} onClick={() => atualizar.mutate(undefined)}>
              <RefreshCw className={atualizar.isPending ? "animate-spin" : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Atualizar catálogo</TooltipContent>
        </Tooltip>
      </div>
      {busca.length < 2 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Busque uma peça</EmptyTitle>
            <EmptyDescription>Digite ao menos 2 letras do nome ou do código.</EmptyDescription>
          </EmptyHeader>
          {!!info.data?.total && (
            <p className="text-xs text-muted-foreground">
              {info.data.total.toLocaleString("pt-BR")} variantes do site{info.data.atualizadoEm ? ` · atualizado ${haQuanto(info.data.atualizadoEm)}` : ""}
            </p>
          )}
        </Empty>
      )}
      {!isFetching && busca.length >= 2 && data?.length === 0 && <SemResultado />}
      {data && <GradeResultados agrupar itens={data.map((v) => itemDoSite(v))} aoTocar={aoTocar} quantidade={quantidade} selecionada={selecionada} noPedido={noPedido} qtdNoPedido={qtdNoPedido} notaPreco={notaPreco} comPreco={comPreco} />}
    </div>
  )
}

function AbaClube({ aoTocar, quantidade, selecionada, notaPreco, noPedido, qtdNoPedido, comPreco }: { aoTocar: Tocar } & Marcas) {
  const [termo, setTermo] = useState("")
  const [novo, setNovo] = useState(false)
  const busca = useDebounce(termo.trim(), 300)
  const { data, isFetching } = usePecasClube(busca)

  if (novo)
    return (
      <PecaClubeForm
        aoSalvar={(peca) => {
          aoTocar(itemDoClube(peca))
          setNovo(false)
        }}
      />
    )

  return (
    <div className="flex flex-col gap-3">
      <Busca valor={termo} aoMudar={setTermo} carregando={isFetching} />
      <Button variant="outline" size="toque" onClick={() => setNovo(true)}>
        <Plus /> Nova peça do Clube
      </Button>
      {!isFetching && data?.length === 0 && <SemResultado />}
      {data && <GradeResultados itens={data.map((p) => itemDoClube(p))} aoTocar={aoTocar} quantidade={quantidade} selecionada={selecionada} noPedido={noPedido} qtdNoPedido={qtdNoPedido} notaPreco={notaPreco} comPreco={comPreco} />}
    </div>
  )
}

// Busca de peças (abas Site e Clube), reutilizada em "Adicionar peça" e na troca de peça em falta.
export function BuscaPecas({ aoEscolher, quantidade, selecionada, notaPreco, noPedido, qtdNoPedido, comPreco }: { aoEscolher: Tocar } & Marcas) {
  return (
    <Tabs defaultValue="site">
      <TabsList variant="line">
        <TabsTrigger value="site">Site</TabsTrigger>
        <TabsTrigger value="clube">Clube</TabsTrigger>
      </TabsList>
      <TabsContent value="site">
        <AbaSite aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} qtdNoPedido={qtdNoPedido} comPreco={comPreco} />
      </TabsContent>
      <TabsContent value="clube">
        <AbaClube aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} qtdNoPedido={qtdNoPedido} comPreco={comPreco} />
      </TabsContent>
    </Tabs>
  )
}
