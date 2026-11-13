import { reais } from "@/lib/formato"
import { NOME_ETAPA, NOME_ITEM, type StatusItem } from "@/lib/status"
import type { Evento } from "@/lib/tipos"

// Histórico do pedido: rótulos, categorias e agrupamento por dia. Só texto e datas; nenhuma conta de dinheiro.

export type CategoriaHistorico = "etapas" | "pecas" | "troca" | "notas" | "outros"
export type FiltroHistorico = "tudo" | Exclude<CategoriaHistorico, "outros">

export const FILTROS_HISTORICO: { valor: FiltroHistorico; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "etapas", rotulo: "Etapas" },
  { valor: "pecas", rotulo: "Peças" },
  { valor: "troca", rotulo: "Troca e dinheiro" },
  { valor: "notas", rotulo: "Notas" },
]

export const ROTULO_EVENTO: Record<string, string> = {
  conferida: "Peça conferida", desconferida: "Conferência desfeita", etiquetada: "Peça etiquetada",
  desetiquetada: "Etiqueta desfeita", bipada: "Peça bipada", qtd: "Quantidade alterada", preco: "Preço alterado",
  nota_emitida: "Nota emitida", nota_desfeita: "Nota desfeita", frete_gerado: "Frete gerado", frete_desfeito: "Frete desfeito",
  pedido_lr: "Pedido ao fornecedor (LR)", pedido_lr_desfeito: "Pedido ao fornecedor desfeito",
  embalado: "Embalado", desembalado: "Embalagem desfeita", postado: "Postado", desfeito_postagem: "Postagem desfeita",
  pago: "Pagamento registrado", rastreio_enviado: "Rastreio enviado à cliente", reiniciado: "Reiniciado",
  devolvido: "Valor devolvido à cliente", devolvido_desfeito: "Devolução desfeita", shopify_alerta: "Aviso da Shopify",
  troca_enviada: "Troca enviada à cliente", troca_respondida: "Cliente respondeu a troca", troca_concluida: "Troca concluída",
  troca_acerto: "Acerto da troca", troca_carrinho: "Carrinho da troca", venda_somada: "Venda somada",
  shopify_alterado: "Peças alteradas na Shopify",
}

const CATEGORIA: Record<string, CategoriaHistorico> = {
  criado: "etapas", status: "etapas", reiniciado: "etapas",
  nota_emitida: "etapas", nota_desfeita: "etapas", frete_gerado: "etapas", frete_desfeito: "etapas",
  pedido_lr: "etapas", pedido_lr_desfeito: "etapas", embalado: "etapas", desembalado: "etapas",
  postado: "etapas", desfeito_postagem: "etapas", rastreio_enviado: "etapas",
  item: "pecas", conferida: "pecas", desconferida: "pecas", etiquetada: "pecas", desetiquetada: "pecas",
  bipada: "pecas", qtd: "pecas", shopify_alterado: "pecas",
  pago: "troca", preco: "troca", devolvido: "troca", devolvido_desfeito: "troca", venda_somada: "troca",
  troca_enviada: "troca", troca_respondida: "troca", troca_concluida: "troca", troca_acerto: "troca",
  troca_carrinho: "troca", troca_recebida: "troca", troca_credito: "troca",
  nota: "notas",
}

// Eventos de peça guardam "SKU · nome · variante" em `texto`.
const COM_PECA = new Set(["item", "conferida", "desconferida", "etiquetada", "desetiquetada", "bipada", "qtd", "preco"])

// "Peça" é feminino: NOME_ITEM serve à etiqueta do item ("Encontrado"), aqui vira "encontrada".
const SITUACAO_PECA: Record<string, string> = { pendente: "pendente", encontrado: "encontrada", falta: "em falta", defeito: "em falta", removido: "removida" }

export const categoriaEvento = (tipo: string): CategoriaHistorico => CATEGORIA[tipo] ?? "outros"

export type ItemHistorico = {
  id: string | number
  categoria: CategoriaHistorico
  titulo: string
  sku: string | null // peça do evento (mostrada em fonte mono)
  detalhe: string | null
  criado: string // ISO
  quem: string // parte do e-mail antes do @ ("sistema" quando não há)
}

