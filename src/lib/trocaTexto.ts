import { reais } from "@/lib/formato"
import type { Troca, TrocaOpcao, TrocaValor } from "@/lib/tipos"

// Situação financeira de uma opção. Os valores vêm prontos da view v_troca_valores.
export function textoSituacao(v: TrocaValor | undefined): string {
  if (!v) return "calculando…"
  if (v.situacao === "paga_diferenca") return `+${reais(v.diferenca)} a pagar`
  if (v.situacao === "credito") return `${reais(-v.diferenca)} de crédito`
  return "sem diferença"
}

export const valorDaOpcao = (troca: Troca, opcao: TrocaOpcao) => troca.valores.find((v) => v.opcao_id === opcao.id)

export const valorPagoItem = (troca: Troca) => troca.valores.find((v) => v.tipo === "credito")?.valor_pago_item

export const trocaAtiva = (t: Troca) => t.status === "rascunho" || t.status === "enviada" || t.status === "respondida"
