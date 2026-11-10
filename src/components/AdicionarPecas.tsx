import { useEffect, useRef, useState } from "react"
import { ChevronUp, Minus, Plus, RefreshCw, Search, SearchX, Trash2 } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtualizarCatalogo, useBuscaSite, useCatalogoTotal, usePecasClube } from "@/lib/api"
import { useIsMobile } from "@/hooks/use-mobile"
import { reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import { itemDoClube, itemDoSite } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"

type Carrinho = NovoItem[]
type Tocar = (item: NovoItem) => void

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoAdicionar: (itens: NovoItem[]) => void
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
      <InputGroupInput placeholder="Buscar por nome ou código" value={valor} onChange={(e) => aoMudar(e.target.value)} />
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
function Resultado({ item, noCarrinho, aoTocar }: { item: NovoItem; noCarrinho: number; aoTocar: () => void }) {
  return (
    <Item variant="outline" size="sm" asChild>
      <button type="button" className="text-left" onClick={aoTocar}>
        <Foto url={fotoTamanho(item.foto_url, 200)} alt={item.nome} className="size-16 shrink-0" />
        <ItemContent className="gap-0.5">
          <span className="truncate font-mono text-base font-semibold">{item.sku ?? "sem código"}</span>
          <span className="truncate text-sm font-medium">{item.variante ?? "sem variante"}</span>
          <span className="truncate text-xs text-muted-foreground">{item.nome}</span>
        </ItemContent>
        <ItemActions className="flex-col items-end gap-1 text-sm">
          {noCarrinho > 0 && <Badge>×{noCarrinho}</Badge>}
          {item.preco != null && <span className="tabular-nums">{reais(item.preco)}</span>}
        </ItemActions>
      </button>
    </Item>
  )
}

const igual = (a: NovoItem, b: NovoItem) =>
  a.shopify_variant_id != null ? a.shopify_variant_id === b.shopify_variant_id : a.peca_clube_id != null && a.peca_clube_id === b.peca_clube_id

const qtdNoCarrinho = (c: Carrinho, item: NovoItem) => c.find((x) => igual(x, item))?.qtd ?? 0

function AbaSite({ carrinho, aoTocar }: { carrinho: Carrinho; aoTocar: Tocar }) {
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
          return <Resultado key={v.shopify_variant_id} item={item} noCarrinho={qtdNoCarrinho(carrinho, item)} aoTocar={() => aoTocar(item)} />
        })}
      </ItemGroup>
      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => atualizar.mutate(undefined)}>
        <RefreshCw /> Atualizar catálogo da loja
      </Button>
    </div>
  )
}

function AbaClube({ carrinho, aoTocar }: { carrinho: Carrinho; aoTocar: Tocar }) {
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
          return <Resultado key={p.id} item={item} noCarrinho={qtdNoCarrinho(carrinho, item)} aoTocar={() => aoTocar(item)} />
        })}
      </ItemGroup>
    </div>
  )
}

