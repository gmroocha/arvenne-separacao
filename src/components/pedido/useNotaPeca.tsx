import { useState } from "react"
import { StickyNote } from "lucide-react"
import type { ItemAcao } from "@/components/MenuAcoes"
import type { Item } from "@/lib/tipos"
import NotaPecaDialog from "./NotaPecaDialog"

// Opção "Nota" do menu "…" das peças: um recado sobre aquela peça para quem pegar o pedido depois
// (aparece no cartão da peça em todas as etapas). Uma janela por tela.
export function useNotaPeca() {
  const [item, setItem] = useState<Item | null>(null)
  const acao = (i: Item): ItemAcao => ({ rotulo: i.nota ? "Editar nota" : "Nota", icone: StickyNote, aoClicar: () => setItem(i) })
  const dialogo = <NotaPecaDialog item={item} aoFechar={() => setItem(null)} />
  return { acao, dialogo }
}
