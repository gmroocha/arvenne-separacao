import { NOME_ITEM } from "@/lib/status"
import type { Item, Pedido } from "@/lib/tipos"

// Texto para colar no agente que conversa com a cliente sobre peças em falta.
export function textoParaAgente(pedido: Pedido, itens: Item[]): string {
  const faltas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
  const linhas = faltas.map(
    (i) =>
      `- ${[i.sku, i.nome, i.variante].filter(Boolean).join(" · ")} (${i.qtd}×) — ${NOME_ITEM[i.status].toLowerCase()}`,
  )
  return [
    `Pedido ${pedido.numero} — ${pedido.cliente_nome ?? "cliente"}`,
    pedido.cliente_telefone ? `Telefone: ${pedido.cliente_telefone}` : null,
    "",
    "Peças que não pudemos separar:",
    ...linhas,
    "",
    "Avise a cliente e ofereça trocar por outra peça ou retirar do pedido.",
  ]
    .filter((l) => l !== null)
    .join("\n")
}

export function textoRastreio(pedido: Pedido): string {
  const nome = pedido.cliente_nome ? `, ${pedido.cliente_nome.split(" ")[0]}` : ""
  const rastreio = pedido.rastreio_url ?? pedido.rastreio
  return `Olá${nome}! Seu pedido ${pedido.numero} da Arvenne foi enviado. Acompanhe a entrega: ${rastreio}`
}
