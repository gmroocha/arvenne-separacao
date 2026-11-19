// Períodos da tela de Indicadores (puro, sem rede): intervalos [de, ate) em horário de São Paulo.
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
