// Traz os pedidos pagos da Shopify para o app. Roda pelo botão "Sincronizar" e
// a cada 5 minutos pelo pg_cron. Idempotente: pedido que já entrou não é tocado
// (só acompanha cancelamento).

import { admin, cors, exigirEquipe, json } from "../_shared/http.ts";
import { shopify, urlAdminPedido } from "../_shared/shopify.ts";

const QUERY = `
query Pedidos($cursor: String, $q: String!) {
  orders(first: 25, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId
      name
      createdAt
      processedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      email
      phone
      customer { displayName phone }
      shippingAddress { name phone }
      totalPriceSet { shopMoney { amount } }
      lineItems(first: 100) {
        nodes {
          sku
          title
          variantTitle
          currentQuantity
          image { url }
          variant { legacyResourceId }
          originalUnitPriceSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

type Pedido = {
  legacyResourceId: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  email: string | null;
  phone: string | null;
  customer: { displayName: string; phone: string | null } | null;
  shippingAddress: { name: string | null; phone: string | null } | null;
  totalPriceSet: { shopMoney: { amount: string } };
  lineItems: {
    nodes: {
      sku: string | null;
      title: string;
      variantTitle: string | null;
      currentQuantity: number;
      image: { url: string } | null;
      variant: { legacyResourceId: string } | null;
      originalUnitPriceSet: { shopMoney: { amount: string } };
    }[];
  };
};

type Resposta = {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Pedido[] };
};

const PAGOS = new Set(["PAID", "PARTIALLY_REFUNDED"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    // Janela de 15 dias, nunca antes da data em que o app começou a valer.
    const inicio = Deno.env.get("SHOPIFY_IMPORTAR_DESDE") ?? new Date().toISOString().slice(0, 10);
    const janela = new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10);
    const desde = inicio > janela ? inicio : janela;

    const db = admin();
    let cursor: string | null = null;
    let lidos = 0;
    let importados = 0;

    do {
      const data: Resposta = await shopify<Resposta>(QUERY, { cursor, q: `created_at:>=${desde}` });
      for (const o of data.orders.nodes) {
        lidos++;
        const cancelado = o.cancelledAt !== null;
        if (!cancelado && !PAGOS.has(o.displayFinancialStatus ?? "")) continue; // Pix/boleto ainda não pago
        if (!cancelado && o.displayFulfillmentStatus === "FULFILLED") continue; // já saiu antes do app

        const { data: novo, error } = await db.rpc("importar_pedido_shopify", {
          p: {
            shopify_order_id: o.legacyResourceId,
            numero: o.name,
            cancelado,
            pedido_em: o.createdAt,
            pago_em: o.processedAt ?? o.createdAt,
            cliente_nome: o.customer?.displayName ?? o.shippingAddress?.name ?? null,
            cliente_telefone: o.shippingAddress?.phone ?? o.customer?.phone ?? o.phone ?? null,
            cliente_email: o.email,
            valor_total: o.totalPriceSet.shopMoney.amount,
            shopify_url: urlAdminPedido(o.legacyResourceId),
            itens: o.lineItems.nodes.map((i) => ({
              shopify_variant_id: i.variant?.legacyResourceId ?? null,
              sku: i.sku,
              nome: i.title,
              variante: i.variantTitle === "Default Title" ? null : i.variantTitle,
              foto_url: i.image?.url ?? null,
              qtd: i.currentQuantity,
              preco: i.originalUnitPriceSet.shopMoney.amount,
            })),
          },
        });
        if (error) throw new Error(`Pedido ${o.name}: ${error.message}`);
        if (novo) importados++;
      }
      cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    } while (cursor);

    return json({ desde, lidos, importados });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
