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

// Diferença do carrinho da cliente (valor pronto de v_troca_carrinho), no mesmo estilo de fraseSituacao.
export function fraseDiferencaCarrinho(dif: number | undefined): string {
  if (dif == null) return ""
  if (dif > 0) return `cliente paga +${reais(dif)}`
  if (dif < 0) return `cliente fica com ${reais(-dif)} de crédito`
  return "sem diferença"
}

// "2× AN3597-16 + 1× AN3597-18" a partir do carrinho da peça.
export function listaCarrinho(peca: TrocaPeca): string {
  return (peca.carrinho?.itens ?? [])
    .map((c) => {
      const o = peca.opcoes.find((x) => x.id === c.opcao_id)
      return `${c.qtd}× ${o?.sku ?? o?.nome ?? "peça"}`
    })
    .join(" + ")
}

// Confirmação para vários itens: "Trocar BLR29-S por 2× A + 1× B · cliente paga +R$ 6,58".
export const fraseCarrinho = (antigo: string, peca: TrocaPeca) =>
  `Trocar ${antigo} por ${listaCarrinho(peca)} · ${fraseDiferencaCarrinho(peca.carrinho?.diferenca)}`

// Carrinho da cliente com a opção completa. Banco antigo: só a opção escolhida, na quantidade da peça.
export function listaEscolhida(peca: TrocaPeca): { opcao: TrocaOpcao; qtd: number }[] {
  const itens = peca.carrinho?.itens ?? []
  if (itens.length > 0) return itens.flatMap((c) => { const opcao = peca.opcoes.find((o) => o.id === c.opcao_id); return opcao ? [{ opcao, qtd: c.qtd }] : [] })
  const o = peca.opcoes.find((x) => x.id === peca.escolha_opcao_id)
  return o ? [{ opcao: o, qtd: 0 }] : []
}
