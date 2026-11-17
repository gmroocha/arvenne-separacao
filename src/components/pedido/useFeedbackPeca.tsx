import { useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import type { ItemAcao } from "@/components/MenuAcoes"
import type { Item } from "@/lib/tipos"
import FeedbackPeca from "./FeedbackPeca"

// Opção "Feedback" do menu "…" das peças: abre um campo de texto sobre aquela peça (foto diferente,
// código que não bate etc.). Fica na página Feedbacks com a foto e o código. Uma janela por tela.
export function useFeedbackPeca() {
  const [item, setItem] = useState<Item | null>(null)
  const acao = (i: Item): ItemAcao => ({ rotulo: "Feedback", icone: MessageSquarePlus, aoClicar: () => setItem(i) })
  const dialogo = <FeedbackPeca item={item} aoFechar={() => setItem(null)} />
  return { acao, dialogo }
}
