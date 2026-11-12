export type LidoCarrinho = { variantId: string; qtd: number }

// Dois tipos de link de carrinho da Shopify:
// - do site (o que as clientes mandam): https://loja.com.br/cart/44012345678:1,44098765432:2?return_to=/checkout
//   (o próprio link traz as variantes e quantidades);
// - de checkout: https://loja.com.br/70987808856/checkouts/ac/<token>/recover?key=... (ou /cart/c/<token>):
//   só a Shopify sabe o conteúdo; a função Edge carrinho-ler procura e devolve as peças.
// Devolve null se o formato for outro.
export type LinkCarrinho = { tipo: "itens"; itens: LidoCarrinho[] } | { tipo: "compartilhado"; url: string }

export function lerLinkCarrinho(link: string): LinkCarrinho | null {
  const texto = link.trim()
  if (/\/cart\/c\/[^/?#\s]+/.test(texto) || /\/checkouts\/(?:[a-z]{1,3}\/)?[A-Za-z0-9_-]{10,}/.test(texto)) {
    const url = texto.match(/https?:\/\/\S+/)?.[0] ?? texto
    return { tipo: "compartilhado", url }
  }
  const m = texto.match(/\/cart\/(\d+:\d+(?:,\d+:\d+)*)/)
  if (!m) return null
  return {
    tipo: "itens",
    itens: m[1].split(",").map((par) => {
      const [variantId, qtd] = par.split(":")
      return { variantId, qtd: Number(qtd) || 1 }
    }),
  }
}
