// Copia o catálogo público do site (products.json) para a tabela catalogo_site.
// Sem credencial da Shopify. Cuidado com o limite da loja (HTTP 429): espera entre páginas e
// refaz com espera crescente. Roda pelo botão "Atualizar catálogo" ou por agendamento.

import { admin, cors, exigirEquipe, json } from "../_shared/http.ts";

const LOJA = Deno.env.get("CATALOGO_URL") ?? "https://arvennepratas.com.br";
const UA = "ArvenneSeparacao/1.0 (catalogo interno; contato: loja)";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Imagem = { id: number; src: string; variant_ids?: number[] };
type Variante = {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  featured_image: { src: string } | null;
};
type Produto = { id: number; title: string; variants: Variante[]; images: Imagem[] };

async function pagina(n: number): Promise<Produto[]> {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const res = await fetch(`${LOJA}/products.json?limit=250&page=${n}`, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      const depois = Number(res.headers.get("Retry-After")) || 0;
      await espera(Math.max(depois * 1000, 2000 * 2 ** tentativa));
      continue;
    }
    if (!res.ok) throw new Error(`products.json página ${n}: HTTP ${res.status}`);
    return ((await res.json()) as { products: Produto[] }).products;
  }
  throw new Error(`products.json página ${n}: limite da loja (429) persistente`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const db = admin();
    let total = 0;
    for (let n = 1; n <= 50; n++) {
      const produtos = await pagina(n);
      if (produtos.length === 0) break;
      const agora = new Date().toISOString();
      const linhas = produtos.flatMap((p) =>
        p.variants.map((v) => {
          const ligada = p.images.find((i) => i.variant_ids?.includes(v.id));
          return {
            variant_id: v.id,
            produto_id: p.id,
            sku: v.sku || null,
            produto: p.title,
            variante: v.title === "Default Title" ? null : v.title,
            preco: Number(v.price),
            foto_url: v.featured_image?.src ?? ligada?.src ?? p.images[0]?.src ?? null,
            atualizado_em: agora,
          };
        })
      );
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from("catalogo_site").upsert(linhas.slice(i, i + 500), { onConflict: "variant_id" });
        if (error) throw new Error(error.message);
      }
      total += linhas.length;
      await espera(1000);
    }
    return json({ variantes: total });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
