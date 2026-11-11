// Traz os pedidos pagos da Shopify para o app. Roda pelo botão "Sincronizar" e
// a cada 5 minutos pelo pg_cron. Idempotente: pedido novo entra inteiro; pedido que já entrou só
// completa o que está nulo, guarda a versão mais nova do pedido bruto e acompanha cancelamento e
// despacho (quem decide é importar_pedido_shopify, no banco).

import { admin, cors, exigirEquipe, json } from "../_shared/http.ts";
import { consulta as shopify, urlAdminPedido } from "../_shared/shopify.ts";
import { enderecoBR, nomeReal } from "../_shared/cliente.ts";

// Custo: orders(first: 10) x lineItems(first: 50) cabe no limite de 1000 da Admin API (com 250 linhas
// por pedido estourava com MAX_COST_EXCEEDED e nenhum pedido entrava). O que passar de 50 linhas vem
// por pedido, em QUERY_LINHAS. Mais novos primeiro (reverse) para que, se o tempo acabar, os novos entrem.
const QUERY = `
query Pedidos($cursor: String, $q: String!) {
  orders(first: 10, after: $cursor, query: $q, sortKey: UPDATED_AT, reverse: true) {
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
      shippingLine {
        title
        originalPriceSet { shopMoney { amount } }
        discountedPriceSet { shopMoney { amount } }
      }
      totalPriceSet { shopMoney { amount } }
      subtotalPriceSet { shopMoney { amount } }
      currentTotalPriceSet { shopMoney { amount } }
      currentSubtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      fulfillments(first: 3) { createdAt trackingInfo(first: 3) { number url company } }
      lineItems(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          sku
          title
          variantTitle
          currentQuantity
          unfulfilledQuantity
          requiresShipping
          isGiftCard
          image { url }
          variant { legacyResourceId }
          originalUnitPriceSet { shopMoney { amount } }
          discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

// Linhas além das 50 primeiras de um pedido.
const QUERY_LINHAS = `
query Linhas($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on Order {
      lineItems(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          sku
          title
          variantTitle
          currentQuantity
          unfulfilledQuantity
          requiresShipping
          isGiftCard
          image { url }
          variant { legacyResourceId }
          originalUnitPriceSet { shopMoney { amount } }
          discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
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

// Transações (para a data real do pagamento) também numa consulta à parte e tolerante.
const QUERY_PAGO = `
query Pago($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order { legacyResourceId transactions(first: 20) { kind status processedAt } }
  }
}`;

type Transacao = { kind: string; status: string; processedAt: string | null };

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
  shippingLine: { title: string; originalPriceSet: Dinheiro; discountedPriceSet: Dinheiro } | null;
  totalPriceSet: Dinheiro;
  subtotalPriceSet: Dinheiro;
  currentTotalPriceSet: Dinheiro;
  currentSubtotalPriceSet: Dinheiro;
  totalDiscountsSet: Dinheiro;
  totalShippingPriceSet: Dinheiro;
  fulfillments: { createdAt: string; trackingInfo: { number: string | null; url: string | null; company: string | null }[] }[];
  lineItems: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Linha[];
  };
};

type Linha = {
  id: string;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  currentQuantity: number;
  unfulfilledQuantity: number;
  requiresShipping: boolean;
  isGiftCard: boolean;
  image: { url: string } | null;
  variant: { legacyResourceId: string } | null;
  originalUnitPriceSet: Dinheiro;
  discountedUnitPriceAfterAllDiscountsSet: Dinheiro;
};

type Resposta = {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Pedido[] };
};

type CampoLocal = { key: string; value: string };

function acharCpf(o: Pedido, locais: CampoLocal[] | undefined): string | null {
  const doLocal = locais?.find((c) => c.key === "TAX_CREDENTIAL_BR")?.value;
  if (doLocal) return doLocal;
  const attr = o.customAttributes?.find((c) => /cpf|cnpj/i.test(c.key) && c.value);
  return attr?.value ?? null;
}

