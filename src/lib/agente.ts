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

export function textoRastreio(pedido: Pick<Pedido, "cliente_nome" | "numero" | "rastreio_url" | "rastreio">): string {
  const nome = pedido.cliente_nome ? `, ${pedido.cliente_nome.split(" ")[0]}` : ""
  const rastreio = pedido.rastreio_url ?? pedido.rastreio
  return `Olá${nome}! Seu pedido ${pedido.numero} da Arvenne foi enviado. Acompanhe a entrega: ${rastreio}`
}

const primeiroNome = (p: Pedido) => {
  const n = p.cliente_nome?.split(" ")[0]
  return n && !n.includes("@") ? n : null
}

const descricaoPeca = (i: Item) => [i.nome, i.variante].filter(Boolean).join(", ")

// Mensagem para a cliente com o link da troca, no texto aprovado pelo Gustavo em 16/11/2026.
// Os asteriscos são o negrito do WhatsApp e vão literais no texto copiado. Não cita o nome das peças.
export function mensagemTroca(pedido: Pedido, itens: Item[], link: string, cobrirAte = 0): string {
  const nome = primeiroNome(pedido)
  const plural = itens.length > 1
  const maisCara = cobrirAte > 0
    ? (cobreTudo(cobrirAte) ? "Se ela custar mais, a diferença fica por nossa conta" : `Se ela custar mais, cobrimos até ${reais(cobrirAte)} da diferença`)
    : "Se ela custar mais, você paga só a diferença"
  return [
    `Oi${nome ? `, ${nome}` : ""}! Tudo bem? Aqui é do *time da expedição da Arvenne Pratas* 📦`,
    "",
    `Durante a separação do seu pedido, vimos que ${plural ? "algumas peças não estão disponíveis" : "uma peça não está disponível"} no nosso estoque 😕 Separamos algumas opções para você escolher ${plural ? "as" : "a"} que mais gostar:`,
    "",
    `👉🏻 ${link}`,
    "",
    "*Como funciona:*",
    "",
    `1️⃣ Abra o link e toque em "*Quero esta*" na peça que gostar. ${maisCara}. Se custar menos, a diferença vira crédito`,
    '2️⃣ Se não quiser trocar, toque em "*Prefiro crédito*"',
    "3️⃣ Se preferir o reembolso ou outra opção, é só me falar por aqui",
    "",
    "Qualquer dúvida, pode me chamar 🤍",
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
