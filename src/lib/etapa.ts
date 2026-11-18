import type { StatusPedido } from "@/lib/status"
import type { Item } from "@/lib/tipos"

// Peças que contam numa etapa: as que ainda estão no pedido.
export const vivas = (itens: Item[]) => itens.filter((i) => i.status !== "removido")

// Divide a lista em peças do pedido e peças adicionais (vieram de uma venda somada). Só a Separação usa.
export function separarAdicionais(itens: Item[]): { normais: Item[]; adicionais: Item[] } {
  return { normais: itens.filter((i) => !i.adicional), adicionais: itens.filter((i) => i.adicional) }
}

// A etapa de peças (separação, conferência, bipagem) está completa para o pedido todo?
// Só olha as peças; quem muda o status do pedido é o banco (marcar_pecas), sozinho.
export function etapaCompleta(status: StatusPedido, itens: Item[]): boolean {
  const v = vivas(itens)
  if (v.length === 0) return false
  switch (status) {
    case "novo":
    case "separacao":
      return v.every((i) => i.status === "encontrado")
    case "conferencia":
      return v.every((i) => i.status === "encontrado" && i.conferido_em)
    case "bipagem":
      return v.every((i) => i.status === "encontrado" && i.conferido_em && i.qtd_bipada >= i.qtd)
    default:
      return false
  }
}

// Etapa de cada peça: pendente → separação; achada → conferência; conferida → bipagem; toda bipada → pronta.
export type EtapaPeca = "separacao" | "conferencia" | "bipagem" | "pronta"
export function etapaDaPeca(i: Pick<Item, "status" | "conferido_em" | "qtd" | "qtd_bipada">): EtapaPeca | null {
  if (i.status === "pendente") return "separacao"
  if (i.status !== "encontrado") return null // falta, defeito e removida não andam
  if (!i.conferido_em) return "conferencia"
  return i.qtd_bipada >= i.qtd ? "pronta" : "bipagem"
}

// Quantas peças esperam em cada etapa de peça (a linha de etapas mostra isso).
export function pecasPorEtapa(itens: Item[]): Record<"separacao" | "conferencia" | "bipagem", number> {
  const n = { separacao: 0, conferencia: 0, bipagem: 0 }
  for (const i of vivas(itens)) {
    const e = etapaDaPeca(i)
    if (e && e !== "pronta") n[e] += 1
  }
  return n
}

// Etapa que o pedido deveria estar pelas peças: a da peça mais atrasada. É a mesma regra do banco
// (avancar_pecas), usada só para perceber um pedido que ficou parado (por exemplo, feito antes desta versão).
export function statusPelasPecas(status: StatusPedido, itens: Item[]): StatusPedido | null {
  if (!["novo", "separacao", "conferencia", "bipagem"].includes(status)) return null
  const v = vivas(itens)
  if (v.length === 0) return null
  const etapas = v.map(etapaDaPeca)
  if (etapas.includes(null)) return null // peça em falta: o pedido está em desvio
  if (etapas.includes("separacao")) return status === "novo" && !etapas.some((e) => e !== "separacao") ? "novo" : "separacao"
  if (etapas.includes("conferencia")) return "conferencia"
  if (etapas.includes("bipagem")) return "bipagem"
  return "faturamento"
}

// Etapas de foco (só as peças do pedido, sem valores nem dados de contato).
export const ETAPAS_DE_PECAS: StatusPedido[] = ["novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "bipagem"]

// V18: pedido sem nenhuma peça viva (tudo virou crédito ou foi retirado) não tem como concluir a separação.
// A tela explica o caminho em vez de mostrar só "nenhuma peça pendente".
export function avisoSemPecas(itens: Pick<Item, "status">[]): string {
  if (itens.length === 0) return "Este pedido ainda não tem peças."
  if (itens.every((i) => i.status === "removido"))
    return "Nenhuma peça para enviar: todas viraram crédito ou foram retiradas. Resolva o acerto e cancele o pedido no menu de etapas."
  return "Nenhuma peça pendente."
}

// O que ainda não foi feito na etapa atual e será marcado como feito ao "Concluir etapa" (mover_etapa para a próxima).
// Peças: conta as linhas; documentos: o nome do que falta. `texto` é vazio quando a etapa já está toda feita.
type CamposDocs = { nf_emitida_em?: string | null; pedido_fornecedor_em?: string | null; embalado_em?: string | null; frete_gerado_em?: string | null; postado_em?: string | null; rastreio_enviado_em?: string | null }
export function pendenciasDaEtapa(etapa: string, itens: Item[], p: CamposDocs): { qtd: number; texto: string } {
  const v = vivas(itens).filter((i) => i.status === "pendente" || i.status === "encontrado")
  const pecas = (n: number, ato: string) => ({ qtd: n, texto: n === 0 ? "" : `${n} ${n === 1 ? "peça ainda não foi" : "peças ainda não foram"} ${ato}${n === 1 ? "" : "s"}` })
  switch (etapa) {
    case "separacao": return pecas(v.filter((i) => i.status === "pendente").length, "achada")
    case "conferencia": return pecas(v.filter((i) => i.status === "pendente" || !i.conferido_em).length, "conferida")
    case "bipagem": return pecas(v.filter((i) => i.status === "pendente" || !i.conferido_em || i.qtd_bipada < i.qtd).length, "bipada")
    case "faturamento": {
      const falta = [!p.nf_emitida_em && "a nota fiscal", !p.pedido_fornecedor_em && "o pedido LR"].filter(Boolean) as string[]
      return { qtd: falta.length, texto: falta.length ? `Ainda falta marcar ${falta.join(" e ")}` : "" }
    }
    case "embalagem": return { qtd: p.embalado_em ? 0 : 1, texto: p.embalado_em ? "" : "A embalagem ainda não foi marcada" }
    case "frete": return { qtd: p.frete_gerado_em ? 0 : 1, texto: p.frete_gerado_em ? "" : "O frete ainda não foi gerado" }
    case "pronto_envio": return { qtd: p.postado_em ? 0 : 1, texto: p.postado_em ? "" : "A postagem ainda não foi marcada" }
    case "enviar_rastreio": return { qtd: p.rastreio_enviado_em ? 0 : 1, texto: p.rastreio_enviado_em ? "" : "A mensagem de rastreio ainda não foi marcada como enviada" }
    default: return { qtd: 0, texto: "" }
  }
}
