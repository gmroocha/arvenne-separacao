import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Link } from "react-router"
import { ChevronRight, PackageCheck } from "lucide-react"
import Foto from "@/components/Foto"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { useRepetidas } from "@/lib/api"

// Peças pendentes que estão em mais de um pedido: pega o saco uma vez e separa para todas.
// O que importa para achar no estoque é foto, código, variante e quantidade; o nome fica pequeno.
export default function Repetidas() {
  const { data, isLoading, isError, isFetching, refetch } = useRepetidas()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Pegue o saco uma vez e separe para todos os pedidos.</p>
      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : !data?.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageCheck />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça repetida</EmptyTitle>
            <EmptyDescription>Aparecem aqui peças pendentes que estão em mais de um pedido.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <Card key={r.chave} size="sm">
              <CardContent className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Foto url={r.foto_url} alt={r.nome} ampliar className="size-28 shrink-0 sm:size-32" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-lg leading-tight font-semibold break-all">{r.sku ?? "sem código"}</span>
                    {r.variante && <span className="text-base leading-tight font-semibold">{r.variante}</span>}
                    <span className="line-clamp-2 text-xs text-muted-foreground">{r.nome}</span>
                    <div className="mt-auto flex items-baseline gap-1.5 pt-1">
                      <span className="text-2xl leading-none font-semibold tabular-nums">{r.qtd_total}</span>
                      <span className="text-sm text-muted-foreground">un. · {r.qtd_pedidos} pedidos</span>
                    </div>
                  </div>
                </div>
                <ItemGroup className="gap-2">
                  {r.pedidos.map((p) => (
                    <Item key={p.pedido_id} variant="outline" size="sm" asChild>
                      <Link to={`/pedidos/${p.pedido_id}`}>
                        <ItemContent>
                          <ItemTitle>{p.cliente ?? "Sem nome"}</ItemTitle>
                          <ItemDescription className="tabular-nums">{p.numero.replace(/^#/, "")}</ItemDescription>
                        </ItemContent>
                        <span className="text-sm text-muted-foreground tabular-nums">{p.qtd}×</span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
