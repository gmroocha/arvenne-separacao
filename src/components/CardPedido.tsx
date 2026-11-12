import { Link } from "react-router"
import { Card } from "@/components/ui/card"
import Miniaturas from "@/components/Miniaturas"
import MenuContexto from "@/components/MenuContexto"
import Prazo from "@/components/pedido/Prazo"
import { SeloAcerto } from "@/components/SeloAcerto"
import { OrigemBadge } from "@/components/StatusBadge"
import type { Pedido } from "@/lib/tipos"

// Cartão do pedido na esteira: a cliente em destaque, o número pequeno. Clique direito (ou toque longo) abre as ações.
export default function CardPedido({ p, progresso }: { p: Pedido; progresso?: string | null }) {
  return (
    <MenuContexto pedido={p}>
      <Card size="sm" className="transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
        <Link to={`/pedidos/${p.id}`} draggable={false} className="flex flex-col gap-2 px-3 outline-none">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base leading-tight font-semibold">{p.cliente_nome ?? "Sem nome"}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{p.numero.replace(/^#/, "")}</span> · <OrigemBadge origem={p.origem} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Miniaturas fotos={p.fotos} total={p.qtd_linhas} />
          {progresso && <span className="ml-auto text-sm font-medium tabular-nums">{progresso}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} />
          {p.acerto_pendente && <SeloAcerto devolver={(p.a_devolver ?? 0) > 0} />}
        </div>
        </Link>
      </Card>
    </MenuContexto>
  )
}
