import { describe, expect, it } from "vitest"
import { avisoChaveNota, chaveNotaValida, formatarChaveNota, limparChaveNota } from "@/lib/chaveNota"

const CHAVE = "35240112345678000190550010000001231000001230"

describe("chave de acesso da nota fiscal", () => {
  it("tem 44 números de exemplo", () => {
    expect(CHAVE).toHaveLength(44)
  })

  it("limpa espaços, pontos, traços e quebras de linha", () => {
    const colada = "3524 0112.3456-7800 0190\n5500 1000 0001 2310 0000 1230"
    expect(limparChaveNota(colada)).toBe(CHAVE)
    expect(limparChaveNota(null)).toBe("")
    expect(limparChaveNota("abc")).toBe("")
  })

  it("mostra em grupos de 4 e volta ao mesmo número ao limpar", () => {
    const f = formatarChaveNota(CHAVE)
    expect(f.split(" ")).toHaveLength(11)
    expect(f.split(" ").every((g) => g.length === 4)).toBe(true)
    expect(limparChaveNota(f)).toBe(CHAVE)
    expect(formatarChaveNota("12345")).toBe("1234 5")
    expect(formatarChaveNota("")).toBe("")
  })

  it("só vale com exatamente 44 números", () => {
    expect(chaveNotaValida(CHAVE)).toBe(true)
    expect(chaveNotaValida(formatarChaveNota(CHAVE))).toBe(true)
    expect(chaveNotaValida(CHAVE.slice(1))).toBe(false)
    expect(chaveNotaValida(CHAVE + "1")).toBe(false)
    expect(chaveNotaValida("")).toBe(false)
  })

  it("avisa quando faltam ou sobram números; vazio e certo não avisam", () => {
    expect(avisoChaveNota("")).toBeNull()
    expect(avisoChaveNota(null)).toBeNull()
    expect(avisoChaveNota(CHAVE)).toBeNull()
    expect(avisoChaveNota(CHAVE.slice(0, 40))).toBe("Faltam 4 números: a chave tem 44 (você tem 40).")
    expect(avisoChaveNota(CHAVE + "12")).toBe("Sobram 2 números: a chave tem 44 (você tem 46).")
  })
})
