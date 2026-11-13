// Lê um link de checkout da Shopify e devolve as peças (variante + quantidade), para o app montar o
// carrinho ("Colar link do carrinho" no Adicionar peça do pedido e na Venda).
//
// Link aceito: o de recuperar checkout, que a Shopify gera para checkout abandonado, por exemplo
//   https://arvennepratas.com.br/70987808856/checkouts/ac/<token>/recover?key=...
// O conteúdo só existe na Shopify: procura o checkout abandonado cujo abandonedCheckoutUrl tem o mesmo
// token (Admin API, escopo read_orders, que o app já tem para importar pedidos). Olha os mais recentes
// primeiro, até 500.
//
// O link comum do site (/cart/ID:QTD,...) não passa por aqui: o próprio app lê as variantes do link.
// Entrada: { url }. Saída: { itens: [{ variantId, qtd }] } ou { erro } com status 4xx/5xx.

import { cors, exigirEquipe, json } from "../_shared/http.ts";
import { consulta } from "../_shared/shopify.ts";

type Linhas = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: { quantity: number; variant: { legacyResourceId: string } | null }[];
};

type Pagina = {
  abandonedCheckouts: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      abandonedCheckoutUrl: string;
    }[];
  };
};

// Token do checkout no link: /checkouts/ac/<token>/recover, /checkouts/cn/<token>, /checkouts/<token>.
function tokenDoLink(url: string): string | null {
  try {
    return new URL(url).pathname.match(/\/checkouts\/(?:[a-z]{1,3}\/)?([A-Za-z0-9_-]{10,})(?:\/|$)/)?.[1] ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    const { url } = (await req.json().catch(() => ({}))) as { url?: string };
    const token = url ? tokenDoLink(url) : null;
    if (!token) return json({ erro: "Link não reconhecido. Cole o link do carrinho (/cart/...) ou o de recuperar checkout." }, 400);

    const limite = Date.now() + 90_000;
    let cursor: string | null = null;
    for (let pagina = 0; pagina < 5; pagina++) {
      if (Date.now() >= limite) throw new Error("A Shopify demorou para ler o checkout. Tente novamente.");
      const data: Pagina = await consulta<Pagina>(
        `query($cursor: String) {
           abandonedCheckouts(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
             pageInfo { hasNextPage endCursor }
             nodes {
               id
               abandonedCheckoutUrl
             }
           }
         }`,
        { cursor },
      );
      const achado = data.abandonedCheckouts.nodes.find((n) => tokenDoLink(n.abandonedCheckoutUrl) === token);
      if (achado) {
        // Não devolver o carrinho até ler sua composição inteira: 100 é o tamanho da página.
        // A busca de 100 checkouts traz só ID/URL; linhas aninhadas estourariam o custo GraphQL.
        const linhas: Linhas["nodes"] = [];
        let proxima: Linhas["pageInfo"] = { hasNextPage: true, endCursor: null };
        const cursores = new Set<string>();
        while (proxima.hasNextPage) {
          if ((linhas.length > 0 && !proxima.endCursor) || (proxima.endCursor && cursores.has(proxima.endCursor))) throw new Error("A paginação das peças do checkout não avançou. Tente novamente.");
          if (Date.now() >= limite) throw new Error("A Shopify demorou para ler todas as peças. Tente novamente.");
          if (proxima.endCursor) cursores.add(proxima.endCursor);
          const r = await consulta<{ node: { lineItems: Linhas } | null }>(
            `query LinhasCheckout($id: ID!, $cursor: String) {
              node(id: $id) { ... on AbandonedCheckout {
                lineItems(first: 100, after: $cursor) {
                  pageInfo { hasNextPage endCursor }
                  nodes { quantity variant { legacyResourceId } }
                }
              } }
            }`, { id: achado.id, cursor: proxima.endCursor });
          if (!r.node) throw new Error("Não foi possível ler todas as peças do checkout. Tente novamente.");
          linhas.push(...r.node.lineItems.nodes);
          proxima = r.node.lineItems.pageInfo;
        }
        const itens = linhas
          .filter((l) => l.variant?.legacyResourceId)
          .map((l) => ({ variantId: l.variant!.legacyResourceId, qtd: l.quantity }));
        return json({ itens });
      }
      if (!data.abandonedCheckouts.pageInfo.hasNextPage) break;
      cursor = data.abandonedCheckouts.pageInfo.endCursor;
    }
    return json({ erro: "Não achei esse checkout na Shopify. Peça à cliente o link do carrinho (/cart/...)." }, 404);
  } catch (e) {
    console.error(e);
    return json({ erro: (e as Error).message }, 500);
  }
});
