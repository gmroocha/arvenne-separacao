import { HandCoins } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Troca concluída com diferença ainda não acertada, ou reembolso de peça removida ainda não devolvido.
// Só o rótulo: o valor aparece na tela do pedido, nunca nas etapas de separação.
export function SeloAcerto({ devolver }: { devolver?: boolean }) {
  return (
    <Badge variant="warning" size="lg">
      <HandCoins />
      {devolver ? "Devolver" : "Acerto pendente"}
    </Badge>
  )
}
