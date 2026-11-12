import { expect, test } from "vitest"
import { sincronizarEmPartes, type RespostaSync } from "@/lib/sincronizar"

test("V25: sincronização incompleta continua de onde parou e soma o resultado", async () => {
  const chamadas: unknown[] = []
  const respostas: RespostaSync[] = [
    { importados: 2, incompleto: true, continuar: "c1" },
    { importados: 1, erros: [{ numero: "#1", erro: "x" }], incompleto: false, continuar: null },
  ]
  const r = await sincronizarEmPartes(async (corpo) => { chamadas.push(corpo); return respostas.shift()! })
  expect(chamadas).toEqual([{}, { continuar: "c1" }])
  expect(r).toEqual({ importados: 3, erros: [{ numero: "#1", erro: "x" }], incompleto: false, partes: 2 })
})

test("V25: depois do limite de partes, avisa que ficou incompleto", async () => {
  const r = await sincronizarEmPartes(async () => ({ importados: 0, incompleto: true, continuar: "c" }), 3)
  expect(r).toMatchObject({ incompleto: true, partes: 3 })
})
