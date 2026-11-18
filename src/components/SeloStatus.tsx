import { Badge } from "@/components/ui/badge"
import { COR_RASTREIO, type COR_SELO } from "@/lib/selo"
import { ICONE_ETAPA, NOME_ETAPA } from "@/lib/status"
import { cn } from "@/lib/utils"

// Selo suave: vermelho em "Avisar cliente", amarelo em "Aguardando cliente", laranja em "Enviar rastreio".
export default function SeloStatus({ status, className }: { status: keyof typeof COR_SELO | "enviar_rastreio"; className?: string }) {
  const Icone = ICONE_ETAPA[status]
  if (status === "enviar_rastreio")
    return (
      <Badge variant="outline" size="lg" className={cn(COR_RASTREIO, className)}>
        <Icone /> {NOME_ETAPA[status]}
      </Badge>
    )
  return (
    <Badge variant={status === "avisar_cliente" ? "destructive" : "warning"} size="lg" className={className}>
      <Icone /> {NOME_ETAPA[status]}
    </Badge>
  )
}
