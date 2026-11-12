import { reais } from "@/lib/formato"
import type { TrocaOpcao, TrocaPeca, TrocaValor } from "@/lib/tipos"

// "Cobrir tudo" grava o máximo de numeric(10,2) em trocas.cobrir_ate: a loja cobre a diferença inteira.
export const COBRIR_TUDO = 99999999.99
export const cobreTudo = (cobrirAte: number | null | undefined) => (cobrirAte ?? 0) >= 99999999

// Dinheiro de uma diferença, com os valores que o banco calcula (coberto = a Arvenne; clientePaga = o resto).
// Diferença que a loja cobre nunca aparece como "cliente paga". Sem as colunas novas (banco antigo), vale a
// diferença bruta como antes. `tudo`: a loja cobre tudo, o texto dispensa o número.
export type Pagamento = { diferenca: number; coberto?: number | null; clientePaga?: number | null }

function partesPagamento({ diferenca, coberto, clientePaga }: Pagamento, tudo = false): { cobre: string | null; paga: string | null } {
  if (diferenca <= 0) return { cobre: null, paga: null }
  const cobre = coberto ?? 0
  const paga = clientePaga ?? (diferenca - cobre)
  return { cobre: cobre > 0 ? (tudo && paga <= 0 ? "Arvenne cobre a diferença" : `Arvenne cobre ${reais(cobre)}`) : null, paga: paga > 0 ? `Cliente paga ${reais(paga)}` : null }
}

export function rotuloPagamento(p: Pagamento, tudo = false): string {
  if (p.diferenca < 0) return `Crédito de ${reais(-p.diferenca)}`
  if (p.diferenca === 0) return "Sem diferença"
  const { cobre, paga } = partesPagamento(p, tudo)
  return [cobre, paga].filter(Boolean).join(" · ")
}

// Mesma frase, para dentro de uma sentença ("Trocar A por B · Arvenne cobre R$ 15,00 · cliente paga R$ 25,00").
function fraseCobertura(p: Pagamento): string {
  const { cobre, paga } = partesPagamento(p)
  return [cobre, paga && paga.charAt(0).toLowerCase() + paga.slice(1)].filter(Boolean).join(" · ")
}

// Situação financeira de uma opção. Os valores vêm prontos da view v_troca_valores.
export function textoSituacao(v: TrocaValor | undefined): string {
  if (!v) return "calculando…"
  if (v.situacao === "paga_diferenca" && (v.coberto_previsto ?? 0) > 0)
    return fraseCobertura({ diferenca: v.diferenca, coberto: v.coberto_previsto, clientePaga: v.cliente_paga_previsto })
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
  if (v.situacao === "paga_diferenca" && (v.coberto_previsto ?? 0) > 0)
    return fraseCobertura({ diferenca: v.diferenca, coberto: v.coberto_previsto, clientePaga: v.cliente_paga_previsto })
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
export function fraseDiferencaCarrinho(dif: number | undefined, coberto?: number | null, clientePaga?: number | null): string {
  if (dif == null) return ""
  if (dif > 0 && (coberto ?? 0) > 0) return fraseCobertura({ diferenca: dif, coberto, clientePaga })
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
  `Trocar ${antigo} por ${listaCarrinho(peca)} · ${fraseDiferencaCarrinho(peca.carrinho?.diferenca, peca.carrinho?.coberto_previsto, peca.carrinho?.cliente_paga_previsto)}`

// Carrinho da cliente com a opção completa. Banco antigo: só a opção escolhida, na quantidade da peça.
export function listaEscolhida(peca: TrocaPeca): { opcao: TrocaOpcao; qtd: number }[] {
  const itens = peca.carrinho?.itens ?? []
  if (itens.length > 0) return itens.flatMap((c) => { const opcao = peca.opcoes.find((o) => o.id === c.opcao_id); return opcao ? [{ opcao, qtd: c.qtd }] : [] })
  const o = peca.opcoes.find((x) => x.id === peca.escolha_opcao_id)
  return o ? [{ opcao: o, qtd: 0 }] : []
}
