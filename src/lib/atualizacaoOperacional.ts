import type { QueryClient } from "@tanstack/react-query"

type Lote = { pedidos: Set<string>; tudo: boolean; troca: boolean; pesado: boolean; timer?: ReturnType<typeof setTimeout> }
const lotes = new WeakMap<QueryClient, Lote>()

// A confirmação local e o Broadcast usam o mesmo relógio. Nenhum evento é ignorado:
// eventos posteriores à leitura iniciam outro lote, inclusive os de outra pessoa.
// Eco do Broadcast: a gravação feita por esta aba já está na tela, então o aviso que o banco manda sobre ela
// não precisa reler o pedido. `ate` = até quando ignorar (Infinity enquanto a requisição está em voo).
const ecos = new WeakMap<QueryClient, Map<string, number>>()
export function ecoProprio(qc: QueryClient, pedidoId: string, ate: number) {
  let m = ecos.get(qc)
  if (!m) { m = new Map(); ecos.set(qc, m) }
  m.set(pedidoId, ate)
}
export const ehEcoProprio = (qc: QueryClient, pedidoId: string) => (ecos.get(qc)?.get(pedidoId) ?? 0) > Date.now()

export function agendarAtualizacaoOperacional(
  qc: QueryClient, ids: string[],
  { espera = 1200, tudo = false, troca = false, pesado = true } = {},
) {
  let lote = lotes.get(qc)
  if (!lote) { lote = { pedidos: new Set(), tudo: false, troca: false, pesado: false }; lotes.set(qc, lote) }
  for (const id of ids) lote.pedidos.add(id)
  lote.tudo ||= tudo
  lote.troca ||= troca
  lote.pesado ||= pesado
  clearTimeout(lote.timer)
  const atual = lote
  lote.timer = setTimeout(function rodar() {
    if (qc.isMutating() > 0) { atual.timer = setTimeout(rodar, 800); return }
    lotes.delete(qc)
    const modo = typeof document !== 'undefined' && document.hidden ? { refetchType: 'none' as const } : {}
    if (atual.pesado) {
      qc.invalidateQueries({ queryKey: ['pedidos'], ...modo })
      qc.invalidateQueries({ queryKey: ['repetidas'], predicate: q => q.queryKey[1] !== 'contagem', ...modo })
      qc.invalidateQueries({ queryKey: ['repetidas', 'contagem'], refetchType: 'none' })
      if (atual.tudo) qc.invalidateQueries({ queryKey: ['pedido'], ...modo })
      else for (const id of atual.pedidos) qc.invalidateQueries({ queryKey: ['pedido', id], ...modo })
    }
    qc.invalidateQueries({ queryKey: ['acerto'], ...modo })
    if (atual.troca) qc.invalidateQueries({ queryKey: ['troca'], ...modo })
  }, espera)
}
