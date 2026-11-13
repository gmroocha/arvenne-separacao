import { createContext, useContext } from "react"
import type { Alteracao } from "@/lib/tipos"

// Alterações do pedido (trocas, créditos, peças tiradas) e o jeito de abrir o diálogo delas de qualquer tela
// do pedido. `comValores`: o diálogo mostra o dinheiro (as etapas de peças abrem sem valores).
export type AbrirAlteracoes = (opcoes?: { foco?: string | null; comValores?: boolean }) => void

export const AlteracoesContexto = createContext<{ alteracoes: Alteracao[]; abrir: AbrirAlteracoes | null }>({ alteracoes: [], abrir: null })

export const useAlteracoesDoPedido = () => useContext(AlteracoesContexto)

// Quantas trocas/créditos e quantas peças removidas ou com quantidade reduzida.
export function contarAlteracoes(lista: Alteracao[]) {
  const trocadas = lista.filter((a) => a.tipo === "troca" || a.tipo === "credito").length
  return { trocadas, removidas: lista.length - trocadas }
}
