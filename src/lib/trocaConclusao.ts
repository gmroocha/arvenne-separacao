import type { TrocaPublicaPeca } from "@/lib/tipos"

// "Concluir minhas escolhas" na página da troca. Cada toque já grava no banco; o botão final serve para a
// cliente saber que terminou. A confirmação vale para o conjunto exato de escolhas: se ela mudar qualquer
// peça depois, a assinatura muda e o botão volta a aparecer.
type PecaEscolha = Pick<TrocaPublicaPeca, "item_id" | "escolha_tipo" | "escolha_opcao_id" | "carrinho" | "qtd">

export function assinaturaEscolhas(pecas: PecaEscolha[]): string {
  return JSON.stringify(
    [...pecas]
      .sort((a, b) => a.item_id.localeCompare(b.item_id))
      .map((p) => {
        const cart = p.carrinho ?? (p.escolha_tipo === "opcao" && p.escolha_opcao_id ? [{ opcao_id: p.escolha_opcao_id, qtd: p.qtd }] : [])
        return [p.item_id, p.escolha_tipo ?? "", [...cart].sort((a, b) => a.opcao_id.localeCompare(b.opcao_id)).map((c) => `${c.opcao_id}:${c.qtd}`)]
      }),
  )
}

const chave = (token: string) => `troca-concluida:${token}`

// Guardado só no aparelho da cliente; em aba anônima ou bloqueado, a página funciona sem lembrar.
export function lerConclusao(token: string | undefined): string | null {
  if (!token) return null
  try {
    return localStorage.getItem(chave(token))
  } catch {
    return null
  }
}

export function gravarConclusao(token: string | undefined, assinatura: string | null) {
  if (!token) return
  try {
    if (assinatura) localStorage.setItem(chave(token), assinatura)
    else localStorage.removeItem(chave(token))
  } catch {
    // sem armazenamento: só não lembra depois de recarregar
  }
}
