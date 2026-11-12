import {
  Check, Eye, FileText, Inbox, ListChecks, BellRing, MessageCircleWarning, Package, ScanBarcode, Send, Tag, Truck,
  type LucideIcon,
} from "lucide-react"

export const ETAPAS = [
  { id: "em_aberto", nome: "Em aberto" },
  { id: "aguardando_pagamento", nome: "Aguardando pagamento" },
  { id: "novo", nome: "Novo" },
  { id: "separacao", nome: "Separação" },
  { id: "avisar_cliente", nome: "Avisar cliente" },
  { id: "aguardando_cliente", nome: "Aguardando cliente" },
  { id: "conferencia", nome: "Conferência" },
  { id: "etiquetagem", nome: "Etiquetagem" },
  { id: "bipagem", nome: "Bipagem" },
  { id: "faturamento", nome: "Nota e frete" },
  { id: "embalagem", nome: "Embalagem" },
  { id: "pronto_envio", nome: "Postagem" },
  { id: "enviado", nome: "Enviado" },
  { id: "cancelado", nome: "Cancelado" },
  { id: "perdida", nome: "Perdida" },
  { id: "somada", nome: "Somada" },
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
  avisar_cliente: "expedicao",
  aguardando_cliente: "expedicao",
  conferencia: "expedicao",
  etiquetagem: "expedicao",
  bipagem: "expedicao",
  faturamento: "expedicao",
  embalagem: "expedicao",
  pronto_envio: "expedicao",
  enviado: "arquivo",
  cancelado: "arquivo",
  perdida: "arquivo",
  somada: "arquivo",
}

// Status de cada fase (para filtrar `status in (...)` no banco, que usa o índice; igual à coluna `fase` de v_pedidos).
export const STATUS_DA_FASE: Record<Fase, StatusPedido[]> = {
  venda: ["em_aberto", "aguardando_pagamento"],
  arquivo: ["enviado", "cancelado", "perdida", "somada"],
  expedicao: [
    "novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "etiquetagem", "bipagem", "faturamento",
    "embalagem", "pronto_envio",
  ],
}

// Etapas de expedição, na ordem em que aparecem em "Mover para…".
export const ETAPAS_EXPEDICAO: StatusPedido[] = [
  "novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "etiquetagem", "bipagem", "faturamento",
  "embalagem", "pronto_envio", "enviado",
]

// Linha de etapas da tela do pedido. "Avisar/Aguardando cliente" não são passos: é um desvio da Separação.
export const PASSOS = [
  { id: "separacao", nome: "Separação", statuses: ["novo", "separacao", "avisar_cliente", "aguardando_cliente"] },
  { id: "conferencia", nome: "Conferência", statuses: ["conferencia"] },
  { id: "etiquetagem", nome: "Etiquetagem", statuses: ["etiquetagem"] },
  { id: "bipagem", nome: "Bipagem", statuses: ["bipagem"] },
  { id: "faturamento", nome: "Nota e frete", statuses: ["faturamento"] },
  { id: "embalagem", nome: "Embalagem", statuses: ["embalagem"] },
  { id: "pronto_envio", nome: "Postagem", statuses: ["pronto_envio"] },
  { id: "enviado", nome: "Enviado", statuses: ["enviado"] },
] as const satisfies readonly { id: string; nome: string; statuses: readonly StatusPedido[] }[]

export type Passo = (typeof PASSOS)[number]

export function passoDe(s: StatusPedido): number {
  return PASSOS.findIndex((p) => (p.statuses as readonly StatusPedido[]).includes(s))
}

// V37: "Avisar/Aguardando cliente" é um desvio da etapa onde a falta apareceu, não da Separação. O banco guarda
// essa etapa em pedidos.etapa_antes_desvio; a tela trata o pedido em desvio como estando nela (com o selo do
// desvio). Sem origem gravada (desvio antigo) ou com origem inválida, vale a Separação.
type ComDesvio = { status: StatusPedido; etapa_antes_desvio?: string | null }

