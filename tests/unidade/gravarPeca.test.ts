import { afterEach, expect, test, vi } from "vitest"
import { gravarPeca } from "@/lib/gravarPeca"

afterEach(() => vi.useRealTimers())

test("repete somente uma vez após timeout confirmado, com pausa", async () => {
  vi.useFakeTimers()
  const executar = vi.fn().mockResolvedValue({ error: { code: "57014", message: "canceling statement due to statement timeout" } })
  const pendente = gravarPeca(executar)
  await vi.advanceTimersByTimeAsync(349)
  expect(executar).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await pendente
  expect(executar).toHaveBeenCalledTimes(2)
})

test.each([
  { code: "", message: "Failed to fetch" },
  { code: "57014", message: "canceling statement due to user request" },
  { code: "P0001", message: "Peça não pertence a este pedido" },
  { code: "", message: "Resposta perdida após gravar" },
])("não repete erro ambíguo ou recusa: $message", async error => {
  const executar = vi.fn().mockResolvedValue({ error })
  expect(await gravarPeca(executar)).toEqual({ error })
  expect(executar).toHaveBeenCalledTimes(1)
})

test("não repete exceção de rede: a primeira operação pode ter sido gravada", async () => {
  const executar = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
  await expect(gravarPeca(executar)).rejects.toThrow("Failed to fetch")
  expect(executar).toHaveBeenCalledTimes(1)
})