// Peças escolhidas: muda a quantidade ou tira antes de salvar.
function ListaCarrinho({
  carrinho,
  aoMudarQtd,
  aoRemover,
}: {
  carrinho: Carrinho
  aoMudarQtd: (chave: string, qtd: number) => void
  aoRemover: (chave: string) => void
}) {
  if (carrinho.length === 0)
    return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Toque numa peça para adicionar.</p>
  return (
    <div className="flex flex-col gap-2">
      {carrinho.map((i) => (
        <div key={i.chave} className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <Foto url={fotoTamanho(i.foto_url, 200)} alt={i.nome} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm font-semibold">{i.sku ?? "sem código"}</div>
            <div className="truncate text-xs text-muted-foreground">{i.variante ?? i.nome}</div>
          </div>
          <ButtonGroup>
            <Button variant="outline" size="icon" aria-label="Diminuir" disabled={i.qtd <= 1} onClick={() => aoMudarQtd(i.chave, i.qtd - 1)}>
              <Minus />
            </Button>
            <ButtonGroupText className="tabular-nums">{i.qtd}</ButtonGroupText>
            <Button variant="outline" size="icon" aria-label="Aumentar" onClick={() => aoMudarQtd(i.chave, i.qtd + 1)}>
              <Plus />
            </Button>
          </ButtonGroup>
          <Button variant="ghost" size="icon" aria-label="Tirar do carrinho" onClick={() => aoRemover(i.chave)}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function AdicionarPecas({ aberto, aoMudar, aoAdicionar }: Props) {
  const celular = useIsMobile()
  const [carrinho, setCarrinho] = useState<Carrinho>([])
  const [verCarrinho, setVerCarrinho] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const pecas = carrinho.reduce((s, i) => s + i.qtd, 0)
  const rotuloPecas = `${pecas} ${pecas === 1 ? "peça" : "peças"}`

  const tocar: Tocar = (item) =>
    setCarrinho((c) => (c.some((x) => igual(x, item)) ? c.map((x) => (igual(x, item) ? { ...x, qtd: x.qtd + item.qtd } : x)) : [...c, item]))
  const mudarQtd = (chave: string, qtd: number) => setCarrinho((c) => c.map((x) => (x.chave === chave ? { ...x, qtd: Math.max(1, qtd) } : x)))
  const remover = (chave: string) => setCarrinho((c) => c.filter((x) => x.chave !== chave))

  function fechar() {
    setCarrinho([])
    setVerCarrinho(false)
    setDescartando(false)
    aoMudar(false)
  }
  function salvar() {
    if (!carrinho.length) return
    aoAdicionar(carrinho)
    fechar()
  }
  function mudou(a: boolean) {
    if (a) aoMudar(true)
    else if (carrinho.length) setDescartando(true)
    else fechar()
  }

  const abas = (
    <Tabs defaultValue="site">
      <TabsList variant="line">
        <TabsTrigger value="site">Site</TabsTrigger>
        <TabsTrigger value="clube">Clube</TabsTrigger>
      </TabsList>
      <TabsContent value="site">{aberto && <AbaSite carrinho={carrinho} aoTocar={tocar} />}</TabsContent>
      <TabsContent value="clube">{aberto && <AbaClube carrinho={carrinho} aoTocar={tocar} />}</TabsContent>
    </Tabs>
  )
  const lista = <ListaCarrinho carrinho={carrinho} aoMudarQtd={mudarQtd} aoRemover={remover} />

  return (
    <>
      <RespDialog aberto={aberto} aoMudar={mudou} titulo="Adicionar peça" descricao="Busque no site ou no catálogo do Clube e monte o carrinho" largo>
        {celular ? (
          <div className="flex flex-col gap-3">
            {abas}
            <Collapsible open={verCarrinho} onOpenChange={setVerCarrinho} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3">
              <CollapsibleContent className="max-h-[40svh] overflow-y-auto pb-3">{lista}</CollapsibleContent>
              <div className="flex items-center gap-2 pb-1">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-between" disabled={!carrinho.length}>
                    {rotuloPecas}
                    <ChevronUp className={verCarrinho ? "rotate-180" : ""} />
                  </Button>
                </CollapsibleTrigger>
                <Button className="flex-1" disabled={!carrinho.length} onClick={salvar}>
                  Salvar
                </Button>
              </div>
            </Collapsible>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
            <div>{abas}</div>
            <div className="flex flex-col gap-3 border-l pl-6">
              <h3 className="text-sm font-semibold">
                Carrinho {pecas > 0 && <span className="font-normal text-muted-foreground">({rotuloPecas})</span>}
              </h3>
              <div className="max-h-[50svh] overflow-y-auto">{lista}</div>
              <Button disabled={!carrinho.length} onClick={salvar}>
                Salvar {rotuloPecas}
              </Button>
            </div>
          </div>
        )}
      </RespDialog>

      <Dialog open={descartando} onOpenChange={setDescartando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar {rotuloPecas}?</DialogTitle>
            <DialogDescription>As peças do carrinho ainda não foram salvas no pedido.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescartando(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={fechar}>
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
