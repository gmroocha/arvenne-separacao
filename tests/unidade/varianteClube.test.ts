import { expect, test } from "vitest"
import { lerVariante, montarVariante } from "@/lib/varianteClube"

test("monta a variante do Clube no formato do site", () => {
  const base = { tamanho: "", cor: "", outra: "" }
  expect(montarVariante({ ...base, tipo: "tamanho", tamanho: "16" })).toBe("N°16")
  expect(montarVariante({ ...base, tipo: "tamanho", tamanho: "Grande" })).toBe("Grande")
  expect(montarVariante({ ...base, tipo: "cor", cor: " Verde " })).toBe("Verde")
  expect(montarVariante({ ...base, tipo: "tamanho_cor", cor: "Azul", tamanho: "20" })).toBe("Azul / N°20")
  expect(montarVariante({ ...base, tipo: "outra", outra: "5 mm" })).toBe("5 mm")
  expect(montarVariante({ ...base, tipo: "nenhuma", outra: "x" })).toBeNull()
  expect(montarVariante({ ...base, tipo: "cor" })).toBeNull()
})

test("lê a variante gravada de volta para editar", () => {
  expect(lerVariante("Azul / N°20")).toMatchObject({ tipo: "tamanho_cor", cor: "Azul", tamanho: "20" })
  expect(lerVariante("N°16")).toMatchObject({ tipo: "tamanho", tamanho: "16" })
  expect(lerVariante("20")).toMatchObject({ tipo: "tamanho", tamanho: "20" })
  expect(lerVariante("Verde")).toMatchObject({ tipo: "outra", outra: "Verde" })
  expect(lerVariante(null)).toMatchObject({ tipo: "nenhuma" })
  for (const v of ["Azul / N°20", "N°16", "Grande"]) expect(montarVariante(lerVariante(v))).toBe(v)
})
