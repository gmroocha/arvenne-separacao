import { describe, expect, test } from "vitest"
import fc from "fast-check"
import { deCampoDataHora, digitos, formatarPrazo, lerNumero, linkWhatsApp, mascaraTelefone, numeroParaTexto, paraCampoDataHora } from "@/lib/formato"

describe("entrada de valores e contatos", () => {
  test.each([
    ["10,50", 10.5], ["10.50", 10.5], ["1.234,56", 1234.56], ["1,234.56", 1234.56],
    ["R$ 1.234,56", 1234.56], ["1.234", 1234], ["0", 0], ["", null], ["-10", null], ["Infinity", null],
  ])("converte %s", (entrada, esperado) => { expect(lerNumero(entrada)).toBe(esperado) })

  // V30: texto malformado era aceito como outro valor (10,,50 virava 1050).
  test.each(["10,,50", "1.2.3", "1,2,3", "12.34.5", "1.234.5", "1,234,5", "1.23,4.5", "10,", ",5", "1234.567"])(
    "V30: recusa %s em vez de inventar valor", (entrada) => { expect(lerNumero(entrada)).toBeNull() })
  test.each([["1.234.567,89", 1234567.89], ["1,234,567", 1234567], ["0,5", 0.5], ["1234,5", 1234.5]])(
    "V30: aceita %s", (entrada, esperado) => { expect(lerNumero(entrada)).toBe(esperado) })

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

// Data do pagamento editável: o campo mostra e grava sempre no horário de São Paulo.
describe("campo de data e hora do pagamento", () => {
  test("mostra o horário de São Paulo e volta para o mesmo instante", () => {
    expect(paraCampoDataHora("2026-11-10T12:15:00.000Z")).toBe("2026-11-10T09:15")
    expect(deCampoDataHora("2026-11-10T09:15")).toBe("2026-11-10T12:15:00.000Z")
    expect(paraCampoDataHora("2026-11-11T01:30:00.000Z")).toBe("2026-11-10T22:30")
  })
  test.each(["", "2026-11-10", "10/11/2026 09:15", "2026-13-40T99:99"])("recusa %s", (texto) => {
    expect(deCampoDataHora(texto)).toBeNull()
  })
  test("qualquer minuto vai e volta sem mudar", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 60 * 24 * 365 * 5 }), (min) => {
      const iso = new Date(Date.UTC(2025, 0, 1) + min * 60_000).toISOString()
      expect(deCampoDataHora(paraCampoDataHora(iso))).toBe(iso)
    }), { numRuns: 200, seed: 20261118 })
  })
})
