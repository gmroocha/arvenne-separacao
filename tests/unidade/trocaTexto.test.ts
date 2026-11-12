import { expect, test } from "vitest"
import { fraseDiferencaCarrinho, fraseSituacao, textoSituacao, valorPagoPeca } from "@/lib/trocaTexto"
import type { TrocaValor, TrocaPeca } from "@/lib/tipos"

const valor = (campos: Partial<TrocaValor>): TrocaValor => ({
  troca_peca_id: "p", troca_id: "t", pedido_id: "pedido", item_id: "item", opcao_id: null,
  tipo: "credito", qtd: 2, valor_pago_item: 80, valor_opcao: 0, diferenca: -80, situacao: "credito", ...campos,
})
test("texto apresenta a diferença recebida do banco sem somar novamente a quantidade", () => {
  expect(textoSituacao(valor({ situacao: "paga_diferenca", diferenca: 40 }))).toMatch(/^\+R\$\s*40,00 a pagar$/)
  expect(fraseSituacao(valor({}))).toMatch(/^cliente fica com R\$\s*80,00 de crédito$/)
  expect(fraseDiferencaCarrinho(0)).toBe("sem diferença")
  expect(textoSituacao(undefined)).toBe("calculando…")
})
test("valor pago da peça usa a linha de crédito da view", () => {
  const peca = { valores: [valor({ tipo: "opcao", valor_pago_item: 999 }), valor({})] } as TrocaPeca
  expect(valorPagoPeca(peca)).toBe(80)
})
