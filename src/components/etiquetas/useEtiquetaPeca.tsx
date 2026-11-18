import { Printer } from "lucide-react"
import type { ItemAcao } from "@/components/MenuAcoes"
import { etiquetasDe } from "@/lib/etiquetas"
import type { Item } from "@/lib/tipos"
import { useImprimirEtiquetas } from "./useImprimirEtiquetas"

type Imprimir = ReturnType<typeof useImprimirEtiquetas>["imprimir"]

// Opção "Imprimir etiqueta" do menu "…" da peça: só a etiqueta dela (uma, não importa a quantidade).
export function acaoEtiquetaPeca(i: Item, imprimir: Imprimir): ItemAcao {
  return {
    rotulo: "Imprimir etiqueta",
    icone: Printer,
    aoClicar: () => imprimir([{ numero: "", cliente: null, etiquetas: etiquetasDe([i]).etiquetas, itemIds: [i.id] }]),
  }
}

// Para telas que ainda não têm impressão (Conferência, faltas): uma instância do impressor por tela.
export function useEtiquetaPeca() {
  const { imprimir, dialogo } = useImprimirEtiquetas()
  return { acao: (i: Item) => acaoEtiquetaPeca(i, imprimir), dialogo }
}
