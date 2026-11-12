import { expect, test } from "vitest"
import { agruparPorTamanho, codigoDoModelo, codigoModelo, separarTamanho } from "@/lib/variante"

test("agrupa tamanhos sem misturar pedras ou unidades de medida", () => {
  expect(separarTamanho("ABALONE / N°12")).toEqual({ base: "ABALONE", tamanho: "N°12" })
  expect(separarTamanho("ZIRCÔNIA / 7MM")).toEqual({ base: "ZIRCÔNIA / 7MM", tamanho: null })
  const itens = [
    { id: "a", produto: "Anel", variante: "Abalone / N°16" },
    { id: "b", produto: "Anel", variante: "Abalone / N°9" },
    { id: "c", produto: "Anel", variante: "Madrepérola / N°16" },
  ]
  const grupos = agruparPorTamanho(itens, (i) => i)
  expect(grupos).toHaveLength(2)
  expect(grupos[0].tamanhos.map((t) => t.item.id)).toEqual(["b", "a"])
})
test("código do modelo preserva os números que não são o tamanho", () => {
  expect(codigoModelo(["AN3243-20", "AN3243-24"])).toBe("AN3243")
  expect(codigoDoModelo([{ sku: "AN-CC-2-14", tamanho: "14" }, { sku: "AN-CC-2-16", tamanho: "16" }])).toBe("AN-CC-2")
})
