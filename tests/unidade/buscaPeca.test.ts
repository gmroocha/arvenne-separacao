import { expect, test } from "vitest"
import { combinaBusca } from "@/lib/buscaPeca"

const peca = { sku: "PU017-Z", nome: "PULSEIRA PONTO DE LUZ CAIXA 7MM COLORIDO", variante: "ZIRCÔNIA", nota: "Embalar separado" }

test("busca de peça: código, nome, variante e nota, sem acento nem maiúscula", () => {
  expect(combinaBusca(peca, "")).toBe(true)
  expect(combinaBusca(peca, "pu017-z")).toBe(true)
  expect(combinaBusca(peca, "pu017z")).toBe(true)
  expect(combinaBusca(peca, "zirconia")).toBe(true)
  expect(combinaBusca(peca, "pulseira luz")).toBe(true)
  expect(combinaBusca(peca, "embalar")).toBe(true)
  expect(combinaBusca(peca, "pulseira esmeralda")).toBe(false)
  expect(combinaBusca(peca, "AN")).toBe(false)
  expect(combinaBusca({ sku: null, nome: "Anel", variante: null }, "anel")).toBe(true)
})
