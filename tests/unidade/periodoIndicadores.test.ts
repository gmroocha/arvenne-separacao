import { describe, expect, test } from "vitest"
import { intervaloDe } from "@/lib/periodoIndicadores"

// Os períodos dos Indicadores são dias de São Paulo (UTC-3), qualquer que seja o fuso do aparelho.
describe("intervaloDe", () => {
  test("23:30 em São Paulo já é o dia seguinte em UTC, mas o 'hoje' continua sendo o dia de São Paulo", () => {
    const agora = new Date("2026-11-20T02:30:00Z") // 19/11 23:30 em São Paulo
    expect(intervaloDe("hoje", agora)).toEqual({ de: "2026-11-19T03:00:00.000Z", ate: "2026-11-20T03:00:00.000Z", mes: "2026-11-01" })
  })

  test("fevereiro: o mês termina no dia 1º de março; 7 dias volta seis dias", () => {
    const agora = new Date("2026-02-10T15:00:00Z")
    expect(intervaloDe("mes", agora)).toEqual({ de: "2026-02-01T03:00:00.000Z", ate: "2026-03-01T03:00:00.000Z", mes: "2026-02-01" })
    expect(intervaloDe("7dias", agora).de).toBe("2026-02-04T03:00:00.000Z")
  })

  test("virada de mês: 7 dias atravessa o fim de fevereiro; o mês de dezembro termina em janeiro", () => {
    expect(intervaloDe("7dias", new Date("2026-03-02T15:00:00Z"))).toMatchObject({ de: "2026-02-24T03:00:00.000Z", ate: "2026-03-03T03:00:00.000Z" })
    const fim = new Date("2027-01-01T02:59:00Z") // 31/12 23:59 em São Paulo
    expect(intervaloDe("hoje", fim)).toEqual({ de: "2026-12-31T03:00:00.000Z", ate: "2027-01-01T03:00:00.000Z", mes: "2026-12-01" })
    expect(intervaloDe("mes", fim).ate).toBe("2027-01-01T03:00:00.000Z")
  })
})
