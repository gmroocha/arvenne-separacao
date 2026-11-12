import { describe, expect, test } from "vitest"
import fc from "fast-check"
import { digitos, formatarPrazo, lerNumero, linkWhatsApp, mascaraTelefone, numeroParaTexto } from "@/lib/formato"

describe("entrada de valores e contatos", () => {
  test.each([
    ["10,50", 10.5], ["10.50", 10.5], ["1.234,56", 1234.56], ["1,234.56", 1234.56],
    ["R$ 1.234,56", 1234.56], ["1.234", 1234], ["0", 0], ["", null], ["-10", null], ["Infinity", null],
  ])("converte %s", (entrada, esperado) => { expect(lerNumero(entrada)).toBe(esperado) })

  test("qualquer valor em centavos volta do formato brasileiro sem mudar", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000 }), (centavos) => {
      expect(lerNumero(numeroParaTexto(centavos / 100))).toBe(centavos / 100)
    }), { numRuns: 200, seed: 20261112 })
  })

  test.each(["teste", "123", ""]) ("não monta WhatsApp com telefone %s", (telefone) => {
    expect(linkWhatsApp(telefone, "Olá")).toBeNull()
  })
  test("telefone colado com +55 mantém DDD e número e não duplica país", () => {
    expect(mascaraTelefone("+55 (11) 99999-0000")).toBe("(11) 99999-0000")
    expect(linkWhatsApp("+55 (11) 99999-0000", "Olá & oi")).toBe("https://wa.me/5511999990000?text=Ol%C3%A1%20%26%20oi")
    expect(digitos("12.345-6")).toBe("123456")
  })
  test("prazo formata o instante do banco sem criar outro vencimento", () => {
    const alvo = "2026-11-12T18:00:00Z"
    expect(formatarPrazo(alvo, 1, Date.parse("2026-11-12T17:00:00Z")).texto).toBe("vence hoje 15:00")
    expect(formatarPrazo(alvo, null, Date.parse("2026-11-12T20:00:00Z")).texto).toBe("atrasado 2 h")
    expect(formatarPrazo(null, null).texto).toBe("sem prazo")
  })
})
