import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { ecoProprio, ehEcoProprio } from "@/lib/atualizacaoOperacional"
import { enfileirarMarca, ESPERA_LOTE_MS, haMarcasNaFila, podeRepetir, type Destino, type Marca, type RespostaLote } from "@/lib/lotePecas"

vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const resposta = (status = "separacao"): RespostaLote => ({ pedido: { status, status_desde: "", etapa_antes_desvio: null, updated_at: "" }, itens: [], eventos: [], ignoradas: [] })
const marca = (item: string, campo: Marca["campo"] = "status", valor: Marca["valor"] = "encontrado"): Marca => ({ item, campo, valor })

let qc: QueryClient
beforeEach(() => { vi.useFakeTimers(); qc = new QueryClient() })
afterEach(() => { vi.useRealTimers() })

function destinoCom(enviar: Destino["enviar"]) {
  const aoResponder = vi.fn<Destino["aoResponder"]>()
  const aoDescartar = vi.fn<Destino["aoDescartar"]>()
  return { enviar, aoResponder, aoDescartar } satisfies Destino
}

test("V81: cliques em rajada viram uma requisição só, com uma em voo por pedido", async () => {
  let emVoo = 0, maxVoo = 0
  const lotes: Marca[][] = []
  const d = destinoCom(async (m) => {
    lotes.push(m); emVoo++; maxVoo = Math.max(maxVoo, emVoo)
    await new Promise((r) => setTimeout(r, 300))
    emVoo--
    return { data: resposta(), error: null }
  })
  for (let n = 0; n < 12; n++) enfileirarMarca(qc, "p1", marca(`i${n}`), d)
  expect(haMarcasNaFila(qc, "p1")).toBe(true)
  expect(qc.isMutating({ mutationKey: ["item", "p1"] })).toBe(1) // é o que a leitura do pedido e "mover etapa" enxergam
  await vi.advanceTimersByTimeAsync(ESPERA_LOTE_MS + 10)
  // Durante o voo chegam mais três cliques: vão no lote seguinte, nunca em paralelo.
  for (let n = 12; n < 15; n++) enfileirarMarca(qc, "p1", marca(`i${n}`), d)
  await vi.advanceTimersByTimeAsync(2000)
  expect(lotes.map((l) => l.length)).toEqual([12, 3])
  expect(maxVoo).toBe(1)
  expect(d.aoResponder).toHaveBeenCalledTimes(2)
  expect(haMarcasNaFila(qc, "p1")).toBe(false)
  expect(qc.isMutating({ mutationKey: ["item", "p1"] })).toBe(0)
})

test("V81: a última marca de cada peça e campo vale; desfazer derruba as marcas de baixo", async () => {
  const lotes: Marca[][] = []
  const d = destinoCom(async (m) => { lotes.push(m); return { data: resposta(), error: null } })
  enfileirarMarca(qc, "p1", marca("a", "conferida", true), d)
  enfileirarMarca(qc, "p1", marca("a", "bipada", 1), d)
  enfileirarMarca(qc, "p1", marca("a", "status", "pendente"), d) // zera conferida e bipada que ainda não saíram
  enfileirarMarca(qc, "p1", marca("a", "status", "encontrado"), d) // achei de novo: só o status
  enfileirarMarca(qc, "p1", marca("b", "conferida", true), d)
  enfileirarMarca(qc, "p1", marca("b", "conferida", false), d)
  await vi.advanceTimersByTimeAsync(ESPERA_LOTE_MS + 10)
  expect(lotes).toEqual([[marca("a", "status", "encontrado"), marca("b", "conferida", false)]])
})

test("V81: tempo limite do banco repete as mesmas marcas sem perder as novas; a tela não é desfeita", async () => {
  const lotes: Marca[][] = []
  let n = 0
  const d = destinoCom(async (m) => {
    lotes.push(m.map((x) => ({ ...x }))); n++
    return n === 1 ? { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, status: 500 } : { data: resposta(), error: null }
  })
  enfileirarMarca(qc, "p1", marca("a"), d)
  enfileirarMarca(qc, "p1", marca("b"), d)
  await vi.advanceTimersByTimeAsync(ESPERA_LOTE_MS + 10)
  expect(lotes).toHaveLength(1)
  enfileirarMarca(qc, "p1", marca("a", "status", "pendente"), d) // mudou de ideia durante a espera
  enfileirarMarca(qc, "p1", marca("c"), d)
  await vi.advanceTimersByTimeAsync(5000)
  expect(lotes).toHaveLength(2)
  expect(lotes[1]).toEqual([marca("a", "status", "pendente"), marca("b"), marca("c")]) // a marca mais nova de "a" vence; "b" voltou à fila
  expect(d.aoDescartar).not.toHaveBeenCalled()
  expect(d.aoResponder).toHaveBeenCalledTimes(1)
  expect(haMarcasNaFila(qc, "p1")).toBe(false)
})

test("V81: erro de regra do banco não se repete: descarta o lote e avisa", async () => {
  const d = destinoCom(async () => ({ data: null, error: { code: "P0001", message: "Peça não pertence a este pedido" }, status: 400 }))
  enfileirarMarca(qc, "p1", marca("a"), d)
  await vi.advanceTimersByTimeAsync(3000)
  expect(d.enviar).toBeDefined()
  expect(d.aoDescartar).toHaveBeenCalledWith("Peça não pertence a este pedido")
  expect(haMarcasNaFila(qc, "p1")).toBe(false)
})

test("V81: pedidos diferentes têm filas independentes", async () => {
  const chamadas: string[] = []
  const mk = (id: string) => destinoCom(async () => { chamadas.push(id); return { data: resposta(), error: null } })
  enfileirarMarca(qc, "p1", marca("a"), mk("p1"))
  enfileirarMarca(qc, "p2", marca("b"), mk("p2"))
  await vi.advanceTimersByTimeAsync(ESPERA_LOTE_MS + 10)
  expect(chamadas.sort()).toEqual(["p1", "p2"])
})

test("V81: quais erros valem uma nova tentativa", () => {
  expect(podeRepetir({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(true)
  expect(podeRepetir({ message: "TypeError: Failed to fetch" })).toBe(true)
  expect(podeRepetir({ message: "Bad gateway" }, 502)).toBe(true)
  expect(podeRepetir({ code: "P0001", message: "O código lido não é o SKU desta peça" }, 400)).toBe(false)
  expect(podeRepetir(null)).toBe(false)
})

test("V81: o eco do Broadcast da própria gravação é ignorado só enquanto vale", () => {
  expect(ehEcoProprio(qc, "p1")).toBe(false)
  ecoProprio(qc, "p1", Infinity) // requisição em voo
  expect(ehEcoProprio(qc, "p1")).toBe(true)
  ecoProprio(qc, "p1", Date.now() + 3000)
  expect(ehEcoProprio(qc, "p1")).toBe(true)
  vi.setSystemTime(Date.now() + 3500)
  expect(ehEcoProprio(qc, "p1")).toBe(false)
  expect(ehEcoProprio(qc, "outro")).toBe(false)
})
