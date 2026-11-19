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
  { id: "bipagem", nome: "Bipagem" },
  { id: "faturamento", nome: "Nota fiscal" },
  { id: "embalagem", nome: "Embalagem e frete" },
  { id: "frete", nome: "Frete" }, // etapa antiga: nenhum pedido novo entra nela; fica por causa do histórico
  { id: "pronto_envio", nome: "Postagem" },
  { id: "enviar_rastreio", nome: "Enviar rastreio" }, // só pedidos que não são da Shopify (a loja avisa a cliente)
  { id: "enviado", nome: "Concluído" }, // o status continua "enviado" no banco
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
  bipagem: "expedicao",
  faturamento: "expedicao",
  embalagem: "expedicao",
  frete: "expedicao",
  pronto_envio: "expedicao",
  enviar_rastreio: "expedicao",
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
    "novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "bipagem", "faturamento",
    "embalagem", "frete", "pronto_envio", "enviar_rastreio", // "frete" é a etapa antiga (sem pedidos novos)
  ],
}

// Etapas de expedição (para arrastar cartões e descobrir a posição na esteira).
export const ETAPAS_EXPEDICAO: StatusPedido[] = [
  "novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "bipagem", "faturamento",
  "embalagem", "pronto_envio", "enviar_rastreio", "enviado",
]

// Etapas oferecidas em "Mover para outra etapa" (o banco decide se pode: mover_etapa). Desvios não entram.
export const ETAPAS_MOVER = ["separacao", "conferencia", "bipagem", "faturamento", "embalagem", "pronto_envio", "enviar_rastreio", "enviado"] as const satisfies readonly StatusPedido[]

// Linha de etapas da tela do pedido. "Avisar/Aguardando cliente" não são passos: é um desvio da Separação.
export const PASSOS = [
  { id: "separacao", nome: "Separação", statuses: ["novo", "separacao", "avisar_cliente", "aguardando_cliente"] },
  { id: "conferencia", nome: "Conferência", statuses: ["conferencia"] },
  { id: "bipagem", nome: "Bipagem", statuses: ["bipagem"] },
  { id: "faturamento", nome: "Nota fiscal", statuses: ["faturamento"] },
  // "frete" é a etapa antiga: enquanto sobrar pedido nela (banco ainda sem a migration), a tela o trata como Embalagem e frete.
  { id: "embalagem", nome: "Embalagem e frete", statuses: ["embalagem", "frete"] },
  { id: "pronto_envio", nome: "Postagem", statuses: ["pronto_envio"] },
  { id: "enviar_rastreio", nome: "Enviar rastreio", statuses: ["enviar_rastreio"] },
  { id: "enviado", nome: "Concluído", statuses: ["enviado"] },
] as const satisfies readonly { id: string; nome: string; statuses: readonly StatusPedido[] }[]

export type Passo = (typeof PASSOS)[number]

// Pedido da Shopify não tem "Enviar rastreio": a loja avisa a cliente. Todo cálculo de posição na esteira de UM pedido
// usa a lista da origem dele (os índices de passoDe/passoAtual valem nesta lista, nunca na PASSOS inteira).
type ComOrigem = { origem?: string | null }
export const temEnviarRastreio = (origem?: string | null) => origem !== "shopify"
export function passosDe(origem?: string | null): readonly Passo[] {
  return temEnviarRastreio(origem) ? PASSOS : PASSOS.filter((p) => p.id !== "enviar_rastreio")
}

export function passoDe(s: StatusPedido, origem?: string | null): number {
  return passosDe(origem).findIndex((p) => (p.statuses as readonly StatusPedido[]).includes(s))
}

// V37: "Avisar/Aguardando cliente" é um desvio da etapa onde a falta apareceu, não da Separação. O banco guarda
// essa etapa em pedidos.etapa_antes_desvio; a tela trata o pedido em desvio como estando nela (com o selo do
// desvio). Sem origem gravada (desvio antigo) ou com origem inválida, vale a Separação.
type ComDesvio = ComOrigem & { status: StatusPedido; etapa_antes_desvio?: string | null }

export function etapaAtual(p: ComDesvio): StatusPedido {
  if (p.status !== "avisar_cliente" && p.status !== "aguardando_cliente") return p.status
  const origem = PASSOS.find((x) => x.id === p.etapa_antes_desvio && x.id !== "enviado")
  return (origem?.id ?? "separacao") as StatusPedido
}

// Índice (em PASSOS) da etapa atual do pedido: o desvio usa a etapa de origem.
export function passoAtual(p: ComDesvio): number {
  return passoDe(etapaAtual(p), p.origem)
}

// Etapas de trabalho que têm responsável (todas menos "Concluído"), na ordem da esteira.
export const PASSOS_TRABALHO = PASSOS.filter((p) => p.id !== "enviado")
export function passosTrabalhoDe(origem?: string | null) {
  return PASSOS_TRABALHO.filter((p) => temEnviarRastreio(origem) || p.id !== "enviar_rastreio")
}

