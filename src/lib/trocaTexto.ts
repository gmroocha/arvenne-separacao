import { reais } from "@/lib/formato"
import type { TrocaOpcao, TrocaPeca, TrocaValor } from "@/lib/tipos"

// Situação financeira de uma opção. Os valores vêm prontos da view v_troca_valores.
export function textoSituacao(v: TrocaValor | undefined): string {
  if (!v) return "calculando…"
  if (v.situacao === "paga_diferenca") return `+${reais(v.diferenca)} a pagar`
  if (v.situacao === "credito") return `${reais(-v.diferenca)} de crédito`
  return "sem diferença"
}

export const valorDaOpcao = (peca: TrocaPeca, opcao: TrocaOpcao) => peca.valores.find((v) => v.opcao_id === opcao.id)

// Quanto a cliente pagou naquela peça (linha "credito" da view).
export const valorPagoPeca = (peca: TrocaPeca) => peca.valores.find((v) => v.tipo === "credito")?.valor_pago_item

// Frase curta do que a cliente paga ou recebe (valores do banco), para a confirmação.
export function fraseSituacao(v: TrocaValor | undefined): string {
  if (!v) return ""
  if (v.situacao === "paga_diferenca") return `cliente paga +${reais(v.diferenca)}`
  if (v.situacao === "credito") return `cliente fica com ${reais(-v.diferenca)} de crédito`
  return "sem diferença"
}

// Frase pronta da confirmação: "Trocar BLR29-S por TS2677-S · cliente paga +R$ 6,58".
export function fraseTroca(antigo: string, peca: TrocaPeca, opcao: TrocaOpcao): string {
  return `Trocar ${antigo} por ${opcao.sku ?? opcao.nome} · ${fraseSituacao(valorDaOpcao(peca, opcao))}`
}

export const fraseCredito = (peca: TrocaPeca) => `Dar crédito de ${reais(valorPagoPeca(peca))}`
