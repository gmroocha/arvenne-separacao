import { createContext, useContext } from "react"
import { combinaBusca } from "@/lib/buscaPeca"

// Texto da busca de peça da etapa (vazio = mostra tudo). Os cartões e linhas de peça se escondem sozinhos.
export const BuscaPecaContexto = createContext("")

export function useCombinaBusca() {
  const busca = useContext(BuscaPecaContexto)
  return (peca: Parameters<typeof combinaBusca>[0]) => combinaBusca(peca, busca)
}
