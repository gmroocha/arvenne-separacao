import { tempoNaEtapa, type StatusPedido } from "@/lib/status"
import { COR_TERMOMETRO as COR } from "@/lib/termometro"
import type { Termometro } from "@/lib/tipos"
import { cn } from "@/lib/utils"

// "Nesta etapa há 3 h" com um ponto na cor do termômetro. O tempo e a faixa vêm do banco (v_pedidos_operacao).
export default function TempoNaEtapa({
  status, desde, termometro, className,
}: { status: StatusPedido; desde: string; termometro?: Termometro | null; className?: string }) {
  return (
    <span data-termometro={termometro ?? undefined} className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {termometro && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", COR[termometro].ponto)} />}
      {tempoNaEtapa(status, desde)}
      {termometro && <span className="sr-only"> ({COR[termometro].texto})</span>}
    </span>
  )
}
