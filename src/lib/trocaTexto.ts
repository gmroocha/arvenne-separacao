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
