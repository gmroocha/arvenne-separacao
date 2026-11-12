import { expect, test } from "vitest"
import { lerAvisosVistoria } from "@/lib/vistoria"

test("aviso do banco preserva a referência do pedido sem recalcular números", () => {
  const aviso = { pedido_id: "pedido", numero: "W1", regra: "etapa_adiantada", detalhe: "Confira as peças." }
  expect(lerAvisosVistoria([aviso])).toEqual([aviso])
})
test("JSON inválido não quebra a navegação", () => {
  expect(lerAvisosVistoria(null)).toEqual([])
  expect(lerAvisosVistoria([null, "texto", [], {}, { numero: "W1", detalhe: 4 }])).toEqual([])
})