// "gustavo@arvenne.com" -> "gustavo".
export const quemDoEmail = (email: string | null | undefined) => (email ? email.split("@")[0] : "sistema")

const nomeEtapa = (s: string | null) => NOME_ETAPA[s as keyof typeof NOME_ETAPA] ?? s ?? ""

function numeroOuTexto(tipo: string, v: string | null) {
  if (v == null) return ""
  return tipo === "preco" && /^\d+(\.\d+)?$/.test(v) ? reais(Number(v)) : v
}

export function descreverEvento(e: Evento): ItemHistorico {
  let titulo: string
  let detalhe: string | null = e.texto ?? null
  let sku: string | null = null

  if (e.tipo === "criado") titulo = "Pedido criado"
  else if (e.tipo === "status") {
    titulo = "Mudou de etapa"
    detalhe = `${nomeEtapa(e.de)} → ${nomeEtapa(e.para)}`
  } else if (e.tipo === "nota") {
    titulo = "Nota"
    detalhe = e.texto ?? ""
  } else if (e.tipo === "item") {
    titulo = `Peça ${SITUACAO_PECA[e.para ?? ""] ?? (NOME_ITEM[e.para as StatusItem] ?? e.para ?? "").toLowerCase()}`
  } else titulo = ROTULO_EVENTO[e.tipo] ?? e.tipo.replaceAll("_", " ")

  if (COM_PECA.has(e.tipo) && e.texto) {
    const [primeiro, ...resto] = e.texto.split(" · ")
    sku = primeiro || null
    detalhe = resto.join(" · ") || null
  }
  if ((e.tipo === "qtd" || e.tipo === "preco" || e.tipo === "bipada") && e.de != null && e.para != null) {
    const mudanca = `${numeroOuTexto(e.tipo, e.de)} → ${numeroOuTexto(e.tipo, e.para)}`
    detalhe = [detalhe, mudanca].filter(Boolean).join(" · ")
  }
  return { id: e.id, categoria: categoriaEvento(e.tipo), titulo, sku, detalhe: detalhe || null, criado: e.created_at, quem: quemDoEmail(e.usuario_email) }
}

// Texto corrido de um evento (usado onde só cabe uma linha).
export const textoEvento = (e: Evento) => {
  const d = descreverEvento(e)
  return [d.titulo, d.sku, d.detalhe].filter(Boolean).join(" · ")
}

export function filtrarHistorico(itens: ItemHistorico[], filtro: FiltroHistorico) {
  return filtro === "tudo" ? itens : itens.filter((i) => i.categoria === filtro)
}

const FUSO = "America/Sao_Paulo"
const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" })
const dataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "long" })
const dataComAno = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "long", year: "numeric" })
const horaMinuto = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

// "10:32" (São Paulo).
export const horaDoEvento = (iso: string) => horaMinuto.format(new Date(iso))

const diaNumero = (d: Date) => {
  const [a, m, dia] = diaSP.format(d).split("-").map(Number)
  return Date.UTC(a, m - 1, dia) / 86400000
}

export function rotuloDia(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso)
  const dif = diaNumero(agora) - diaNumero(d)
  if (dif === 0) return "Hoje"
  if (dif === 1) return "Ontem"
  const mesmoAno = diaSP.format(agora).slice(0, 4) === diaSP.format(d).slice(0, 4)
  return (mesmoAno ? dataLonga : dataComAno).format(d)
}

export type GrupoHistorico = { dia: string; rotulo: string; itens: ItemHistorico[] }

// Do mais novo para o mais antigo, agrupado pelo dia de São Paulo.
export function agruparPorDia(itens: ItemHistorico[], agora: Date = new Date()): GrupoHistorico[] {
  const ordenados = [...itens].sort((a, b) => new Date(b.criado).getTime() - new Date(a.criado).getTime() || Number(b.id) - Number(a.id))
  const grupos: GrupoHistorico[] = []
  for (const i of ordenados) {
    const dia = diaSP.format(new Date(i.criado))
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.dia === dia) ultimo.itens.push(i)
    else grupos.push({ dia, rotulo: rotuloDia(i.criado, agora), itens: [i] })
  }
  return grupos
}

export const montarHistorico = (eventos: Evento[]) => eventos.map(descreverEvento)
