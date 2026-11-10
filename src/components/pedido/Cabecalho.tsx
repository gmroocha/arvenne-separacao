import { Link } from "react-router"
import { ArrowLeft, ExternalLink, MoreHorizontal, RotateCcw, UserRound } from "lucide-react"
import Prazo from "@/components/pedido/Prazo"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Mais ações" className="size-11 sm:size-8">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            {aoVerDados && (
              <>
                <DropdownMenuItem onClick={aoVerDados}>
                  <UserRound /> Ver dados do pedido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel>Mover para outra etapa</DropdownMenuLabel>
            {ETAPAS_EXPEDICAO.filter((e) => e !== pedido.status).map((e) => {
              const Icone = ICONE_ETAPA[e]
              return (
                <DropdownMenuItem key={e} onClick={() => aoMover(e)}>
                  {Icone && <Icone />} {NOME_ETAPA[e]}
                </DropdownMenuItem>
              )
            })}
            {pedido.fase === "expedicao" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => aoReiniciar(false)}>
                  <RotateCcw /> Reiniciar etapa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => aoReiniciar(true)}>
                  <RotateCcw /> Reiniciar pedido
                </DropdownMenuItem>
              </>
            )}
            {pedido.shopify_url && <DropdownMenuSeparator />}
            {pedido.shopify_url && (
              <DropdownMenuItem asChild>
                <a href={pedido.shopify_url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Abrir na Shopify
                </a>
              </DropdownMenuItem>
            )}
            {pedido.status !== "cancelado" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={aoCancelar}>
                  Cancelar pedido
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
