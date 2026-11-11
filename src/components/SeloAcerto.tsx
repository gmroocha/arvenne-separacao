import { HandCoins } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { COR_SELO } from "@/lib/selo"

// Troca concluída com diferença ainda não acertada (cobrar ou registrar crédito).
export function SeloAcerto() {
  return (
    <Badge variant="secondary" className={`h-6 border-transparent px-2 text-xs font-medium [&>svg]:size-3.5 ${COR_SELO.aguardando_cliente}`}>
      <HandCoins />
      Acerto pendente
    </Badge>
  )
}
