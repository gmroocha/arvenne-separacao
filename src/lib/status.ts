export const ETAPAS = [
  { id: "em_aberto", nome: "Em aberto" },
  { id: "aguardando_pagamento", nome: "Aguardando pagamento" },
  { id: "novo", nome: "Novo" },
  { id: "separacao", nome: "Separação" },
  { id: "aguardando_cliente", nome: "Aguardando cliente" },
  { id: "conferencia", nome: "Conferência e etiquetas" },
  { id: "faturamento", nome: "Nota, Bling e frete" },
  { id: "embalagem", nome: "Embalagem" },
  { id: "pronto_envio", nome: "Correios" },
  { id: "enviado", nome: "Enviado" },
  { id: "cancelado", nome: "Cancelado" },
  { id: "perdida", nome: "Perdida" },
] as const

export type StatusPedido = (typeof ETAPAS)[number]["id"]

export const NOME_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.nome])) as Record<StatusPedido, string>

// Fase derivada do status (a mesma regra da view v_pedidos).
export type Fase = "venda" | "expedicao" | "arquivo"

export const FASE_DE: Record<StatusPedido, Fase> = {
  em_aberto: "venda",
  aguardando_pagamento: "venda",
  novo: "expedicao",
  separacao: "expedicao",
  aguardando_cliente: "expedicao",
  conferencia: "expedicao",
  faturamento: "expedicao",
  embalagem: "expedicao",
  pronto_envio: "expedicao",
  enviado: "arquivo",
  cancelado: "arquivo",
  perdida: "arquivo",
}

// Etapas de expedição, na ordem em que aparecem em "Mover para…".
export const ETAPAS_EXPEDICAO: StatusPedido[] = [
  "novo", "separacao", "aguardando_cliente", "conferencia", "faturamento", "embalagem", "pronto_envio", "enviado",
]

// Linha de etapas da tela do pedido. "Aguardando cliente" não é um passo: é um desvio da Separação.
export const PASSOS = [
  { id: "separacao", nome: "Separação", statuses: ["novo", "separacao", "aguardando_cliente"] },
  { id: "conferencia", nome: "Conferência", statuses: ["conferencia"] },
  { id: "faturamento", nome: "Nota/Bling/frete", statuses: ["faturamento"] },
  { id: "embalagem", nome: "Embalagem", statuses: ["embalagem"] },
  { id: "pronto_envio", nome: "Correios", statuses: ["pronto_envio"] },
  { id: "enviado", nome: "Enviado", statuses: ["enviado"] },
] as const satisfies readonly { id: string; nome: string; statuses: readonly StatusPedido[] }[]

export type Passo = (typeof PASSOS)[number]

export function passoDe(s: StatusPedido): number {
  return PASSOS.findIndex((p) => (p.statuses as readonly StatusPedido[]).includes(s))
}

// Caminho normal da expedição. Etapas de venda, "aguardando_cliente" e "cancelado" ficam fora.
const FLUXO: StatusPedido[] = [
  "novo", "separacao", "conferencia", "faturamento", "embalagem", "pronto_envio", "enviado",
]

export function proximaEtapa(s: StatusPedido): StatusPedido | null {
  if (s === "aguardando_cliente") return "separacao"
  const i = FLUXO.indexOf(s)
  return i >= 0 && i < FLUXO.length - 1 ? FLUXO[i + 1] : null
}

export type StatusItem = "pendente" | "encontrado" | "falta" | "defeito" | "removido"

export const NOME_ITEM: Record<StatusItem, string> = {
  pendente: "Pendente",
  encontrado: "Encontrado",
  falta: "Em falta",
  defeito: "Defeito",
  removido: "Removido",
}

export function tempoDesde(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}
