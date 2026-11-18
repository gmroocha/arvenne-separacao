import { afterEach, expect, test, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { agendarAtualizacaoOperacional } from "@/lib/atualizacaoOperacional"

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
test('V80: fim da fila e Broadcast compartilham uma leitura por tela, preservando todos os pedidos', async () => {
  vi.useFakeTimers()
  const clientes = [new QueryClient(), new QueryClient(), new QueryClient()]
  const invalidacoes = clientes.map(qc => vi.spyOn(qc, 'invalidateQueries'))
  for (let i = 0; i < 30; i++) {
    for (const qc of clientes) agendarAtualizacaoOperacional(qc, ['pedido-a'], { espera: 1200 })
    await vi.advanceTimersByTimeAsync(20)
  }
  agendarAtualizacaoOperacional(clientes[0], ['pedido-a'], { espera: 600 })
  agendarAtualizacaoOperacional(clientes[0], ['pedido-b'], { espera: 1200 })
  await vi.advanceTimersByTimeAsync(1500)
  for (const spy of invalidacoes) expect(spy.mock.calls.filter(([q]) => q?.queryKey?.[0] === 'pedidos')).toHaveLength(1)
  expect(invalidacoes[0]).toHaveBeenCalledWith({ queryKey: ['pedido', 'pedido-b'] })
  // Uma alteração posterior de outra pessoa nunca é descartada como se fosse nosso eco.
  agendarAtualizacaoOperacional(clientes[0], ['pedido-a'])
  await vi.advanceTimersByTimeAsync(1500)
  expect(invalidacoes[0].mock.calls.filter(([q]) => q?.queryKey?.[0] === 'pedidos')).toHaveLength(2)
})
test('V80: espera gravações pendentes e aba oculta apenas marca o cache desatualizado', async () => {
  vi.useFakeTimers()
  const qc = new QueryClient()
  const spy = vi.spyOn(qc, 'invalidateQueries')
  const mutando = vi.spyOn(qc, 'isMutating').mockReturnValue(1)
  agendarAtualizacaoOperacional(qc, ['pedido-a'])
  await vi.advanceTimersByTimeAsync(2000)
  expect(spy).not.toHaveBeenCalled()
  mutando.mockReturnValue(0)
  vi.stubGlobal('document', { hidden: true })
  await vi.advanceTimersByTimeAsync(1000)
  expect(spy).toHaveBeenCalledWith({ queryKey: ['pedido', 'pedido-a'], refetchType: 'none' })
})
