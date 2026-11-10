import { Link } from "react-router"
import Foto from "@/components/Foto"
import Prazo from "@/components/pedido/Prazo"
import { OrigemBadge } from "@/components/StatusBadge"
import type { Pedido } from "@/lib/tipos"

// Cartão do pedido na esteira: a cliente em destaque, o número pequeno.
export default function CardPedido({ p, progresso }: { p: Pedido; progresso?: string | null }) {
  const extras = Math.max(0, p.qtd_linhas - p.fotos.length)
  return (
    <Link
      to={`/pedidos/${p.id}`}
      draggable={false}
      className="flex flex-col gap-2 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-base leading-tight font-semibold">{p.cliente_nome ?? "Sem nome"}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{p.numero.replace(/^#/, "")}</span> · <OrigemBadge origem={p.origem} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {p.fotos.map((f, n) => (
            <Foto key={n} url={f} className="size-9 rounded-md bg-muted ring-1 ring-border" />
          ))}
          {p.fotos.length === 0 && <Foto url={null} className="size-9 rounded-md bg-muted ring-1 ring-border" />}
        </div>
        {extras > 0 && <span className="text-xs text-muted-foreground tabular-nums">+{extras}</span>}
        {progresso && <span className="ml-auto text-sm font-medium tabular-nums">{progresso}</span>}
      </div>
      <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} />
    </Link>
  )
}
