export const ETAPAS = [
  { id: "novo", nome: "Novo" },
  { id: "separacao", nome: "Separação" },
  { id: "aguardando_cliente", nome: "Aguardando cliente" },
  { id: "conferencia", nome: "Conferência e etiquetas" },
  { id: "faturamento", nome: "Nota, Bling e frete" },
  { id: "embalagem", nome: "Embalagem" },
  { id: "pronto_envio", nome: "Pronto p/ Correios" },
  { id: "enviado", nome: "Enviado" },
  { id: "cancelado", nome: "Cancelado" },
] as const

export type StatusPedido = (typeof ETAPAS)[number]["id"]

export const NOME_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.nome])) as Record<StatusPedido, string>

// Caminho normal. "aguardando_cliente" e "cancelado" ficam fora: são desvios.
const FLUXO: StatusPedido[] = [
  "novo", "separacao", "conferencia", "faturamento", "embalagem", "pronto_envio", "enviado",
]

export function proximaEtapa(s: StatusPedido): StatusPedido | null {
  if (s === "aguardando_cliente") return "separacao"
  const i = FLUXO.indexOf(s)
  return i >= 0 && i < FLUXO.length - 1 ? FLUXO[i + 1] : null
}

export const ABERTOS: StatusPedido[] = ETAPAS.map((e) => e.id).filter(
  (s) => s !== "enviado" && s !== "cancelado",
)

export type StatusItem = "pendente" | "encontrado" | "falta" | "defeito" | "removido"

export const NOME_ITEM: Record<StatusItem, string> = {
  pendente: "Pendente",
  encontrado: "Encontrado",
  falta: "Em falta",
  defeito: "Defeito",
  removido: "Removido",
}

export function tempoDesde(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}