// Data do pagamento: primeira venda/captura que deu certo. Sem transação, usa a data de processamento
// e avisa que é estimada: um Sincronizar futuro, quando a transação aparecer, corrige no banco.
function pagoEm(o: Pedido, transacoes: Transacao[] | undefined): { em: string; estimado: boolean } {
  const t = transacoes?.find((x) => (x.kind === "SALE" || x.kind === "CAPTURE") && x.status === "SUCCESS" && x.processedAt);
  return t?.processedAt ? { em: t.processedAt, estimado: false } : { em: o.processedAt ?? o.createdAt, estimado: true };
}

// Pega as linhas que passaram das 50 primeiras (pedido grande) em vez de recusar o pedido.
async function completarLinhas(o: Pedido): Promise<void> {
  let { hasNextPage, endCursor } = o.lineItems.pageInfo;
  while (hasNextPage) {
    const r = await shopify<{ node: { lineItems: Pedido["lineItems"] } | null }>(QUERY_LINHAS, { id: o.id, cursor: endCursor });
    if (!r.node) break;
    o.lineItems.nodes.push(...r.node.lineItems.nodes);
    ({ hasNextPage, endCursor } = r.node.lineItems.pageInfo);
  }
  o.lineItems.pageInfo = { hasNextPage: false, endCursor: null };
}

const dinheiro = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

