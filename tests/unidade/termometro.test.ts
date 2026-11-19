import { expect, test } from "vitest"
import { COR_TERMOMETRO, termometroDaEtapa, tracoDoTermometro } from "@/lib/termometro"

// O contorno de 1,5 px do cartão só existe para amarelo e vermelho (meta passada); verde e sem termômetro ficam no cinza padrão.
test("tracoDoTermometro: contorno só em amarelo e vermelho", () => {
  expect(tracoDoTermometro("verde")).toBe("")
  expect(tracoDoTermometro(null)).toBe("")
  expect(tracoDoTermometro(undefined)).toBe("")
  expect(tracoDoTermometro("amarelo")).toContain("ring-warning")
  expect(tracoDoTermometro("amarelo")).toContain("ring-(length:--traco)")
  expect(tracoDoTermometro("vermelho")).toContain("ring-destructive")
  expect(tracoDoTermometro("vermelho")).toContain("ring-(length:--traco)")
})

test("o pontinho verde continua existindo mesmo sem contorno", () => {
  expect(COR_TERMOMETRO.verde.ponto).toBe("bg-success")
})

test("termometroDaEtapa: a Fila nunca tem termômetro, mesmo que o banco antigo mande uma cor", () => {
  for (const t of ["verde", "amarelo", "vermelho"] as const) expect(termometroDaEtapa("novo", t)).toBeNull()
  expect(termometroDaEtapa("separacao", "amarelo")).toBe("amarelo")
  expect(termometroDaEtapa("avisar_cliente", "vermelho")).toBe("vermelho")
  expect(termometroDaEtapa("aguardando_cliente", null)).toBeNull()
  expect(termometroDaEtapa("bipagem", undefined)).toBeNull()
})
