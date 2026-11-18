// O que o detalhe mostra de uma peça. Tudo vem pronto do banco (pedido_itens): a tela só exibe, não calcula.
export type PecaDetalhe = {
  sku?: string | null
  nome: string
  variante?: string | null
  qtd?: number | null
  preco?: number | null
  preco_pago?: number | null
  nota?: string | null
  faltam?: number | null // peça em falta: quantas unidades faltam
}

// Peça de um pedido (pedido_itens) no formato do detalhe. Em falta, a linha já é só das unidades que faltam.
export const detalheDoItem = (i: PecaDetalhe & { status?: string | null }): PecaDetalhe => ({
  sku: i.sku, nome: i.nome, variante: i.variante, qtd: i.qtd, preco: i.preco, preco_pago: i.preco_pago, nota: i.nota,
  faltam: i.status === "falta" || i.status === "defeito" ? i.qtd : null,
})

