import { HandCoins } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { COR_SELO } from "@/lib/selo"

// Troca concluída com diferença ainda não acertada, ou reembolso de peça removida ainda não devolvido.
// Só o rótulo: o valor aparece na tela do pedido, nunca nas etapas de separação.
export function SeloAcerto({ devolver }: { devolver?: boolean }) {
  return (
    <Badge variant="secondary" className={`h-6 border-transparent px-2 text-xs font-medium [&>svg]:size-3.5 ${COR_SELO.aguardando_cliente}`}>
      <HandCoins />
      {devolver ? "Devolver" : "Acerto pendente"}
    </Badge>
  )
}
