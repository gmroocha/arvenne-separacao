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

test("tempo limite do banco vira mensagem compreensível", async () => {
  const { msg } = await import("@/lib/api")
  expect(msg({ message: "canceling statement due to statement timeout", code: "57014" })).toMatch(/demorou para responder/)
  expect(msg(new Error("Conclua a separação"))).toBe("Conclua a separação")
})

test("mudar de etapa espera as peças ainda na fila de gravação do pedido", async () => {
  const { QueryClient } = await import("@tanstack/react-query")
  const { esperarFilaDoPedido } = await import("@/lib/api")
  const qc = new QueryClient()
  let gravou = false
  const fila = qc.getMutationCache().build(qc, {
    mutationKey: ["item", "p1"],
    mutationFn: async () => { await new Promise((r) => setTimeout(r, 300)); gravou = true },
  })
  void fila.execute(undefined)
  await esperarFilaDoPedido(qc, "p1")
  expect(gravou).toBe(true)
  await esperarFilaDoPedido(qc, "p2") // outro pedido não espera
})
