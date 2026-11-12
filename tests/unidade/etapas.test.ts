import { expect, test } from "vitest"
import { etapaCompleta, separarAdicionais } from "@/lib/etapa"
import { destinoAoConcluir, ETAPAS, FASE_DE, proximaEtapa, STATUS_DA_FASE } from "@/lib/status"
import type { Item } from "@/lib/tipos"

const peca = (campos: Partial<Item> = {}): Item => ({
  id: "peca", pedido_id: "pedido", origem: "avulso", nome: "Anel", sku: "AN-1", variante: null,
  shopify_variant_id: null, peca_clube_id: null, foto_url: null, qtd: 2, preco: 50, preco_pago: null,
  status: "encontrado", observacao: null, ordem: 1, conferido_em: null, etiquetado_em: null,
  etiqueta_previa: false, qtd_bipada: 0, bipado_em: null, removido_em: null, devolvido_em: null,
  reembolsado_shopify_em: null, shopify_line_id: null, adicional: false, venda_origem_id: null,
  created_at: "2026-11-12T12:00:00Z", updated_at: "2026-11-12T12:00:00Z", ...campos,
})

test("cada status pertence a uma fase, sem pedido ficar escondido", () => {
  const todos = Object.values(STATUS_DA_FASE).flat()
  expect(new Set(todos).size).toBe(ETAPAS.length)
  expect(todos).toHaveLength(ETAPAS.length)
  for (const e of ETAPAS) expect(STATUS_DA_FASE[FASE_DE[e.id]]).toContain(e.id)
  expect(FASE_DE.somada).toBe("arquivo")
})
test("o fluxo normal não pula uma etapa", () => {
  expect(proximaEtapa("novo")).toBe("separacao")
  expect(destinoAoConcluir("novo")).toBe("conferencia") // a tela Novo já mostra Separação
  expect(proximaEtapa("conferencia")).toBe("etiquetagem")
  expect(proximaEtapa("bipagem")).toBe("faturamento")
  expect(proximaEtapa("enviado")).toBeNull()
  expect(proximaEtapa("aguardando_cliente")).toBe("separacao")
})
test("peça pendente, inclusive adicional, impede completar conferência", () => {
  const pronta = peca({ conferido_em: "2026-11-12T12:00:00Z" })
  expect(etapaCompleta("conferencia", [pronta])).toBe(true)
  expect(etapaCompleta("conferencia", [pronta, peca({ id: "ad", status: "pendente", adicional: true, venda_origem_id: "venda" })])).toBe(false)
  expect(etapaCompleta("conferencia", [pronta, peca({ status: "removido" })])).toBe(true)
})
test("bipagem conta todas as unidades; nenhuma peça viva não é etapa feita", () => {
  expect(etapaCompleta("bipagem", [peca({ qtd_bipada: 1 })])).toBe(false)
  expect(etapaCompleta("bipagem", [peca({ qtd_bipada: 2 })])).toBe(true)
  expect(etapaCompleta("separacao", [])).toBe(false)
})
test("as adicionais continuam na lista ao separar os grupos", () => {
  const a = peca(), b = peca({ id: "ad", adicional: true, venda_origem_id: "venda" })
  expect(separarAdicionais([a, b])).toEqual({ normais: [a], adicionais: [b] })
})
