import { Link } from "react-router"
import { ArrowLeft, ExternalLink, MoreHorizontal } from "lucide-react"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PedidoDetalhe } from "@/lib/api"
import { formatarPrazo } from "@/lib/formato"
import { ETAPAS_EXPEDICAO, NOME_ETAPA, tempoDesde, type StatusPedido } from "@/lib/status"
import { cn } from "@/lib/utils"

type Props = {
  pedido: PedidoDetalhe
  aoMover: (para: StatusPedido) => void
  aoCancelar: () => void
}

export default function Cabecalho({ pedido, aoMover, aoCancelar }: Props) {
  const prazo = pedido.fase === "expedicao" ? formatarPrazo(pedido.prazo, pedido.prazo_horas_uteis) : null
  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to={pedido.fase === "arquivo" ? "/arquivo" : "/"}>
          <ArrowLeft /> {pedido.fase === "arquivo" ? "Arquivo" : "Expedição"}
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">#{pedido.numero.replace(/^#/, "")}</h2>
            <OrigemBadge origem={pedido.origem} />
            <StatusBadge status={pedido.status} />
          </div>
          <div className="truncate text-sm">{pedido.cliente_nome ?? "Sem nome"}</div>
          <div className="text-xs text-muted-foreground">nesta etapa há {tempoDesde(pedido.status_desde)}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Mais ações">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mover para outra etapa</DropdownMenuLabel>
            {ETAPAS_EXPEDICAO.filter((e) => e !== pedido.status).map((e) => (
              <DropdownMenuItem key={e} onClick={() => aoMover(e)}>
                {NOME_ETAPA[e]}
              </DropdownMenuItem>
            ))}
            {(pedido.shopify_url || pedido.carrinho_url) && <DropdownMenuSeparator />}
            {pedido.shopify_url && (
              <DropdownMenuItem asChild>
                <a href={pedido.shopify_url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Abrir na Shopify
                </a>
              </DropdownMenuItem>
            )}
            {pedido.carrinho_url && (
              <DropdownMenuItem asChild>
                <a href={pedido.carrinho_url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Link do carrinho
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
      {prazo && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-semibold",
            prazo.atrasado ? "border-destructive/40 bg-destructive/10 text-destructive" : "bg-muted/40",
          )}
        >
          Prazo de envio: {prazo.texto}
        </div>
      )}
    </div>
  )
}
