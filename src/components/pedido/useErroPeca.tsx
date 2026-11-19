import { useState } from "react"
import { CircleAlert } from "lucide-react"
import type { ItemAcao } from "@/components/MenuAcoes"
import type { Item } from "@/lib/tipos"
import ErroPecaDialog from "./ErroPecaDialog"

// Opção "Erro na peça" do menu "…" da Bipagem: a peça volta para a Separação e o erro fica registrado em nome de quem separou.
// Uma janela por tela.
export function useErroPeca(pedidoId: string) {
  const [item, setItem] = useState<Item | null>(null)
  const acao = (i: Item): ItemAcao => ({ rotulo: "Erro na peça", icone: CircleAlert, destrutivo: true, aoClicar: () => setItem(i) })
  const dialogo = <ErroPecaDialog pedidoId={pedidoId} item={item} aoFechar={() => setItem(null)} />
  return { acao, dialogo }
}