export function etapaAtual(p: ComDesvio): StatusPedido {
  if (p.status !== "avisar_cliente" && p.status !== "aguardando_cliente") return p.status
  const origem = PASSOS.find((x) => x.id === p.etapa_antes_desvio && x.id !== "enviado")
  return (origem?.id ?? "separacao") as StatusPedido
}

// Índice (em PASSOS) da etapa atual do pedido: o desvio usa a etapa de origem.
export function passoAtual(p: ComDesvio): number {
  return passoDe(etapaAtual(p))
}

// Caminho normal da expedição. Etapas de venda, "avisar_cliente", "aguardando_cliente" e "cancelado" ficam fora.
const FLUXO: StatusPedido[] = [
  "novo", "separacao", "conferencia", "etiquetagem", "bipagem", "faturamento", "embalagem", "pronto_envio", "enviado",
]

export function proximaEtapa(s: StatusPedido): StatusPedido | null {
  if (s === "avisar_cliente" || s === "aguardando_cliente") return "separacao"
  const i = FLUXO.indexOf(s)
  return i >= 0 && i < FLUXO.length - 1 ? FLUXO[i + 1] : null
}

// Ícone de cada etapa (esteira da lista e linha de etapas do pedido).
export const ICONE_ETAPA: Record<string, LucideIcon> = {
  fila: Inbox,
  novo: Inbox,
  separacao: Eye,
  avisar_cliente: BellRing,
  aguardando_cliente: MessageCircleWarning,
  conferencia: ListChecks,
  etiquetagem: Tag,
  bipagem: ScanBarcode,
  faturamento: FileText,
  embalagem: Package,
  pronto_envio: Truck,
  enviado: Check,
  rastreio: Send,
}

// O que fazer em cada etapa: aparece no Dialog que abre ao concluir a etapa anterior.
export const DESCRICAO_ETAPA: Partial<Record<StatusPedido, string[]>> = {
  separacao: ["Ache cada peça no estoque.", "Marque \"Achei\" ou avise se faltar ou tiver defeito."],
  conferencia: [
    "Pegue o saquinho do modelo e separe a quantidade certa do pedido.",
    "Examine cada peça com calma, de todos os lados.",
  ],
  etiquetagem: ["Coloque a etiqueta em cada peça."],
  bipagem: [
    "Leia o código de cada peça com o leitor, uma unidade por vez.",
    "Peça com 2 ou mais unidades: bipe uma vez para cada unidade.",
    "O app avisa se alguma peça não for deste pedido.",
  ],
  faturamento: [
    "Emita a nota fiscal com os dados do pedido.",
    "Gere o frete na Frenet e o pedido de venda no fornecedor.",
  ],
  embalagem: [
    "Coloque as peças na caixa com a nota impressa.",
    "Cole a etiqueta de envio.",
  ],
  pronto_envio: [
    "Leve o pacote aos Correios.",
    "Confira o link de rastreio antes de concluir.",
  ],
  enviado: ["O pedido sai da expedição e vai para o Arquivo."],
}

// Para onde o pedido vai ao concluir a etapa (a pessoa confirma no Dialog).
export function destinoAoConcluir(s: StatusPedido): StatusPedido | null {
  if (s === "novo" || s === "avisar_cliente" || s === "aguardando_cliente") return "conferencia"
  return proximaEtapa(s)
}

export type StatusItem = "pendente" | "encontrado" | "falta" | "defeito" | "removido"

export const NOME_ITEM: Record<StatusItem, string> = {
  pendente: "Pendente",
  encontrado: "Encontrado",
  falta: "Em falta",
  defeito: "Em falta", // o defeito some da tela: vale como falta (o tipo fica por causa dos dados antigos)
  removido: "Removido",
}

export function tempoDesde(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

// Selo do romaneio público. V19: pedido cancelado ou perdido não mostra "Pagamento confirmado".
export function seloRomaneio(fase: string, status: string): { texto: string; variante: "success" | "secondary" } | null {
  if (status === "cancelado") return { texto: "Pedido cancelado", variante: "secondary" }
  if (status === "perdida" || fase === "venda") return null
  return { texto: "Pagamento confirmado", variante: "success" }
}
