import { Link, useNavigate } from "react-router"
import { ArrowLeft, MoreHorizontal } from "lucide-react"
import MenuAcoes from "@/components/MenuAcoes"
import { useAcoesPedido } from "@/components/pedido/useAcoesPedido"
import Prazo from "@/components/pedido/Prazo"
import { ehDesvio } from "@/lib/selo"
import SeloStatus from "@/components/SeloStatus"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import type { PedidoDetalhe } from "@/lib/api"
import { tempoDesde } from "@/lib/status"

type Props = {
  pedido: PedidoDetalhe
  aoVerDados?: () => void // só nas etapas de foco, onde a lateral de dados some
}

export default function Cabecalho({ pedido, aoVerDados }: Props) {
  const navegar = useNavigate()
  const { grupos, dialogos } = useAcoesPedido(pedido, { aoVerDados, aoCancelado: () => navegar("/") })
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to={pedido.fase === "arquivo" ? "/arquivo" : "/"}>
          <ArrowLeft /> {pedido.fase === "arquivo" ? "Arquivo" : "Expedição"}
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-heading text-2xl leading-tight font-semibold">{pedido.cliente_nome ?? "Sem nome"}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{pedido.numero.replace(/^#/, "")}</span>
            <span aria-hidden>·</span>
            <OrigemBadge origem={pedido.origem} />
            {pedido.fase === "expedicao" && <Prazo prazo={pedido.prazo} horasUteis={pedido.prazo_horas_uteis} />}
          </div>
          {/* Selo único: só no PC; no celular fica ao lado de "Etapa X de 8". */}
          {ehDesvio(pedido.status) && <SeloStatus status={pedido.status} className="mt-1 hidden w-fit lg:inline-flex" />}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
        <MenuAcoes
          titulo="Ações do pedido"
          grupos={grupos}
          gatilho={
            <Button variant="outline" size="icon" aria-label="Mais ações" className="size-11 shrink-0 sm:size-9">
              <MoreHorizontal />
            </Button>
          }
        />
          <div className="text-right text-xs text-muted-foreground">nesta etapa há {tempoDesde(pedido.status_desde)}</div>
        </div>
      </div>
      {dialogos}
    </div>
  )
}
