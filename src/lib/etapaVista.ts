import { ehDesvio } from "@/lib/selo"
import { PASSOS, passoAtual, passoDe, type StatusPedido } from "@/lib/status"
import type { PedidoDetalhe } from "@/lib/api"

// Etapas em que cada peça anda sozinha: dá para agir nas peças que já chegaram lá, mesmo com o pedido em outra.
export const ETAPAS_DE_PECA = ["separacao", "conferencia", "bipagem"]

// O que a tela do pedido mostra agora: a etapa vista, se é só leitura, se o cartão do desvio sobe para o topo e se
// há busca de peça (a bipagem já tem o próprio campo de código). Vive aqui porque o cabeçalho fixo (busca e
// responsável) e o painel da etapa precisam da mesma resposta.
export function contextoDaEtapa(pedido: PedidoDetalhe, vista: StatusPedido | null) {
  const atualIdx = passoAtual(pedido)
  const vistaIdx = vista ? passoDe(vista) : atualIdx
  const etapa = vistaIdx >= 0 ? PASSOS[vistaIdx].id : null
  const somenteVer = vista !== null && vistaIdx !== atualIdx && !ETAPAS_DE_PECA.includes(etapa ?? "")
  // O cartão "Avise a cliente" mora nas etapas de peças. Desvio vindo de uma etapa sem ele (Bipagem, Nota fiscal,
  // Embalagem, Frete, Postagem) mostra o cartão aqui em cima, para a falta não ficar escondida.
  const cartaoDoDesvio =
    ehDesvio(pedido.status) && !somenteVer && ["bipagem", "faturamento", "embalagem", "frete", "pronto_envio"].includes(etapa ?? "")
  const comBusca = ["separacao", "conferencia"].includes(etapa ?? "") || cartaoDoDesvio
  const vivas = pedido.pedido_itens.filter((i) => i.status !== "removido")
  return { atualIdx, vistaIdx, etapa, somenteVer, cartaoDoDesvio, comBusca, mostraBusca: comBusca && vivas.length > 1 }
}
