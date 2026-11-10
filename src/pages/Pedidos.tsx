import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { PackageOpen, Plus, RefreshCw, Search } from "lucide-react"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSincronizarShopify, usePedidos, type PedidoLista } from "@/lib/api"
import { reais } from "@/lib/formato"
import { ABERTOS, ETAPAS, tempoDesde } from "@/lib/status"
import Foto from "@/components/Foto"

function Linha({ p }: { p: PedidoLista }) {
  const itens = p.pedido_itens.filter((i) => i.status !== "removido")
  const pecas = itens.reduce((s, i) => s + i.qtd, 0)
  const fotos = itens.slice(0, 3)
  return (
    <Item variant="outline" asChild>
      <Link to={`/pedidos/${p.id}`}>
        <ItemMedia>
          <div className="flex items-center -space-x-2">
            {fotos.map((i) => (
              <Foto key={i.id} url={i.foto_url} className="size-10 rounded-md ring-2 ring-background" />
            ))}
            {itens.length > 3 && <span className="pl-3 text-xs text-muted-foreground">+{itens.length - 3}</span>}
          </div>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            #{p.numero.replace(/^#/, "")} · {p.cliente_nome ?? "Sem nome"}
          </ItemTitle>
          <ItemDescription>
            {pecas} {pecas === 1 ? "peça" : "peças"} · {reais(p.valor_total)}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full flex-wrap sm:w-auto">
          <StatusBadge status={p.status} />
          <OrigemBadge origem={p.origem} />
          <span className="text-xs text-muted-foreground">há {tempoDesde(p.status_desde)}</span>
        </ItemActions>
      </Link>
    </Item>
  )
}

export default function Pedidos() {
  const [params, setParams] = useSearchParams()
  const etapa = params.get("etapa") ?? "abertos"
  const [busca, setBusca] = useState("")
  const { data, isLoading } = usePedidos()
  const sincronizar = useSincronizarShopify()

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (data ?? []).filter(
      (p) => !t || p.numero.toLowerCase().includes(t) || (p.cliente_nome ?? "").toLowerCase().includes(t),
    )
  }, [data, busca])

  const contagem = (id: string) =>
    filtrados.filter((p) => (id === "abertos" ? ABERTOS.includes(p.status) : p.status === id)).length
  const lista = filtrados.filter((p) => (etapa === "abertos" ? ABERTOS.includes(p.status) : p.status === etapa))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Número ou nome da cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </InputGroup>
        <Button variant="outline" onClick={() => sincronizar.mutate(undefined)} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? <Spinner /> : <RefreshCw />} Sincronizar
        </Button>
        <Button asChild>
          <Link to="/pedidos/novo">
            <Plus /> Novo pedido
          </Link>
        </Button>
      </div>

      <Tabs value={etapa} onValueChange={(v) => setParams(v === "abertos" ? {} : { etapa: v }, { replace: true })}>
        <ScrollArea className="w-full">
          <TabsList variant="line" className="w-max">
            {[{ id: "abertos", nome: "Abertos" }, ...ETAPAS].map((e) => (
              <TabsTrigger key={e.id} value={e.id}>
                {e.nome}
                <Badge variant="secondary">{contagem(e.id)}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>Nenhum pedido nesta etapa</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {lista.map((p) => (
            <Linha key={p.id} p={p} />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
