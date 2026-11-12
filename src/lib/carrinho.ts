export type LidoCarrinho = { variantId: string; qtd: number }

// Dois tipos de link de carrinho da Shopify:
// - do site (o que as clientes mandam): https://loja.com.br/cart/44012345678:1,44098765432:2?return_to=/checkout
//   (o próprio link traz as variantes e quantidades);
// - de checkout: https://loja.com.br/70987808856/checkouts/ac/<token>/recover?key=...:
//   só a Shopify sabe o conteúdo; a função Edge carrinho-ler procura e devolve as peças.
// Devolve null se o formato for outro.
export type LinkCarrinho = { tipo: "itens"; itens: LidoCarrinho[] } | { tipo: "compartilhado"; url: string }

export function lerLinkCarrinho(link: string): LinkCarrinho | null {
  const texto = link.trim()
  // V22: /cart/c/<token> não é checkout; a função Edge não consegue ler e devolvia erro. Fica de fora.
  if (/\/cart\/c\/[^/?#\s]+/.test(texto)) return null
  if (/\/checkouts\/(?:[a-z]{1,3}\/)?[A-Za-z0-9_-]{10,}/.test(texto)) {
    const url = texto.match(/https?:\/\/\S+/)?.[0] ?? texto
    return { tipo: "compartilhado", url }
  }
  const m = texto.match(/\/cart\/(\d+:\d+(?:,\d+:\d+)*)/)
  if (!m) return null
  const itens = juntarLidos(m[1].split(",").map((par) => {
    const [variantId, qtd] = par.split(":")
    return { variantId, qtd: Number(qtd) }
  }))
  return itens.length ? { tipo: "itens", itens } : null
}

// Variante repetida soma as quantidades (123:1,123:2 = 3 unidades); quantidade 0 ou inválida sai.
export function juntarLidos(lidos: LidoCarrinho[]): LidoCarrinho[] {
  const soma = new Map<string, number>()
  for (const l of lidos) {
    const qtd = Math.trunc(Number(l.qtd))
    if (!Number.isFinite(qtd) || qtd <= 0) continue
    const id = String(l.variantId)
    soma.set(id, (soma.get(id) ?? 0) + qtd)
  }
  return [...soma].map(([variantId, qtd]) => ({ variantId, qtd }))
}

// Mensagem quando o link colado não é lido.
export function motivoLinkRecusado(link: string): string {
  if (/\/cart\/c\//.test(link))
    return "Esse link de carrinho compartilhado (/cart/c/…) não traz as peças. Peça à cliente o link do carrinho (/cart/…) ou o de checkout."
  return "Não reconheci o link. Cole o link do carrinho (/cart/…) ou o de checkout."
}
