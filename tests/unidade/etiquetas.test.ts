import { expect, test } from "vitest"
import { etiquetasDe, etiquetasDoLote, skuImprimivel, zpl } from "@/lib/etiquetas"

test("V98: uma etiqueta por código e variante, nunca pela quantidade, com aviso da peça sem SKU", () => {
  const r = etiquetasDe([{ id: "a", sku: "AN-1", qtd: 3 }, { id: "b", sku: " ", qtd: 2 }])
  expect(r.etiquetas).toHaveLength(1) // a peça de 3 unidades tem uma etiqueta só
  expect(r.itemIds).toEqual(["a"])
  expect(r.semCodigo.map((p) => p.id)).toEqual(["b"])
  // Mesmo código e mesma variante em duas linhas: uma etiqueta; variante diferente: uma de cada.
  const m = etiquetasDe([
    { id: "1", sku: "AN-1", variante: "N°14", qtd: 2 }, { id: "2", sku: "AN-1", variante: " n°14 ", qtd: 1 },
    { id: "3", sku: "AN-1", variante: "N°16", qtd: 5 }, { id: "4", sku: "BR-2", variante: null, qtd: 4 },
  ])
  expect(m.etiquetas.map((e) => (e.tipo === "peca" ? e.sku : ""))).toEqual(["AN-1", "AN-1", "BR-2"])
  expect(m.itemIds).toEqual(["1", "2", "3", "4"]) // todas as linhas contam para marcar depois
})
test("lote separa os pedidos sem duplicar as etiquetas", () => {
  const grupo = (numero: string) => ({ numero, cliente: "Teste", ...etiquetasDe([{ id: numero, sku: "AN", qtd: 2 }, { id: `${numero}b`, sku: "BR", qtd: 3 }]) })
  expect(etiquetasDoLote([grupo("W1")])).toHaveLength(2)
  expect(etiquetasDoLote([grupo("W1"), grupo("W2")]).map((x) => x.tipo)).toEqual(["separador", "peca", "peca", "separador", "peca", "peca"])
})
test("SKU não injeta comandos na impressora", () => {
  const texto = zpl([{ tipo: "peca", sku: "AN^XA~JS_1" }])
  expect(texto.match(/\^XA/g)).toHaveLength(1)
  expect(texto).toContain("AN_5EXA_7EJS_5F1")
  expect(skuImprimivel("ANÉL")).toBe(false)
})
test("etiqueta da live: sem código de barras, com SKU, preço cheio, selo do desconto e preço com desconto", () => {
  const texto = zpl([{ tipo: "live", sku: "LV-BR-1", preco: "R$\u00a040,00", precoDesconto: "R$\u00a034,00", pct: 15 }])
  expect(texto).not.toContain("^BC")
  expect(texto).toContain("^FDLV-BR-1^FS")
  expect(texto).toContain("^FDDe R$ 40,00^FS")
  expect(texto).toContain("^FD-15%^FS")
  expect(texto).toContain("^A0N,72,72^FH_^FDR$ 34,00^FS")
  expect(texto.match(/\^XA/g)).toHaveLength(1)
})
