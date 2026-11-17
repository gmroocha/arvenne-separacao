import { afterEach, expect, test, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
vi.mock("@/lib/supabase", () => ({ supabase: {}, chamarFuncao: vi.fn() }))
import { esperarFilaDoPedido } from "@/lib/api"

afterEach(() => vi.useRealTimers())

test("fila ainda gravando ao atingir o limite não libera a próxima etapa", async () => {
  vi.useFakeTimers()
  const qc = new QueryClient()
  vi.spyOn(qc, "isMutating").mockReturnValue(1)
  const resultado = expect(esperarFilaDoPedido(qc, "pedido", 200)).rejects.toThrow("Ainda há peças sendo salvas")
  await vi.advanceTimersByTimeAsync(200)
  await resultado
})

test("libera a próxima etapa assim que todas as peças terminam", async () => {
  vi.useFakeTimers()
  const qc = new QueryClient()
  const contando = vi.spyOn(qc, "isMutating").mockReturnValue(1)
  const resultado = esperarFilaDoPedido(qc, "pedido", 500)
  await vi.advanceTimersByTimeAsync(100)
  contando.mockReturnValue(0)
  await vi.advanceTimersByTimeAsync(100)
  await expect(resultado).resolves.toBeUndefined()
})
