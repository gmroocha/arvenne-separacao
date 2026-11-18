import type { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ecoProprio } from "@/lib/atualizacaoOperacional"

// Gravação em lote das marcas de progresso das peças (Achei, Conferida, bipada).
// O clique muda a tela na hora; as marcas esperam uns 400 ms, vão juntas ao banco (função marcar_pecas) e só
// há UMA requisição em voo por pedido. As marcas são valores absolutos (não "+1"): repetir um lote é seguro,
// então em falha de rede ou tempo limite elas ficam na fila e são enviadas de novo, sem desfazer a tela.

export type Marca = { item: string; campo: "status" | "conferida" | "bipada"; valor: string | boolean | number; codigo?: string }
export type RespostaLote = {
  pedido: { status: string; status_desde: string; etapa_antes_desvio: string | null; updated_at: string }
  itens: { id: string; status: string; conferido_em: string | null; etiquetado_em: string | null; etiqueta_previa: boolean; qtd_bipada: number; bipado_em: string | null }[]
  eventos: unknown[]
  ignoradas: string[]
}
type ErroEnvio = { code?: string; message?: string } | null
type Envio = { data: unknown; error: ErroEnvio; status?: number }

export type Destino = {
  enviar: (marcas: Marca[]) => PromiseLike<Envio>
  // Resposta do banco; "emFila" são as peças que ainda têm marca nova esperando (a tela dessas já está à frente).
  aoResponder: (resposta: RespostaLote, emFila: Set<string>) => void
  // Erro que repetir não resolve (regra do banco): a tela volta a ler o pedido.
  aoDescartar: (mensagem: string) => void
}

type Fila = { marcas: Map<string, Marca>; ativo: boolean; destino: Destino }
const filas = new WeakMap<QueryClient, Map<string, Fila>>()
const chaveDe = (m: Marca) => `${m.item}:${m.campo}`
export const ESPERA_LOTE_MS = 400
const PAUSAS_MS = [800, 1600, 3200, 5000]
const MAX_FALHAS = 8

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function filaDe(qc: QueryClient, pedidoId: string, destino: Destino): Fila {
  let porPedido = filas.get(qc)
  if (!porPedido) { porPedido = new Map(); filas.set(qc, porPedido) }
  let f = porPedido.get(pedidoId)
  if (!f) { f = { marcas: new Map(), ativo: false, destino }; porPedido.set(pedidoId, f) }
  f.destino = destino
  return f
}

// Falha de rede, tempo limite do banco ou erro do servidor: vale tentar de novo.
export function podeRepetir(e: ErroEnvio, status?: number): boolean {
  if (!e) return false
  if (e.code === "57014" || /statement timeout/i.test(e.message ?? "")) return true
  if (status !== undefined && (status === 0 || status >= 500)) return true
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(e.message ?? "")
}

export const haMarcasNaFila = (qc: QueryClient, pedidoId: string) => (filas.get(qc)?.get(pedidoId)?.marcas.size ?? 0) > 0

async function drenar(qc: QueryClient, pedidoId: string, f: Fila) {
  let falhas = 0
  let avisou = false
  try {
    while (f.marcas.size > 0) {
      await dormir(falhas === 0 ? ESPERA_LOTE_MS : PAUSAS_MS[Math.min(falhas, PAUSAS_MS.length) - 1])
      if (f.marcas.size === 0) break
      const lote = [...f.marcas.values()]
      f.marcas.clear()
      ecoProprio(qc, pedidoId, Infinity) // o Broadcast desta gravação não precisa reler o pedido
      let r: Envio
      try {
        r = await f.destino.enviar(lote)
      } catch (e) {
        r = { data: null, error: { message: e instanceof Error ? e.message : "Falha de rede" }, status: 0 }
      }
      ecoProprio(qc, pedidoId, Date.now() + 3000)
      if (!r.error) {
        falhas = 0
        avisou = false
        f.destino.aoResponder(r.data as RespostaLote, new Set([...f.marcas.values()].map((m) => m.item)))
        continue
      }
      if (!podeRepetir(r.error, r.status)) {
        f.destino.aoDescartar(r.error.message ?? "Erro ao salvar as peças")
        continue
      }
      // Volta as marcas para a fila sem atropelar as que chegaram depois (as novas valem mais).
      for (const m of lote) if (!f.marcas.has(chaveDe(m))) f.marcas.set(chaveDe(m), m)
      falhas += 1
      if (!avisou) {
        avisou = true
        toast.warning("Sem resposta do banco. As peças marcadas continuam na tela e vão ser salvas assim que voltar.")
      }
      if (falhas >= MAX_FALHAS) {
        toast.error("Não consegui salvar as peças marcadas. Confira a internet: tento de novo no próximo toque.")
        break
      }
    }
  } finally {
    f.ativo = false
  }
}

// Põe a marca na fila do pedido e garante que há um envio em andamento (uma mutação do React Query por pedido,
// com chave ["item", pedidoId]: é ela que "Concluir etapa", a leitura do pedido e os testes enxergam).
export function enfileirarMarca(qc: QueryClient, pedidoId: string, marca: Marca, destino: Destino) {
  const f = filaDe(qc, pedidoId, destino)
  // Marca que zera as de baixo (peça volta a pendente; conferida desfeita) derruba as antigas delas na fila.
  if (marca.campo === "status" && marca.valor === "pendente") { f.marcas.delete(`${marca.item}:conferida`); f.marcas.delete(`${marca.item}:bipada`) }
  if (marca.campo === "conferida" && marca.valor === false) f.marcas.delete(`${marca.item}:bipada`)
  f.marcas.set(chaveDe(marca), marca)
  if (f.ativo) return
  f.ativo = true
  const mutacao = qc.getMutationCache().build(qc, {
    mutationKey: ["item", pedidoId],
    meta: { preservarPecas: true },
    scope: { id: `pedido-${pedidoId}` }, // uma gravação por vez por pedido, também em relação a alterar_item
    retry: false,
    mutationFn: () => drenar(qc, pedidoId, f),
  })
  void mutacao.execute(undefined).catch(() => {})
}
