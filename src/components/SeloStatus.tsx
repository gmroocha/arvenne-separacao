import { Badge } from "@/components/ui/badge"
import type { COR_SELO } from "@/lib/selo"
import { ICONE_ETAPA, NOME_ETAPA } from "@/lib/status"

// Selo suave: vermelho em "Avisar cliente", amarelo em "Aguardando cliente".
export default function SeloStatus({ status, className }: { status: keyof typeof COR_SELO; className?: string }) {
  const Icone = ICONE_ETAPA[status]
  return (
    <Badge variant={status === "avisar_cliente" ? "destructive" : "warning"} size="lg" className={className}>
      <Icone /> {NOME_ETAPA[status]}
    </Badge>
  )
}