// Etapa atual do pedido (o desvio usa a etapa de origem) que pode ter responsável; "enviado"/arquivo não têm.
export function etapaDoResponsavel(p: ComDesvio): (typeof PASSOS_TRABALHO)[number]["id"] | null {
  const passo = passosTrabalhoDe(p.origem)[passoAtual(p)]
  return passo ? passo.id : null
}

// Caminho normal da expedição. Etapas de venda, "avisar_cliente", "aguardando_cliente" e "cancelado" ficam fora.
const FLUXO: StatusPedido[] = [
  "novo", "separacao", "conferencia", "bipagem", "faturamento", "embalagem", "pronto_envio", "enviar_rastreio", "enviado",
]

export function proximaEtapa(s: StatusPedido, origem?: string | null): StatusPedido | null {
  if (s === "avisar_cliente" || s === "aguardando_cliente") return "separacao"
  const fluxo = temEnviarRastreio(origem) ? FLUXO : FLUXO.filter((e) => e !== "enviar_rastreio")
  const i = fluxo.indexOf(s === "frete" ? "embalagem" : s) // "frete" (antigo) vale como Embalagem e frete
  return i >= 0 && i < fluxo.length - 1 ? fluxo[i + 1] : null
}

// Ícone de cada etapa (esteira da lista e linha de etapas do pedido).
export const ICONE_ETAPA: Record<string, LucideIcon> = {
  fila: Inbox,
  novo: Inbox,
  separacao: Eye,
  avisar_cliente: BellRing,
  aguardando_cliente: MessageCircleWarning,
  conferencia: ListChecks,
  bipagem: ScanBarcode,
  faturamento: FileText,
  embalagem: Package,
  frete: Tag,
  pronto_envio: Truck,
  enviar_rastreio: Send,
  enviado: Check,
  rastreio: Send,
}

// O que fazer em cada etapa: aparece no Dialog que abre ao concluir a etapa anterior.
export const DESCRICAO_ETAPA: Partial<Record<StatusPedido, string[]>> = {
  separacao: ["Ache cada peça no estoque.", "Marque \"Achei\" ou avise se faltar ou tiver defeito."],
  conferencia: [
    "Pegue o saquinho do modelo e separe a quantidade certa do pedido.",
    "Examine cada peça com calma, de todos os lados.",
    "Confira e cole a etiqueta no saquinho de cada peça.",
  ],
  bipagem: [
    "Leia o código de cada peça com o leitor, uma unidade por vez.",
    "Peça com 2 ou mais unidades: bipe uma vez para cada unidade.",
    "O app avisa se alguma peça não for deste pedido.",
  ],
  faturamento: [
    "Emita a nota fiscal com os dados do pedido.",
    "Faça o pedido de venda no fornecedor.",
  ],
  embalagem: [
    "Coloque as peças na caixa com a nota impressa e feche a caixa.",
    "Gere o frete na Frenet e cole a etiqueta de envio na caixa.",
    "Marque \"Embalado\" e \"Frete gerado\", em qualquer ordem: o pedido vai para a Postagem quando os dois estiverem marcados.",
  ],
  pronto_envio: [
    "Leve o pacote aos Correios e cole aqui o link de rastreio.",
    "Marque \"Postado\": o pedido vai para Enviar rastreio (ou direto para Concluídos, se for da Shopify).",
  ],
  enviar_rastreio: [
    "Confira o link de rastreio (cole se faltar).",
    "Abra o WhatsApp com a mensagem pronta e envie à cliente.",
    "Marque \"Mensagem enviada\": o pedido vai para Concluídos.",
  ],
  enviado: ["O pedido sai da expedição e vai para Concluídos."],
}

// Para onde o pedido vai ao concluir a etapa (a pessoa confirma no Dialog).
export function destinoAoConcluir(s: StatusPedido, origem?: string | null): StatusPedido | null {
  if (s === "novo" || s === "avisar_cliente" || s === "aguardando_cliente") return "conferencia"
  return proximaEtapa(s, origem)
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

// Quanto tempo o pedido está na etapa. Pago e ainda não começado é "na fila"; começado (primeiro "Achei" ou "Começar
// separação") é "separando": os dois tempos aparecem separados na tela e nas métricas (eventos de status).
export function tempoNaEtapa(status: StatusPedido, desde: string): string {
  const t = tempoDesde(desde)
  if (status === "novo") return `Na fila há ${t}`
  if (status === "separacao") return `Separando há ${t}`
  return `Nesta etapa há ${t}`
}

// Selo do romaneio público. V19: pedido cancelado ou perdido não mostra "Pagamento confirmado".
export function seloRomaneio(fase: string, status: string): { texto: string; variante: "success" | "secondary" } | null {
  if (status === "cancelado") return { texto: "Pedido cancelado", variante: "secondary" }
  if (status === "perdida" || fase === "venda") return null
  return { texto: "Pagamento confirmado", variante: "success" }
}
