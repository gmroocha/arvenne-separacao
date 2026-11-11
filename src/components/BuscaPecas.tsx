import { useEffect, useRef, useState } from "react"
import { Plus, RefreshCw, Search, SearchX } from "lucide-react"
import CartaoCatalogo from "@/components/catalogo/CartaoCatalogo"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtualizarCatalogo, useBuscaSite, useCatalogoTotal, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"
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
  // Só a venda mostra preço; nas etapas de separação a busca não exibe valores.
  comPreco?: boolean
}

function useDebounce(valor: string, ms: number) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

function Busca({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput aria-label="Buscar peça por nome ou código" placeholder="Buscar por nome ou código" value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </InputGroup>
  )
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
      {notaPreco && <span className="text-[11px] leading-tight text-muted-foreground">{notaPreco}</span>}
    </>
  )
}

function Selos({ noCarrinho, jaNoPedido }: { noCarrinho: number; jaNoPedido: boolean }) {
  if (!noCarrinho && !jaNoPedido) return null
  return (
    <>
      {jaNoPedido && <Badge variant="secondary" className="h-5 px-1.5 text-xs">Já no pedido</Badge>}
      {noCarrinho > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">×{noCarrinho}</Badge>}
    </>
  )
}

// Grade de cartões: tamanhos do mesmo modelo juntos (só Site); variante de outro tipo fica em cartão próprio.
function GradeResultados({ itens, agrupar, aoTocar, quantidade, selecionada, noPedido, notaPreco, comPreco }: { itens: NovoItem[]; agrupar?: boolean } & Pick<Marcas, "quantidade" | "selecionada" | "noPedido" | "notaPreco" | "comPreco"> & { aoTocar: Tocar }) {
  const qtd = (i: NovoItem) => quantidade?.(i) ?? 0
  const marcada = (i: NovoItem) => selecionada?.(i) ?? false
  const grupos = agruparPorTamanho(itens, (i) => ({ id: String(i.shopify_variant_id ?? i.peca_clube_id ?? i.chave), produto: i.nome, variante: agrupar ? i.variante : null, extra: String(i.preco ?? "") }))
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              selo={<Selos noCarrinho={qtd(i)} jaNoPedido={noPedido?.(i) ?? false} />}
              preco={comPreco ? <PrecoCartao item={i} notaPreco={notaPreco} /> : undefined}
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
            selo={<Selos noCarrinho={0} jaNoPedido={g.tamanhos.some((t) => noPedido?.(t.item))} />}
            preco={comPreco ? <PrecoCartao item={primeiro} notaPreco={notaPreco} /> : undefined}
            chips={g.tamanhos.map((t) => ({
              id: String(t.item.shopify_variant_id ?? t.item.chave),
              rotulo: t.tamanho,
              contagem: qtd(t.item),
              selecionado: marcada(t.item) || qtd(t.item) > 0,
              tracejado: noPedido?.(t.item) ?? false,
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

function AbaSite({ aoTocar, quantidade, selecionada, notaPreco, noPedido, comPreco }: { aoTocar: Tocar } & Marcas) {
  const [termo, setTermo] = useState("")
  const busca = useDebounce(termo.trim(), 300)
  const { data, isFetching } = useBuscaSite(busca)
  const total = useCatalogoTotal()
  const atualizar = useAtualizarCatalogo()
  const iniciou = useRef(false)

  // Catálogo vazio (primeiro uso): busca tudo da Shopify sozinho, uma vez.
  useEffect(() => {
    if (total.data !== undefined && total.data < 20 && !iniciou.current) {
      iniciou.current = true
      atualizar.mutate(undefined)
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
        <p className="text-sm text-muted-foreground">
          {atualizar.isError ? "Veja o aviso na tela e tente de novo." : "Só na primeira vez. Leva até um minuto."}
        </p>
        {atualizar.isError && (
          <Button variant="outline" size="sm" onClick={() => atualizar.mutate(undefined)}>
            <RefreshCw /> Tentar de novo
          </Button>
        )}
      </Empty>
    )

  return (
    <div className="flex flex-col gap-3">
      <Busca valor={termo} aoMudar={setTermo} />
      {isFetching && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {busca.length < 2 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Digite ao menos 2 letras do nome ou do código. {total.data ? `${total.data} variantes no catálogo.` : ""}
        </p>
      )}
      {!isFetching && busca.length >= 2 && data?.length === 0 && <SemResultado />}
      {data && <GradeResultados agrupar itens={data.map((v) => itemDoSite(v))} aoTocar={aoTocar} quantidade={quantidade} selecionada={selecionada} noPedido={noPedido} notaPreco={notaPreco} comPreco={comPreco} />}
      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => atualizar.mutate(undefined)}>
        <RefreshCw /> Atualizar catálogo da loja
      </Button>
    </div>
  )
}

function AbaClube({ aoTocar, quantidade, selecionada, notaPreco, noPedido, comPreco }: { aoTocar: Tocar } & Marcas) {
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
      <Busca valor={termo} aoMudar={setTermo} />
      <Button variant="outline" onClick={() => setNovo(true)}>
        <Plus /> Nova peça do Clube
      </Button>
      {isFetching && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!isFetching && data?.length === 0 && <SemResultado />}
      {data && <GradeResultados itens={data.map((p) => itemDoClube(p))} aoTocar={aoTocar} quantidade={quantidade} selecionada={selecionada} noPedido={noPedido} notaPreco={notaPreco} comPreco={comPreco} />}
    </div>
  )
}

// Busca de peças (abas Site e Clube), reutilizada em "Adicionar peça" e na troca de peça em falta.
export function BuscaPecas({ aoEscolher, quantidade, selecionada, notaPreco, noPedido, comPreco }: { aoEscolher: Tocar } & Marcas) {
  return (
    <Tabs defaultValue="site">
      <TabsList variant="line">
        <TabsTrigger value="site">Site</TabsTrigger>
        <TabsTrigger value="clube">Clube</TabsTrigger>
      </TabsList>
      <TabsContent value="site">
        <AbaSite aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} comPreco={comPreco} />
      </TabsContent>
      <TabsContent value="clube">
        <AbaClube aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} comPreco={comPreco} />
      </TabsContent>
    </Tabs>
  )
}