const PAGOS = new Set(["PAID", "PARTIALLY_REFUNDED"]);
const REEMBOLSADOS = new Set(["REFUNDED", "VOIDED"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const negado = await exigirEquipe(req);
  if (negado) return negado;

  try {
    // Janela de 15 dias, nunca antes da data em que o app começou a valer.
    const inicio = Deno.env.get("SHOPIFY_IMPORTAR_DESDE") ?? new Date().toISOString().slice(0, 10);
    const janela = new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10);
    const desde = inicio > janela ? inicio : janela;
    // Teto de tempo (a função Edge tem limite): se estourar, devolve o que deu e avisa.
    const limite = Date.now() + 110_000;

    const db = admin();
    let cursor: string | null = null;
    let lidos = 0;
    let importados = 0;
    let incompleto = false;
    const erros: { numero: string; erro: string }[] = [];

    do {
      const data: Resposta = await shopify<Resposta>(QUERY, { cursor, q: `updated_at:>=${desde}` });
      lidos += data.orders.nodes.length;

      // Pedidos que já estão no app vão SEMPRE ao banco, em qualquer status (cancelamento, reembolso e
      // despacho precisam chegar). O filtro de "pago" vale só para pedido novo.
      const { data: existentes, error: erroExiste } = await db
        .from("pedidos")
        .select("shopify_order_id")
        .in("shopify_order_id", data.orders.nodes.map((o) => Number(o.legacyResourceId)));
      if (erroExiste) throw new Error(erroExiste.message);
      const jaImportado = new Set((existentes ?? []).map((r: { shopify_order_id: number }) => String(r.shopify_order_id)));

      const aImportar = data.orders.nodes.filter((o) => {
        if (jaImportado.has(o.legacyResourceId)) return true;
        if (o.createdAt.slice(0, 10) < inicio) return false; // anterior ao início do app
        return o.cancelledAt === null && PAGOS.has(o.displayFinancialStatus ?? ""); // Pix/boleto ainda não pago
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

      // Data do pagamento numa consulta à parte: se falhar, usa processedAt (marcada como estimada).
      const pagos = new Map<string, Transacao[]>();
      if (aImportar.length) {
        try {
          const r = await shopify<{ nodes: ({ legacyResourceId: string; transactions: Transacao[] } | null)[] }>(
            QUERY_PAGO,
            { ids: aImportar.map((o) => o.id) },
          );
          for (const n of r.nodes) if (n) pagos.set(n.legacyResourceId, n.transactions);
        } catch (e) {
          console.warn("Transações indisponíveis:", (e as Error).message);
        }
      }

      for (const o of aImportar) {
        try {
        await completarLinhas(o);
        const cancelado = o.cancelledAt !== null;
        const reembolsado = REEMBOLSADOS.has(o.displayFinancialStatus ?? "");
        const despachado = o.displayFulfillmentStatus === "FULFILLED";
        const parcial = o.displayFulfillmentStatus === "PARTIALLY_FULFILLED";
        const novo = !jaImportado.has(o.legacyResourceId);
        const locais = cpfs.get(o.legacyResourceId);
        const cpf = acharCpf(o, locais);
        const envio = o.fulfillments.find((f) => f.trackingInfo.some((t) => t.number || t.url));
        const rastro = envio?.trackingInfo.find((t) => t.number || t.url);
        const sa = o.shippingAddress;
        const pago = pagoEm(o, pagos.get(o.legacyResourceId));
        // Vale gift card e linha sem envio ficam de fora. Pedido novo parcialmente enviado só traz o que falta enviar.
        const linhas = o.lineItems.nodes
          .filter((i) => !i.isGiftCard && i.requiresShipping)
          .map((i) => ({ ...i, qtd: novo && parcial ? i.unfulfilledQuantity : i.currentQuantity }));
        // Desconto das peças: por linha, quantidade atual x (preço original - preço pago). Já considera
        // reembolso parcial; o totalDiscounts da Shopify também soma o frete grátis e não serve.
        const desconto = linhas.reduce((t, i) =>
          t + i.qtd * (Number(i.originalUnitPriceSet.shopMoney.amount) - Number(i.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount)), 0);
        const valorAtual = o.currentTotalPriceSet?.shopMoney.amount ?? o.totalPriceSet.shopMoney.amount;

        const { data: criado, error } = await db.rpc("importar_pedido_shopify", {
          p: {
            shopify_order_id: o.legacyResourceId,
            numero: o.name,
            cancelado,
            reembolsado,
            despachado,
            postado_em: envio?.createdAt ?? null,
            pedido_em: o.createdAt,
            pago_em: pago.em,
            pago_em_estimado: pago.estimado,
            cliente_nome: nomeReal(o.customer?.displayName, o.email) ?? nomeReal(sa?.name, o.email),
            cliente_telefone: sa?.phone ?? o.customer?.phone ?? o.phone ?? null,
            cliente_email: o.email,
            cliente_cpf: cpf,
            ...enderecoBR(sa),
            // Valor atual (depois de reembolso/edição), regravado a cada sincronização.
            valor_total: valorAtual,
            valor_pago: valorAtual,
            desconto_valor: dinheiro(Math.max(0, desconto)),
            desconto_codigos: o.discountCodes,
            // Frete: o que a Shopify cobraria (original) e o que a cliente pagou (cobrado).
            frete_original: o.shippingLine?.originalPriceSet.shopMoney.amount ?? null,
            frete_cobrado: o.shippingLine?.discountedPriceSet.shopMoney.amount ?? o.totalShippingPriceSet.shopMoney.amount,
            frete_titulo: o.shippingLine?.title ?? null,
            forma_pagamento: o.paymentGatewayNames.join(", ") || null,
            rastreio: rastro?.number ?? null,
            rastreio_url: rastro?.url ?? null,
            shopify_url: urlAdminPedido(o.legacyResourceId),
            shopify_bruto: { ...o, localizedFields: locais ?? null },
            itens: linhas.map((i) => ({
              shopify_line_id: i.id.split("/").pop(),
              shopify_variant_id: i.variant?.legacyResourceId ?? null,
              sku: i.sku,
              nome: i.title,
              variante: i.variantTitle === "Default Title" ? null : i.variantTitle,
              foto_url: i.image?.url ?? null,
              qtd: i.qtd,
              preco: i.originalUnitPriceSet.shopMoney.amount,
              preco_pago: i.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount,
            })),
          },
        });
        if (error) throw new Error(error.message);
        if (criado) importados++;
        } catch (e) {
          erros.push({ numero: o.name, erro: (e as Error).message });
        }
      }
      cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
      if (cursor && Date.now() > limite) {
        incompleto = true;
        break;
      }
    } while (cursor);

    return json({ desde, lidos, importados, erros, incompleto });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
