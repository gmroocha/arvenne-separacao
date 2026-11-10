import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Plus, Search, SearchX } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useBuscaSite, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"
import { itemDoClube, itemDoSite } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"

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

function AbaSite({ aoAdicionar }: { aoAdicionar: (itens: NovoItem[]) => void }) {
  const [termo, setTermo] = useState("")
  const busca = useDebounce(termo.trim(), 300)
  const { data, isFetching } = useBuscaSite(busca)
  return (
    <div className="flex flex-col gap-3">
      <Busca valor={termo} aoMudar={setTermo} />
      {isFetching && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!isFetching && busca.length >= 2 && data?.length === 0 && <SemResultado />}
      <ItemGroup className="gap-2">
        {data?.map((v) => (
          <Item
            key={v.shopify_variant_id}
            variant="outline"
            size="sm"
            asChild
          >
            <button
              type="button"
              className="text-left"
              onClick={() => {
                aoAdicionar([itemDoSite(v)])
                toast.success("Adicionada")
              }}
            >
              <ItemMedia variant="image">
                <Foto url={v.foto_url} className="size-12" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{v.nome}</ItemTitle>
                <ItemDescription>{[v.variante, v.sku].filter(Boolean).join(" · ")}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-sm">{reais(v.preco)}</ItemActions>
            </button>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}

function AbaClube({ aoAdicionar }: { aoAdicionar: (itens: NovoItem[]) => void }) {
  const [termo, setTermo] = useState("")
  const [novo, setNovo] = useState(false)
  const busca = useDebounce(termo.trim(), 300)
  const { data, isFetching } = usePecasClube(busca)

  if (novo)
    return (
      <PecaClubeForm
        aoSalvar={(peca) => {
          aoAdicionar([itemDoClube(peca)])
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
        {data?.map((p) => (
          <Item key={p.id} variant="outline" size="sm" asChild>
            <button
              type="button"
              className="text-left"
              onClick={() => {
                aoAdicionar([itemDoClube(p)])
                toast.success("Adicionada")
              }}
            >
              <ItemMedia variant="image">
                <Foto url={p.foto_url} className="size-12" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{p.nome}</ItemTitle>
                <ItemDescription>{[p.variante, p.codigo].filter(Boolean).join(" · ")}</ItemDescription>
              </ItemContent>
              <ItemActions className="text-sm">{reais(p.preco)}</ItemActions>
            </button>
          </Item>
        ))}
      </ItemGroup>
    </div>
  )
}

export default function AdicionarPecas({ aberto, aoMudar, aoAdicionar }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Adicionar peça" descricao="Busque no site ou no catálogo do Clube" largo>
      <Tabs defaultValue="site">
        <TabsList variant="line">
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="clube">Clube</TabsTrigger>
        </TabsList>
        <TabsContent value="site">{aberto && <AbaSite aoAdicionar={aoAdicionar} />}</TabsContent>
        <TabsContent value="clube">{aberto && <AbaClube aoAdicionar={aoAdicionar} />}</TabsContent>
      </Tabs>
    </RespDialog>
  )
}
