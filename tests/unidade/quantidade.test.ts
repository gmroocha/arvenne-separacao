import { describe, expect, it } from "vitest"
import { quantidadeDigitada } from "../../src/lib/quantidade"

describe("V103: quantidade digitada", () => {
  it("aceita só números e respeita o mínimo e o máximo", () => {
    expect(quantidadeDigitada("5", 2)).toBe(5)
    expect(quantidadeDigitada("0", 2)).toBe(1)
    expect(quantidadeDigitada("0", 2, 0)).toBe(0)
    expect(quantidadeDigitada("9", 2, 1, 4)).toBe(4)
    expect(quantidadeDigitada("1a2", 2)).toBe(12)
  })
  it("vazio ou sem número volta ao valor que estava", () => {
    expect(quantidadeDigitada("", 3)).toBe(3)
    expect(quantidadeDigitada("   ", 3)).toBe(3)
    expect(quantidadeDigitada("abc", 3, 1, 9)).toBe(3)
  })
})
