import { reais } from "@/lib/formato"
import { NOME_ITEM } from "@/lib/status"
import { cobreTudo } from "@/lib/trocaTexto"
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

const primeiroNome = (p: Pedido) => {
  const n = p.cliente_nome?.split(" ")[0]
  return n && !n.includes("@") ? n : null
}

const descricaoPeca = (i: Item) => [i.nome, i.variante].filter(Boolean).join(", ")

// Mensagem para a cliente com o link da troca: peça em falta, o link sozinho na linha e um passo a passo
// curto do que ela faz na página (escolher, diferença, crédito).
export function mensagemTroca(pedido: Pedido, itens: Item[], link: string, cobrirAte = 0): string {
  const nome = primeiroNome(pedido)
  const plural = itens.length > 1
  const pecas = itens.map((i) => descricaoPeca(i)).filter(Boolean).map((d) => `*${d}*`).join(" e ")
  const cobre = cobrirAte > 0 ? (cobreTudo(cobrirAte) ? "A loja cobre a diferença 💛" : `A loja cobre até ${reais(cobrirAte)} da diferença 💛`) : null
  return [
    `Oi${nome ? `, ${nome}` : ""}! Aqui é da Arvenne Pratas.`,
    `${plural ? "As peças" : "A peça"}${pecas ? ` ${pecas}` : ""} do seu pedido ${pedido.numero} ${plural ? "ficaram" : "ficou"} sem estoque 😕 Separamos opções para você escolher:`,
    "",
    `👉 ${link}`,
    "",
    "*Como funciona*",
    "1. Abra o link e toque em *Quero esta* na peça que preferir",
    "2. Custou mais, você paga só a diferença. Custou menos, a diferença vira crédito",
    "3. Se não quiser trocar, toque em *Prefiro crédito*",
    ...(cobre ? ["", cobre] : []),
    "",
    "Qualquer dúvida é só responder aqui.",
  ].join("\n")
}

export function mensagemFaltaSimples(pedido: Pedido, itens: Item[]): string {
  const nome = primeiroNome(pedido)
  const faltas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
  const pecas = faltas.map((i) => `*${descricaoPeca(i)}*`).join(" e ")
  const plural = faltas.length > 1
  return [
    `Oi${nome ? `, ${nome}` : ""}! Aqui é da Arvenne.`,
    `${plural ? "As peças" : "A peça"} ${pecas} do seu pedido ${pedido.numero} ${plural ? "ficaram" : "ficou"} sem estoque 😕`,
    "Podemos trocar por outra peça ou devolver o valor como crédito. O que você prefere?",
  ].join(" ")
}
