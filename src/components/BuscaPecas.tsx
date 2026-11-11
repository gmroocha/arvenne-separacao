import { useEffect, useRef, useState } from "react"
import { Check, Plus, RefreshCw, Search, SearchX } from "lucide-react"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtualizarCatalogo, useBuscaSite, useCatalogoTotal, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import { itemDoClube, itemDoSite } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"
import { cn } from "@/lib/utils"

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

// Resultado da busca: foto quadrada, código (SKU) e variante em destaque, nome pequeno.
function Resultado({ item, noCarrinho, selecionada, aoTocar, notaPreco, jaNoPedido }: { item: NovoItem; noCarrinho: number; selecionada: boolean; aoTocar: () => void; notaPreco?: string; jaNoPedido?: boolean }) {
  return (
    <Item variant="outline" size="sm" asChild className={cn((selecionada || noCarrinho > 0) && "border-transparent bg-primary/5 ring-1 ring-primary/30")}>
      <button type="button" className="min-w-0 text-left" aria-pressed={selecionada} onClick={aoTocar}>
        <Foto url={fotoTamanho(item.foto_url, 200)} alt={item.nome} className="size-16 shrink-0" />
        <ItemContent className="min-w-0 gap-0.5">
          <span className="truncate font-mono text-base font-semibold">{item.sku ?? "sem código"}</span>
          <span className="truncate text-sm font-medium">{item.variante ?? "sem variante"}</span>
          <span className="truncate text-xs text-muted-foreground">{item.nome}</span>
        </ItemContent>
        <ItemActions className="flex-col items-end gap-1 text-sm">
          {selecionada && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="size-3.5" />
            </span>
          )}
          {jaNoPedido && <Badge variant="secondary" className="h-5 px-1.5 text-xs">Já no pedido</Badge>}
          {noCarrinho > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">×{noCarrinho}</Badge>}
          {item.preco != null && <span className="tabular-nums">{reais(item.preco)}</span>}
          {notaPreco && <span className="max-w-28 text-right text-[11px] leading-tight text-muted-foreground">{notaPreco}</span>}
        </ItemActions>
      </button>
    </Item>
  )
}

function AbaSite({ aoTocar, quantidade, selecionada, notaPreco, noPedido }: { aoTocar: Tocar } & Marcas) {
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
      <ItemGroup className="gap-2">
        {data?.map((v) => {
          const item = itemDoSite(v)
          return <Resultado key={v.shopify_variant_id} item={item} noCarrinho={quantidade?.(item) ?? 0} selecionada={selecionada?.(item) ?? false} aoTocar={() => aoTocar(item)} notaPreco={notaPreco} jaNoPedido={noPedido?.(item) ?? false} />
        })}
      </ItemGroup>
      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => atualizar.mutate(undefined)}>
        <RefreshCw /> Atualizar catálogo da loja
      </Button>
    </div>
  )
}

function AbaClube({ aoTocar, quantidade, selecionada, notaPreco, noPedido }: { aoTocar: Tocar } & Marcas) {
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
      <ItemGroup className="gap-2">
        {data?.map((p) => {
          const item = itemDoClube(p)
          return <Resultado key={p.id} item={item} noCarrinho={quantidade?.(item) ?? 0} selecionada={selecionada?.(item) ?? false} aoTocar={() => aoTocar(item)} notaPreco={notaPreco} jaNoPedido={noPedido?.(item) ?? false} />
        })}
      </ItemGroup>
    </div>
  )
}

// Busca de peças (abas Site e Clube), reutilizada em "Adicionar peça" e na troca de peça em falta.
export function BuscaPecas({ aoEscolher, quantidade, selecionada, notaPreco, noPedido }: { aoEscolher: Tocar } & Marcas) {
  return (
    <Tabs defaultValue="site">
      <TabsList variant="line">
        <TabsTrigger value="site">Site</TabsTrigger>
        <TabsTrigger value="clube">Clube</TabsTrigger>
      </TabsList>
      <TabsContent value="site">
        <AbaSite aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} />
      </TabsContent>
      <TabsContent value="clube">
        <AbaClube aoTocar={aoEscolher} quantidade={quantidade} selecionada={selecionada} notaPreco={notaPreco} noPedido={noPedido} />
      </TabsContent>
    </Tabs>
  )
}
