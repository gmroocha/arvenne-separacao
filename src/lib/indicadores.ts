import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { intervaloListas } from "@/lib/tempoReal"

// Indicadores do gestor (Fase 4). Toda a conta vem das funções indicadores_* e pontuacao_mes do banco; aqui só se pede e se formata.
export type Periodo = "hoje" | "7dias" | "mes"
export const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: "hoje", nome: "Hoje" },
  { id: "7dias", nome: "7 dias" },
  { id: "mes", nome: "Mês" },
]

const FUSO = "America/Sao_Paulo"
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })

// Soma dias a uma data "aaaa-mm-dd" (sem fuso: é só calendário).
const somarDias = (dia: string, n: number) => {
  const [a, m, d] = dia.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}
// Meia-noite de São Paulo (sem horário de verão desde 2019) como instante ISO.
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString()

// Intervalo [de, ate) do período, em horário de São Paulo; `mes` é o primeiro dia do mês corrente (para a pontuação).
export function intervaloDe(periodo: Periodo, agora = new Date()): { de: string; ate: string; mes: string } {
  const hoje = diaSP.format(agora)
  const mes = `${hoje.slice(0, 7)}-01`
  const proximoMes = somarDias(`${hoje.slice(0, 7)}-28`, 4).slice(0, 7) + "-01"
  if (periodo === "hoje") return { de: meiaNoite(hoje), ate: meiaNoite(somarDias(hoje, 1)), mes }
  if (periodo === "7dias") return { de: meiaNoite(somarDias(hoje, -6)), ate: meiaNoite(somarDias(hoje, 1)), mes }
  return { de: meiaNoite(mes), ate: meiaNoite(proximoMes), mes }
}

const nf = (max: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: max })
export const numero = (v: number | null | undefined, casas = 0) => (v == null ? "—" : nf(casas).format(v))
export const percentual = (v: number | null | undefined) => (v == null ? "—" : `${nf(1).format(v)}%`)
export const horas = (v: number | null | undefined) => (v == null ? "—" : `${nf(1).format(v)} h`)
const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
export const rotuloMes = (mes: string) => nomeMes.format(new Date(`${mes}T00:00:00Z`))

export type TempoEtapa = { etapa: string; horas: number; meta: number | null; passagens: number }
export type ResumoIndicadores = {
  enviados_pedidos: number
  enviados_pecas: number
  prazo_total: number
  prazo_dentro: number
  prazo_pct: number | null
  pecas_separadas: number
  erros_bipagem: number
  faltas_indevidas: number
  erros_por_100: number | null
  problemas_cliente: number
  pegos_antes_pct: number | null
  gargalo: { etapa: string; horas: number } | null
  tempos: TempoEtapa[]
}
export type EtapaDaFila = {
  etapa: string
  total: number
  verde: number
  amarelo: number
  vermelho: number
  mais_antigo: { id: string; numero: string; horas: number | null; desde: string } | null
}
export type PessoaIndicadores = {
  pessoa_id: string
  nome: string
  separacao: number
  conferencia: number
  bipagem: number
  faturamento: number
  embalagem: number
  pronto_envio: number
  enviar_rastreio: number
  minutos_por_peca_separacao: number | null
  erros_separacao: number
  faltas_indevidas: number
  problemas_cliente: number
}
export type Pontuacao = {
  posicao: number
  pessoa_id: string
  nome: string
  pecas: number
  ocorrencias: number
  problemas_cliente: number
  ocorrencias_por_100: number | null
  pecas_por_hora: number | null
  prazo_pct: number | null
  qualidade: number
  producao: number
  prazo: number
  pontuacao: number
  bonus: boolean
}

export const useResumoIndicadores = (de: string, ate: string) =>
  useQuery({
    queryKey: ["indicadores", "resumo", de, ate],
    refetchInterval: intervaloListas,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("indicadores_resumo", { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as ResumoIndicadores
    },
  })

export const useFilaIndicadores = () =>
  useQuery({
    queryKey: ["indicadores", "fila"],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("indicadores_fila")
      if (error) throw error
      return data as unknown as EtapaDaFila[]
    },
  })

export const usePessoasIndicadores = (de: string, ate: string) =>
  useQuery({
    queryKey: ["indicadores", "pessoas", de, ate],
    refetchInterval: intervaloListas,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("indicadores_pessoas", { p_de: de, p_ate: ate })
      if (error) throw error
      return data as unknown as PessoaIndicadores[]
    },
  })

export const usePontuacaoMes = (mes: string) =>
  useQuery({
    queryKey: ["indicadores", "pontuacao", mes],
    refetchInterval: intervaloListas,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pontuacao_mes", { p_mes: mes })
      if (error) throw error
      return data as unknown as Pontuacao[]
    },
  })
