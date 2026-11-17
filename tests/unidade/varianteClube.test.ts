import { expect, test } from "vitest"
import { lerVariante, montarVariante, proximoTipo } from "@/lib/varianteClube"

test("monta a variante do Clube no formato do site", () => {
  expect(montarVariante([{ tipo: "tamanho", valor: "16" }])).toBe("N°16")
  expect(montarVariante([{ tipo: "tamanho", valor: "Grande" }])).toBe("GRANDE")
  expect(montarVariante([{ tipo: "cor", valor: " Verde " }])).toBe("VERDE")
  expect(montarVariante([{ tipo: "outra", valor: "5 mm" }])).toBe("5 MM")
  expect(montarVariante([])).toBeNull()
  expect(montarVariante([{ tipo: "cor", valor: "  " }])).toBeNull()
})

test("grava em maiúsculas, como a Shopify (inclusive acentos)", () => {
  expect(montarVariante([{ tipo: "cor", valor: "citrino" }, { tipo: "tamanho", valor: "14" }])).toBe("CITRINO / N°14")
  expect(montarVariante([{ tipo: "cor", valor: "zircônia" }])).toBe("ZIRCÔNIA")
})

test("peça com mais de uma variante: tamanho sempre por último, como no site", () => {
  expect(montarVariante([{ tipo: "cor", valor: "Azul" }, { tipo: "tamanho", valor: "20" }])).toBe("AZUL / N°20")
  expect(montarVariante([{ tipo: "tamanho", valor: "20" }, { tipo: "cor", valor: "Azul" }])).toBe("AZUL / N°20")
  expect(
    montarVariante([{ tipo: "tamanho", valor: "18" }, { tipo: "cor", valor: "Verde" }, { tipo: "outra", valor: "5 mm" }]),
  ).toBe("VERDE / 5 MM / N°18")
  // Parte vazia não deixa barra sobrando.
  expect(montarVariante([{ tipo: "cor", valor: "" }, { tipo: "tamanho", valor: "20" }])).toBe("N°20")
})

test("sugere o próximo tipo ao adicionar variante", () => {
  expect(proximoTipo([])).toBe("tamanho")
  expect(proximoTipo([{ tipo: "tamanho", valor: "20" }])).toBe("cor")
  expect(proximoTipo([{ tipo: "cor", valor: "Azul" }])).toBe("tamanho")
  expect(proximoTipo([{ tipo: "tamanho", valor: "20" }, { tipo: "cor", valor: "Azul" }])).toBe("outra")
})

test("lê a variante gravada de volta para editar", () => {
  expect(lerVariante("Azul / N°20")).toEqual([{ tipo: "cor", valor: "Azul" }, { tipo: "tamanho", valor: "20" }])
  expect(lerVariante("N°16")).toEqual([{ tipo: "tamanho", valor: "16" }])
  expect(lerVariante("20")).toEqual([{ tipo: "tamanho", valor: "20" }])
  expect(lerVariante("Verde")).toEqual([{ tipo: "cor", valor: "Verde" }])
  expect(lerVariante("Zircônia / 7mm")).toEqual([{ tipo: "cor", valor: "Zircônia" }, { tipo: "outra", valor: "7mm" }])
  expect(lerVariante(null)).toEqual([])
  for (const v of ["AZUL / N°20", "N°16", "GRANDE", "VERDE / 5 MM / N°18", "CITRINO / N°14", "ZIRCÔNIA / 7MM"]) expect(montarVariante(lerVariante(v))).toBe(v)
})
