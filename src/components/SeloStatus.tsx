import { Badge } from "@/components/ui/badge"
import { COR_SELO } from "@/lib/selo"
import { ICONE_ETAPA, NOME_ETAPA } from "@/lib/status"
import { cn } from "@/lib/utils"

// Selo suave (sem borda): vermelho em "Avisar cliente", amarelo em "Aguardando cliente".
export default function SeloStatus({ status, className }: { status: keyof typeof COR_SELO; className?: string }) {
  const Icone = ICONE_ETAPA[status]
  return (
    <Badge variant="secondary" className={cn("h-6 border-transparent px-2 text-xs font-medium [&>svg]:size-3.5", COR_SELO[status], className)}>
      <Icone /> {NOME_ETAPA[status]}
    </Badge>
  )
}
