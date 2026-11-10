import { Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatarPrazo } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Prazo de envio (48 h úteis a partir do pagamento). Atrasado fica em destructive.
export default function Prazo({
  prazo, horasUteis, className,
}: { prazo: string | null; horasUteis: number | null; className?: string }) {
  if (!prazo) return null
  const f = formatarPrazo(prazo, horasUteis)
  if (f.atrasado)
    return (
      <Badge variant="destructive" className={className}>
        <Clock /> {f.texto}
      </Badge>
    )
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Clock className="size-3" /> {f.texto}
    </span>
  )
}
