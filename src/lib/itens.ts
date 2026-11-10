import type { VarianteSite } from "@/lib/api"
import type { NovoItem, PecaClube } from "@/lib/tipos"

export function itemDoSite(v: VarianteSite, qtd = 1): NovoItem {
  return {
    chave: crypto.randomUUID(),
    origem: "shopify",
    shopify_variant_id: v.shopify_variant_id,
    peca_clube_id: null,
    sku: v.sku,
    nome: v.nome,
    variante: v.variante,
    foto_url: v.foto_url,
    qtd,
    preco: v.preco,
  }
}

export function itemDoClube(p: PecaClube): NovoItem {
  return {
    chave: crypto.randomUUID(),
    origem: "clube",
    shopify_variant_id: null,
    peca_clube_id: p.id,
    sku: p.codigo,
    nome: p.nome,
    variante: p.variante,
    foto_url: p.foto_url,
    qtd: 1,
    preco: p.preco,
  }
}

// Mesma peça: mesma variante da Shopify ou mesma peça do Clube.
export const igual = (a: NovoItem, b: NovoItem) =>
  a.shopify_variant_id != null ? a.shopify_variant_id === b.shopify_variant_id : a.peca_clube_id != null && a.peca_clube_id === b.peca_clube_id
