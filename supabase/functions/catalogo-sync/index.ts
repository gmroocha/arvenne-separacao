// Mantém a tabela catalogo_site (cache do catálogo) alimentada direto pela Admin API da Shopify.
// Três modos, todos pelo mesmo endereço:
//   {}                       sincronização completa (botão "Atualizar catálogo" e agendamento diário);
//                            ao final apaga do cache o que não existe mais na Shopify.
//   { desde: "ISO-8601" }    só variantes alteradas desde essa data (agendamento a cada poucos minutos).
//   { variantIds: [...] }    só essas variantes, na hora (carrinho colado). Preço e foto sempre atuais.
// A Shopify é a fonte; o Supabase guarda uma cópia para a busca ser instantânea.

import { admin, cors, exigirEquipe, json } from "../_shared/http.ts";
import { consulta } from "../_shared/shopify.ts";

const CAMPOS = `
  legacyResourceId
  sku
  title
  price
  inventoryPolicy
  image { url }
  product { legacyResourceId title status featuredMedia { preview { image { url } } } }
`;

type Variante = {
  legacyResourceId: string;
  sku: string | null;
  title: string;
  price: string;
  inventoryPolicy: string;
  image: { url: string } | null;
  product: {
    legacyResourceId: string;
    title: string;
    status: string;
    featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  };
};

function linha(v: Variante, agora: string) {
  return {
    variant_id: Number(v.legacyResourceId),
    produto_id: Number(v.product.legacyResourceId),
    sku: v.sku || null,
    produto: v.product.title,
    variante: v.title === "Default Title" ? null : v.title,
    preco: Number(v.price),
    // CONTINUE = a Shopify deixa vender sem estoque; DENY = não vende
    vende_sem_estoque: v.inventoryPolicy === "CONTINUE",
    foto_url: v.image?.url ?? v.product.featuredMedia?.preview?.image?.url ?? null,
    status: v.product.status,
    atualizado_em: agora,
  };
}

async function gravar(linhas: ReturnType<typeof linha>[]) {
  const db = admin();
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from("catalogo_site").upsert(linhas.slice(i, i + 500), { onConflict: "variant_id" });
    if (error) throw new Error(error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const { variantIds, desde } = (await req.json().catch(() => ({}))) as {
      variantIds?: (string | number)[];
      desde?: string;
    };
    const agora = new Date().toISOString();

    if (variantIds?.length) {
      let total = 0;
      for (let i = 0; i < variantIds.length; i += 100) {
        const lote = variantIds.slice(i, i + 100).map((id) => `gid://shopify/ProductVariant/${id}`);
        const data = await consulta<{ nodes: (Variante | null)[] }>(
          `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { ${CAMPOS} } } }`,
          { ids: lote },
        );
        const linhas = data.nodes.filter((n): n is Variante => !!n?.legacyResourceId).map((n) => linha(n, agora));
        await gravar(linhas);
        total += linhas.length;
      }
      return json({ modo: "variantes", variantes: total });
    }

    const completo = !desde;
    const dataDesde = desde ? desde.replace(/'/g, "") : null;
    // Variantes alteradas desde a data. A Shopify só marca a variante como alterada quando ela mesma muda:
    // mudar o título, a foto ou o status do produto altera o produto, não a variante. Por isso o incremental
    // também consulta os produtos alterados e regrava todas as variantes deles.
    const filtros: { consulta: string; produtos: boolean }[] = completo
      ? [{ consulta: "", produtos: false }]
      : [
        { consulta: `updated_at:>='${dataDesde}'`, produtos: false },
        { consulta: `updated_at:>='${dataDesde}'`, produtos: true },
      ];
    let total = 0;
    for (const f of filtros) {
      let cursor: string | null = null;
      do {
        let variantes: Variante[];
        let pagina: { hasNextPage: boolean; endCursor: string | null };
        if (f.produtos) {
          const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { variants: { nodes: Omit<Variante, "product">[] }; legacyResourceId: string; title: string; status: string; featuredMedia: Variante["product"]["featuredMedia"] }[] } } =
            await consulta(
              `query($cursor: String, $q: String) {
                 products(first: 25, after: $cursor, query: $q) {
                   pageInfo { hasNextPage endCursor }
                   nodes {
                     legacyResourceId title status featuredMedia { preview { image { url } } }
                     variants(first: 100) { nodes { legacyResourceId sku title price inventoryPolicy image { url } } }
                   }
                 }
               }`,
              { cursor, q: f.consulta },
            );
          variantes = data.products.nodes.flatMap((p) =>
            p.variants.nodes.map((v) => ({
              ...v,
              product: { legacyResourceId: p.legacyResourceId, title: p.title, status: p.status, featuredMedia: p.featuredMedia },
            }))
          );
          pagina = data.products.pageInfo;
        } else {
          const data: { productVariants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Variante[] } } =
            await consulta(
              `query($cursor: String, $q: String) {
                 productVariants(first: 100, after: $cursor, query: $q) {
                   pageInfo { hasNextPage endCursor }
                   nodes { ${CAMPOS} }
                 }
               }`,
              { cursor, q: f.consulta || null },
            );
          variantes = data.productVariants.nodes;
          pagina = data.productVariants.pageInfo;
        }
        const linhas = variantes.map((n) => linha(n, agora));
        await gravar(linhas);
        total += linhas.length;
        cursor = pagina.hasNextPage ? pagina.endCursor : null;
      } while (cursor);
    }

    // Sincronização completa e sem erro: o que não foi tocado não existe mais na Shopify.
    let removidas = 0;
    if (completo) {
      const { data: apagadas, error } = await admin().from("catalogo_site").delete().lt("atualizado_em", agora).select("variant_id");
      if (error) throw new Error(error.message);
      removidas = apagadas?.length ?? 0;
    }
    return json({ modo: completo ? "completo" : "incremental", variantes: total, removidas });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
