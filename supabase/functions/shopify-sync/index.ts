// Traz os pedidos pagos da Shopify para o app. Roda pelo botão "Sincronizar" e
// a cada 5 minutos pelo pg_cron. Idempotente: pedido novo entra inteiro; pedido que já entrou só
// completa o que está nulo, guarda a versão mais nova do pedido bruto e acompanha cancelamento e
// despacho (quem decide é importar_pedido_shopify, no banco).

import { admin, cors, exigirEquipe, json } from "../_shared/http.ts";
import { shopify, urlAdminPedido } from "../_shared/shopify.ts";

const QUERY = `
query Pedidos($cursor: String, $q: String!) {
  orders(first: 10, after: $cursor, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      legacyResourceId
      name
      createdAt
      updatedAt
      processedAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      email
      phone
      note
      customer { displayName phone }
      shippingAddress {
        name firstName lastName company address1 address2 city province provinceCode zip phone
      }
      customAttributes { key value }
      paymentGatewayNames
      discountCodes
      shippingLine { title }
      totalPriceSet { shopMoney { amount } }
      subtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      fulfillments(first: 3) { createdAt trackingInfo(first: 3) { number url company } }
      lineItems(first: 60) {
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

// CPF/CNPJ: campo localizado do checkout brasileiro (TAX_CREDENTIAL_BR). Fica numa consulta
// separada para que, se a loja ou a versão da API não tiver o campo, a sincronização siga sem ele.
const QUERY_CPF = `
query Cpf($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order { legacyResourceId localizedFields(first: 10) { nodes { key value } } }
  }
}`;

type Dinheiro = { shopMoney: { amount: string } };

type Pedido = {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  customer: { displayName: string; phone: string | null } | null;
  shippingAddress: {
    name: string | null; firstName: string | null; lastName: string | null; company: string | null;
    address1: string | null; address2: string | null; city: string | null; province: string | null;
    provinceCode: string | null; zip: string | null; phone: string | null;
  } | null;
  customAttributes: { key: string; value: string | null }[];
  paymentGatewayNames: string[];
  discountCodes: string[];
  shippingLine: { title: string } | null;
  totalPriceSet: Dinheiro;
  subtotalPriceSet: Dinheiro;
  totalDiscountsSet: Dinheiro;
  totalShippingPriceSet: Dinheiro;
  fulfillments: { createdAt: string; trackingInfo: { number: string | null; url: string | null; company: string | null }[] }[];
  lineItems: {
    nodes: {
      sku: string | null;
      title: string;
      variantTitle: string | null;
      currentQuantity: number;
      image: { url: string } | null;
      variant: { legacyResourceId: string } | null;
      originalUnitPriceSet: Dinheiro;
    }[];
  };
};

type Resposta = {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Pedido[] };
};

type CampoLocal = { key: string; value: string };

// A Shopify junta rua e número em address1 ("Rua X, 123"). Separa pela última vírgula quando o
// que vem depois parece número; o original fica em shopify_bruto. address2 vai para o complemento
// (o bairro, quando a loja o coloca ali, a equipe corrige na tela Nota e frete).
function enderecoBR(a: Pedido["shippingAddress"]) {
  if (!a) return {};
  const partes = (a.address1 ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let logradouro: string | null = partes[0] ?? null;
  let numero: string | null = null;
  let extra: string | null = null;
  if (partes.length > 1) {
    const ultimo = partes[partes.length - 1];
    if (/^(s\/?n|\d+[a-z]?)\b/i.test(partes[1])) {
      numero = partes[1];
      extra = partes.slice(2).join(", ") || null;
    } else if (/^(s\/?n|\d+[a-z]?)$/i.test(ultimo)) {
      logradouro = partes.slice(0, -1).join(", ");
      numero = ultimo;
    } else {
      logradouro = partes.join(", ");
    }
  } else {
    // "Rua X 123" sem vírgula
    const m = logradouro?.match(/^(.*\D)\s+(\d+[a-z]?)$/i);
    if (m) {
      logradouro = m[1].trim();
      numero = m[2];
    }
  }
  const complemento = [extra, a.address2?.trim() || null].filter(Boolean).join(" - ") || null;
  return {
    entrega_cep: a.zip,
    entrega_logradouro: logradouro,
    entrega_numero: numero,
    entrega_complemento: complemento,
    entrega_cidade: a.city,
    entrega_uf: a.provinceCode ?? a.province,
  };
}

function acharCpf(o: Pedido, locais: CampoLocal[] | undefined): string | null {
  const doLocal = locais?.find((c) => c.key === "TAX_CREDENTIAL_BR")?.value;
  if (doLocal) return doLocal;
  const attr = o.customAttributes?.find((c) => /cpf|cnpj/i.test(c.key) && c.value);
  return attr?.value ?? null;
}

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
      const data: Resposta = await shopify<Resposta>(QUERY, { cursor, q: `updated_at:>=${desde}` });
      const aImportar = data.orders.nodes.filter((o) => {
        lidos++;
        if (o.createdAt.slice(0, 10) < inicio) return false; // anterior ao início do app
        return o.cancelledAt !== null || PAGOS.has(o.displayFinancialStatus ?? ""); // Pix/boleto ainda não pago
      });

      // CPF numa consulta à parte: se falhar, segue sem CPF em vez de parar tudo.
      const cpfs = new Map<string, CampoLocal[]>();
      if (aImportar.length) {
        try {
          const r = await shopify<{ nodes: ({ legacyResourceId: string; localizedFields: { nodes: CampoLocal[] } } | null)[] }>(
            QUERY_CPF,
            { ids: aImportar.map((o) => o.id) },
          );
          for (const n of r.nodes) if (n) cpfs.set(n.legacyResourceId, n.localizedFields.nodes);
        } catch (e) {
          console.warn("CPF indisponível:", (e as Error).message);
        }
      }

      for (const o of aImportar) {
        const cancelado = o.cancelledAt !== null;
        const despachado = o.displayFulfillmentStatus === "FULFILLED";
        const locais = cpfs.get(o.legacyResourceId);
        const cpf = acharCpf(o, locais);
        const envio = o.fulfillments.find((f) => f.trackingInfo.some((t) => t.number || t.url));
        const rastro = envio?.trackingInfo.find((t) => t.number || t.url);
        const sa = o.shippingAddress;

        const { data: novo, error } = await db.rpc("importar_pedido_shopify", {
          p: {
            shopify_order_id: o.legacyResourceId,
            numero: o.name,
            cancelado,
            despachado,
            postado_em: envio?.createdAt ?? null,
            pedido_em: o.createdAt,
            pago_em: o.processedAt ?? o.createdAt,
            cliente_nome: o.customer?.displayName ?? sa?.name ?? null,
            cliente_telefone: sa?.phone ?? o.customer?.phone ?? o.phone ?? null,
            cliente_email: o.email,
            cliente_cpf: cpf,
            ...enderecoBR(sa),
            valor_total: o.totalPriceSet.shopMoney.amount,
            valor_pago: o.totalPriceSet.shopMoney.amount,
            desconto_valor: o.totalDiscountsSet.shopMoney.amount,
            desconto_codigos: o.discountCodes,
            frete_cobrado: o.totalShippingPriceSet.shopMoney.amount,
            frete_titulo: o.shippingLine?.title ?? null,
            forma_pagamento: o.paymentGatewayNames.join(", ") || null,
            rastreio: rastro?.number ?? null,
            rastreio_url: rastro?.url ?? null,
            shopify_url: urlAdminPedido(o.legacyResourceId),
            shopify_bruto: { ...o, localizedFields: locais ?? null },
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
