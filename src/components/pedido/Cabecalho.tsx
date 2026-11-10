import { Link } from "react-router"
import { ArrowLeft, ExternalLink, MoreHorizontal, RotateCcw, UserRound, XCircle } from "lucide-react"
import MenuAcoes, { type GrupoAcoes } from "@/components/MenuAcoes"
import Prazo from "@/components/pedido/Prazo"
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
      itens: ETAPAS_EXPEDICAO.filter((e) => e !== pedido.status).map((e) => ({
        rotulo: NOME_ETAPA[e],
        icone: ICONE_ETAPA[e],
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
          <div className="text-xs text-muted-foreground">nesta etapa há {tempoDesde(pedido.status_desde)}</div>
        </div>
        <MenuAcoes
          titulo="Ações do pedido"
          grupos={grupos}
          gatilho={
            <Button variant="outline" size="icon" aria-label="Mais ações" className="size-11 shrink-0 sm:size-9">
              <MoreHorizontal />
            </Button>
          }
        />
      </div>
    </div>
  )
}
