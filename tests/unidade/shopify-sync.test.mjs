import { afterAll, beforeAll, expect, test, vi } from "vitest"

const sim = vi.hoisted(() => ({ pedido: null, gravados: [], consultas: [], handler: null }))
vi.mock("../../supabase/functions/_shared/http.ts", () => ({
  admin: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [{ shopify_order_id: 777 }], error: null }) }) }),
    rpc: async (_nome, args) => { sim.gravados.push(args.p); return { data: false, error: null } },
  }),
  cors: {}, exigirEquipe: async () => null,
  json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
}))
vi.mock("../../supabase/functions/_shared/shopify.ts", () => ({
  urlAdminPedido: () => "https://admin.shopify.test/orders/777",
  consulta: async (query) => {
    sim.consultas.push(query)
    if (query.includes("query Pedidos")) return { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [sim.pedido] } }
    return { nodes: [] }
  },
}))
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn) => { sim.handler = fn }, env: { get: () => "2026-01-01" } })
  await import("../../supabase/functions/shopify-sync/index.ts")
})
afterAll(() => vi.unstubAllGlobals())

const money = (amount) => ({ shopMoney: { amount } })
function pedido({ total = "150.00", recebido = "100.00", devolvido = "0.00", liquido = "100.00", saldo = "50.00" } = {}) {
  return {
    id: "gid://shopify/Order/777", legacyResourceId: "777", name: "TESTE-777",
    createdAt: "2026-11-01T12:00:00Z", processedAt: "2026-11-01T12:00:00Z", updatedAt: "2026-11-02T12:00:00Z",
    cancelledAt: null, displayFinancialStatus: "PARTIALLY_PAID", displayFulfillmentStatus: "UNFULFILLED",
    email: null, phone: null, note: null, customer: null, shippingAddress: null, customAttributes: [],
    paymentGatewayNames: ["Cartão"], discountCodes: [], shippingLine: null, fulfillments: [],
    currentTotalPriceSet: money(total), totalPriceSet: money(total), totalShippingPriceSet: money("0.00"),
    netPaymentSet: money(liquido), totalReceivedSet: money(recebido), totalRefundedSet: money(devolvido), totalOutstandingSet: money(saldo),
    lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
  }
}

test.each([
  ["edição aumenta total sem receber o restante", {}, "150.00", "100.00"],
  ["reembolso reduz recebido líquido", { total: "80.00", devolvido: "20.00", liquido: "80.00", saldo: "0.00" }, "80.00", "80.00"],
  ["pagamento parcial preserva saldo em aberto", { total: "150.00", recebido: "40.00", liquido: "40.00", saldo: "110.00" }, "150.00", "40.00"],
])("V09: %s", async (_nome, campos, total, pago) => {
  sim.pedido = pedido(campos); sim.gravados = []; sim.consultas = []
  const resposta = await sim.handler(new Request("https://edge.ficticia.test", { method: "POST" }))
  expect(resposta.status).toBe(200)
  expect((await resposta.json()).erros).toEqual([])
  expect(sim.gravados).toHaveLength(1)
  expect(sim.gravados[0].valor_total).toBe(total)
  expect(sim.gravados[0].valor_pago).toBe(pago)
  expect(sim.gravados[0].shopify_bruto.totalRefundedSet).toEqual(sim.pedido.totalRefundedSet)
  expect(sim.consultas.find((q) => q.includes("query Pedidos"))).toContain("netPaymentSet")
})

test("V09: dado financeiro ausente recusa a importação e nunca presume pagamento pelo total", async () => {
  sim.pedido = pedido(); sim.pedido.netPaymentSet = null; sim.gravados = []
  const resposta = await sim.handler(new Request("https://edge.ficticia.test", { method: "POST" }))
  const r = await resposta.json()
  expect(r.erros).toHaveLength(1)
  expect(r.erros[0].erro).toContain("pagamento líquido")
  expect(sim.gravados).toEqual([])
})
