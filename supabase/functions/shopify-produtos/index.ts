// Busca produtos do site para montar pedido do WhatsApp.
// { q: "anel solitário" }        → busca por nome ou SKU
// { variantIds: ["4312...", ...] } → variantes lidas do link do carrinho

import { cors, exigirEquipe, json } from "../_shared/http.ts";
import { shopify } from "../_shared/shopify.ts";

const CAMPOS_VARIANTE = `
  legacyResourceId
  sku
  title
  price
  image { url }
`;

const CAMPOS_PRODUTO = `
  title
  featuredMedia { preview { image { url } } }
`;

type Variante = {
  legacyResourceId: string;
  sku: string | null;
  title: string;
  price: string;
  image: { url: string } | null;
};
type Produto = {
  title: string;
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
};

function achatar(v: Variante, p: Produto) {
  return {
    shopify_variant_id: Number(v.legacyResourceId),
    sku: v.sku,
    nome: p.title,
    variante: v.title === "Default Title" ? null : v.title,
    foto_url: v.image?.url ?? p.featuredMedia?.preview?.image?.url ?? null,
    preco: Number(v.price),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const { q, variantIds } = (await req.json()) as { q?: string; variantIds?: (string | number)[] };

    if (variantIds?.length) {
      const data = await shopify<{ nodes: ((Variante & { product: Produto }) | null)[] }>(
        `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { ${CAMPOS_VARIANTE} product { ${CAMPOS_PRODUTO} } } } }`,
        { ids: variantIds.map((id) => `gid://shopify/ProductVariant/${id}`) },
      );
      return json({ variantes: data.nodes.filter((n) => n?.legacyResourceId).map((v) => achatar(v!, v!.product)) });
    }

    const termo = (q ?? "").trim().replace(/["\\]/g, "");
    if (termo.length < 2) return json({ variantes: [] });

    const busca = /^\S+$/.test(termo) ? `sku:${termo}* OR title:*${termo}*` : `title:*${termo}*`;
    const data = await shopify<{ products: { nodes: (Produto & { variants: { nodes: Variante[] } })[] } }>(
      `query($q: String!) { products(first: 15, query: $q) { nodes { ${CAMPOS_PRODUTO} variants(first: 50) { nodes { ${CAMPOS_VARIANTE} } } } } }`,
      { q: busca },
    );
    return json({
      variantes: data.products.nodes.flatMap((p) => p.variants.nodes.map((v) => achatar(v, p))),
    });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
