// Link de carrinho da Shopify: https://loja.com.br/cart/44012345678:1,44098765432:2
// Devolve as variantes e quantidades, ou null se o formato for outro.
export function lerLinkCarrinho(link: string): { variantId: string; qtd: number }[] | null {
  const m = link.match(/\/cart\/(\d+:\d+(?:,\d+:\d+)*)/)
  if (!m) return null
  return m[1].split(",").map((par) => {
    const [variantId, qtd] = par.split(":")
    return { variantId, qtd: Number(qtd) || 1 }
  })
}
