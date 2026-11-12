import { cn } from "@/lib/utils"

type Props = {
  rotulo: string
  valor: string // já formatado; aqui não há conta
  forte?: boolean
  total?: boolean
  className?: string
}

// Linha "rótulo ... valor" dos resumos de venda.
export function LinhaValor({ rotulo, valor, forte, total, className }: Props) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", forte && "font-medium", className)}>
      <span className={cn("text-muted-foreground", (forte || total) && "text-foreground", total && "text-base")}>{rotulo}</span>
      <span className={cn("tabular-nums", forte && "text-foreground", total && "text-2xl font-semibold")}>{valor}</span>
    </div>
  )
}
