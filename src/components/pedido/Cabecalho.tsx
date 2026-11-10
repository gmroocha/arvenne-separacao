import { Link } from "react-router"
import { ArrowLeft, ExternalLink, MoreHorizontal, RotateCcw, UserRound, XCircle } from "lucide-react"
import MenuAcoes, { type GrupoAcoes } from "@/components/MenuAcoes"
import Prazo from "@/components/pedido/Prazo"
import SeloStatus from "@/components/SeloStatus"
import { ehDesvio } from "@/lib/selo"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import type { PedidoDetalhe } from "@/lib/api"
import { ETAPAS_EXPEDICAO, ICONE_ETAPA, NOME_ETAPA, tempoDesde, type StatusPedido } from "@/lib/status"

type Props = {
  pedido: PedidoDetalhe
  aoMover: (para: StatusPedido) => void
  aoCancelar: () => void
  aoReiniciar: (tudo: boolean) => void
  aoVerDados?: () => void // só nas etapas de foco, onde a lateral de dados some
}

export default function Cabecalho({ pedido, aoMover, aoCancelar, aoReiniciar, aoVerDados }: Props) {
  const grupos: GrupoAcoes[] = [
    { itens: aoVerDados ? [{ rotulo: "Ver dados do pedido", icone: UserRound, aoClicar: aoVerDados }] : [] },
    {
      titulo: "Mover para outra etapa",
      itens: ETAPAS_EXPEDICAO.map((e) => ({
        rotulo: NOME_ETAPA[e],
        icone: ICONE_ETAPA[e],
        atual: e === pedido.status,
        aoClicar: () => aoMover(e),
      })),
    },
    {
      itens:
        pedido.fase === "expedicao"
          ? [
              { rotulo: "Reiniciar etapa", icone: RotateCcw, aoClicar: () => aoReiniciar(false) },
              { rotulo: "Reiniciar pedido", icone: RotateCcw, aoClicar: () => aoReiniciar(true) },
            ]
          : [],
    },
    {
      itens: pedido.shopify_url
        ? [{ rotulo: "Abrir na Shopify", icone: ExternalLink, aoClicar: () => window.open(pedido.shopify_url!, "_blank", "noreferrer") }]
        : [],
    },
    {
      itens: pedido.status !== "cancelado" ? [{ rotulo: "Cancelar pedido", icone: XCircle, destrutivo: true, aoClicar: aoCancelar }] : [],
    },
  ]
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to={pedido.fase === "arquivo" ? "/arquivo" : "/"}>
          <ArrowLeft /> {pedido.fase === "arquivo" ? "Arquivo" : "Expedição"}
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-2xl leading-tight font-semibold">{pedido.cliente_nome ?? "Sem nome"}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{pedido.numero.replace(/^#/, "")}</span>
            <span aria-hidden>·</span>
            <OrigemBadge origem={pedido.origem} />
            {pedido.fase === "expedicao" && <Prazo prazo={pedido.prazo} horasUteis={pedido.prazo_horas_uteis} />}
          </div>
          {ehDesvio(pedido.status) && <SeloStatus status={pedido.status} className="mt-1 w-fit" />}
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
    </div>
  )
}
