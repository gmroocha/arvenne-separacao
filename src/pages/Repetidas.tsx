import { Link } from "react-router"
import { PackageCheck } from "lucide-react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { useRepetidas } from "@/lib/api"

export default function Repetidas() {
  const { data, isLoading } = useRepetidas()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Pegue o saco uma vez e separe para todos.</p>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
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
        <ItemGroup className="gap-2">
          {data.map((r) => (
            <Item key={r.chave} variant="outline" className="items-start">
              <ItemMedia variant="image">
                <Foto url={r.foto_url} className="size-10" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{r.nome}</ItemTitle>
                <ItemDescription>{[r.variante, r.sku].filter(Boolean).join(" · ")}</ItemDescription>
                <p className="text-sm">
                  <strong>{r.qtd_total} un.</strong> em {r.qtd_pedidos} pedidos
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {r.pedidos.map((p) => (
                    <Badge key={p.pedido_id} variant="outline" asChild>
                      <Link to={`/pedidos/${p.pedido_id}`}>
                        #{p.numero.replace(/^#/, "")} · {p.cliente ?? "Sem nome"} · {p.qtd}×
                      </Link>
                    </Badge>
                  ))}
                </div>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
