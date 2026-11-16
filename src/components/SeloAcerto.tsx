import { HandCoins } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Troca concluída com diferença ainda não acertada, reembolso de peça removida ainda não devolvido, ou
// crédito da troca que ficou para reembolsar. Só o rótulo: o valor aparece na tela do pedido, nunca nas
// etapas de separação.
export function SeloAcerto({ devolver, reembolsar }: { devolver?: boolean; reembolsar?: boolean }) {
  return (
    <Badge variant="warning" size="lg">
      <HandCoins />
      {devolver ? "Devolver" : reembolsar ? "Reembolso pendente" : "Acerto pendente"}
    </Badge>
  )
}
