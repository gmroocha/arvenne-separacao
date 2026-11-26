import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Quantidade da peça (2×, 50×): laranja cheio, para quem separa, confere e bipa não passar batido.
export function SeloQtd({ qtd, className }: { qtd: number; className?: string }) {
  return (
    <Badge className={cn("h-7 shrink-0 border-transparent bg-quantidade px-2.5 text-base font-semibold text-quantidade-foreground tabular-nums", className)}>
      {qtd}×
    </Badge>
  )
}
