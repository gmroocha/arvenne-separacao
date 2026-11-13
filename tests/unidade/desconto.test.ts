import { expect, test } from "vitest"
import { rotuloDesconto } from "@/lib/desconto"
import type { DescontoShopify } from "@/lib/tipos"

const base = { descontos: null, desconto_tipo: null, desconto_valor: null, desconto_percentual: null, cupom: null, desconto_codigos: null }
const d = (campos: Partial<DescontoShopify>): DescontoShopify => ({ tipo: "code", rotulo: null, codigo: null, titulo: null, percentual: null, valor: null, alocacao: null, alvo: null, ...campos })

test("cupom da Shopify com percentual", () => {
  expect(rotuloDesconto({ ...base, descontos: [d({ codigo: "PIX25", percentual: 25 })] })).toEqual({ base: "Desconto · 25%", motivo: "cupom PIX25" })
})
test("desconto automático usa o título", () => {
  expect(rotuloDesconto({ ...base, descontos: [d({ tipo: "automatic", titulo: "Pague 10", percentual: 12.5 })] })).toEqual({ base: "Desconto · 12,5%", motivo: "Pague 10" })
})
test("WhatsApp em percentual e depois o percentual da view", () => {
  expect(rotuloDesconto({ ...base, desconto_tipo: "percentual", desconto_valor: 10 })).toEqual({ base: "Desconto · 10%", motivo: null })
  expect(rotuloDesconto({ ...base, desconto_tipo: "valor", desconto_valor: 20, desconto_percentual: 8.3 }).base).toBe("Desconto · 8,3%")
})
test("sem percentual conhecido só diz Desconto; cupom antigo vira motivo", () => {
  expect(rotuloDesconto({ ...base, cupom: "VIP" })).toEqual({ base: "Desconto", motivo: "cupom VIP" })
  expect(rotuloDesconto({ ...base, desconto_codigos: ["A", "B"] }).motivo).toBe("cupom A, B")
})
test("dois descontos juntos não somam percentuais", () => {
  const r = rotuloDesconto({ ...base, descontos: [d({ codigo: "A", percentual: 10 }), d({ tipo: "automatic", titulo: "Frete", percentual: 5 })], desconto_percentual: 14.5 })
  expect(r).toEqual({ base: "Desconto · 14,5%", motivo: "cupom A, Frete" })
})
