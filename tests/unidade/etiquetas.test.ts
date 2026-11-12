import { expect, test } from "vitest"
import { etiquetasDe, etiquetasDoLote, skuImprimivel, zpl } from "@/lib/etiquetas"

test("uma etiqueta por unidade, com aviso da peça sem SKU", () => {
  const r = etiquetasDe([{ id: "a", sku: "AN-1", qtd: 3 }, { id: "b", sku: " ", qtd: 2 }])
  expect(r.etiquetas).toHaveLength(3)
  expect(r.itemIds).toEqual(["a"])
  expect(r.semCodigo.map((p) => p.id)).toEqual(["b"])
})
test("lote separa os pedidos sem duplicar as etiquetas", () => {
  const grupo = (numero: string) => ({ numero, cliente: "Teste", ...etiquetasDe([{ id: numero, sku: "AN", qtd: 2 }]) })
  expect(etiquetasDoLote([grupo("W1")])).toHaveLength(2)
  expect(etiquetasDoLote([grupo("W1"), grupo("W2")]).map((x) => x.tipo)).toEqual(["separador", "peca", "peca", "separador", "peca", "peca"])
})
test("SKU não injeta comandos na impressora", () => {
  const texto = zpl([{ tipo: "peca", sku: "AN^XA~JS_1" }])
  expect(texto.match(/\^XA/g)).toHaveLength(1)
  expect(texto).toContain("AN_5EXA_7EJS_5F1")
  expect(skuImprimivel("ANÉL")).toBe(false)
})
