import { Link } from "react-router"
import { ChevronRight, PackageCheck } from "lucide-react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useRepetidas } from "@/lib/api"

// Peças pendentes que estão em mais de um pedido: pega o saco uma vez e separa para todas.
// O que importa para achar no estoque é foto, código, variante e quantidade; o nome fica pequeno.
export default function Repetidas() {
  const { data, isLoading } = useRepetidas()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Pegue o saco uma vez e separe para todos os pedidos.</p>
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : !data?.length ? (
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
            <Card key={r.chave} className="gap-0 py-0">
              <CardContent className="flex flex-col gap-3 p-3">
                <div className="flex gap-3">
                  <Foto url={r.foto_url} alt={r.nome} ampliar className="size-28 shrink-0 rounded-lg sm:size-32" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-lg leading-tight font-semibold break-all">{r.sku ?? "sem código"}</span>
                    {r.variante && <span className="text-base leading-tight font-semibold">{r.variante}</span>}
                    <span className="line-clamp-2 text-xs text-muted-foreground">{r.nome}</span>
                    <div className="mt-auto flex items-baseline gap-1.5 pt-1">
                      <span className="text-3xl leading-none font-semibold tabular-nums">{r.qtd_total}</span>
                      <span className="text-sm text-muted-foreground">un. · {r.qtd_pedidos} pedidos</span>
                    </div>
                  </div>
                </div>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {r.pedidos.map((p) => (
                    <li key={p.pedido_id}>
                      <Link
                        to={`/pedidos/${p.pedido_id}`}
                        className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{p.cliente ?? "Sem nome"}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{p.numero.replace(/^#/, "")}</span>
                        </div>
                        <Badge className="h-7 min-w-10 px-2 text-sm tabular-nums">{p.qtd}×</Badge>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
