import { afterAll, beforeAll, expect, test, vi } from "vitest"

const sim = vi.hoisted(() => ({ pedido: null, gravados: [], consultas: [], handler: null, descontos: [], falharDescontos: false }))
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
    if (query.includes("discountApplications")) {
      if (sim.falharDescontos) throw new Error("Campo indisponível nesta versão da API")
      return { nodes: sim.descontos }
    }
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

// V10: centavos do rateio de desconto. Unitário arredondado x quantidade não fecha com o subtotal real.
test("V10: valor exato por linha fecha com o subtotal da Shopify", async () => {
  const { valoresExatosDasLinhas } = await import("../../supabase/functions/shopify-sync/index.ts")
  const linha = (qtd, unit, extra = {}) => ({ qtd, currentQuantity: qtd, isGiftCard: false, requiresShipping: true,
    discountedUnitPriceAfterAllDiscountsSet: money(unit), ...extra })
  // 3 x 33,33 = 99,99, mas a cliente pagou 100,00 por essas peças; 1 x 10,00 = 10,00.
  const l = [linha(3, "33.33"), linha(1, "10.00")]
  const vale = linha(1, "50.00", { isGiftCard: true })
  const ped = { currentSubtotalPriceSet: money("160.00"), lineItems: { nodes: [...l, vale] } }
  expect(valoresExatosDasLinhas(ped, l, false)).toEqual(["100.00", "10.00"])
  // Resíduo negativo também se distribui, e a soma é sempre o subtotal sem o vale.
  const l2 = [linha(2, "12.35"), linha(2, "7.65")]
  const r = valoresExatosDasLinhas({ currentSubtotalPriceSet: money("39.98"), lineItems: { nodes: l2 } }, l2, false)
  expect(r.reduce((t, v) => t + Math.round(Number(v) * 100), 0)).toBe(3998)
  // Diferença grande demais não é centavo de arredondamento: não arrisca.
  expect(valoresExatosDasLinhas({ currentSubtotalPriceSet: money("150.00"), lineItems: { nodes: l } }, l, false)).toBeNull()
  // Importação parcial (só o que falta enviar) não fecha com o subtotal do pedido inteiro.
  expect(valoresExatosDasLinhas(ped, l, true)).toBeNull()
})

// Motivo dos descontos: consulta à parte, juntada ao pedido bruto; se falhar, o pedido entra mesmo assim.
test("descontos da Shopify entram no pedido bruto; falha na consulta não impede a importação", async () => {
  const aplicacoes = [{ __typename: "DiscountCodeApplication", code: "BEMVINDA10", allocationMethod: "ACROSS", targetType: "LINE_ITEM", value: { __typename: "PricingPercentageValue", percentage: 10 } }]
  sim.pedido = pedido(); sim.gravados = []; sim.consultas = []
  sim.descontos = [{ legacyResourceId: "777", discountApplications: { nodes: aplicacoes } }]
  let r = await (await sim.handler(new Request("https://edge.ficticia.test", { method: "POST" }))).json()
  expect(r.erros).toEqual([])
  const consulta = sim.consultas.find((q) => q.includes("discountApplications"))
  expect(consulta).toContain("PricingPercentageValue")
  expect(consulta).toContain("DiscountCodeApplication")
  expect(sim.gravados[0].shopify_bruto.discountApplications).toEqual(aplicacoes)

  sim.gravados = []; sim.falharDescontos = true
  r = await (await sim.handler(new Request("https://edge.ficticia.test", { method: "POST" }))).json()
  sim.falharDescontos = false; sim.descontos = []
  expect(r.erros).toEqual([])
  expect(sim.gravados).toHaveLength(1)
  expect("discountApplications" in sim.gravados[0].shopify_bruto).toBe(false)
})
