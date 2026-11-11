// Abre uma tela do app com dados REAIS, mas trocando campos do pedido na resposta (ex.: status) e
// BLOQUEANDO qualquer gravação (POST/PATCH/DELETE e RPC). Nada é escrito no Supabase.
// Uso: npm run simular -- <rota> '<json com campos do pedido a trocar>' <nome> ["botão > outro botão"] [texto para rolar até]
// Ex.: npm run simular -- /pedidos/<id> '{"status":"faturamento"}' frete   (precisa do npm run dev e de um npm run capturas antes, para a sessão)
import { chromium } from "@playwright/test"
const [rota, sobrescrever, nome, clicar, rolarAte] = process.argv.slice(2)
const extra = JSON.parse(sobrescrever || "{}")
const base = "http://localhost:5173"
const nav = await chromium.launch()
for (const t of [{ n: "celular", w: 390, h: 844 }, { n: "pc", w: 1280, h: 900 }]) {
  const ctx = await nav.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 2, storageState: ".playwright/sessao.json", colorScheme: "dark" })
  await ctx.route("**/rest/v1/**", async (route) => {
    const req = route.request()
    const url = req.url()
    // RPCs só de leitura (sugestões, valor pago, categorias) passam; qualquer outra gravação é bloqueada.
    if (req.method() === "POST" && /\/rpc\/(sugerir_troca|troca_valor_pago|categorias_catalogo)(\?|$)/.test(url)) return route.continue()
    if (req.method() !== "GET" && req.method() !== "HEAD") return route.fulfill({ status: 200, json: null }) // nada grava
    if (url.includes("/v_pedidos")) {
      const r = await route.fetch()
      const texto = await r.text()
      if (!texto) return route.fulfill({ response: r })
      let body = JSON.parse(texto)
      const mudar = (o) => ({ ...o, ...extra })
      body = Array.isArray(body) ? body.map(mudar) : mudar(body)
      return route.fulfill({ response: r, json: body })
    }
    return route.continue()
  })
  await ctx.routeWebSocket(/realtime/, () => {})
  const pag = await ctx.newPage()
  await pag.goto(base + rota)
  await pag.waitForLoadState("networkidle").catch(() => {})
  await pag.waitForTimeout(1500)
  // Vários cliques em sequência: "Editar troca > 20T3-22M20" (botões pelo nome).
  for (const alvo of (clicar ?? "").split(" > ").filter(Boolean)) {
    // Botão ou aba (o seletor de peças da troca é uma aba).
    const botao = pag.getByRole("button", { name: alvo }).or(pag.getByRole("tab", { name: alvo }))
    if (await botao.count()) await botao.last().click().catch(() => {}) // last: o diálogo fica por cima, no fim da página
    else await pag.getByText(alvo, { exact: true }).last().click().catch(() => {})
    await pag.waitForTimeout(2500)
  }
  if (rolarAte) await pag.getByText(rolarAte, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {})
  await pag.waitForTimeout(400)
  await pag.screenshot({ path: `capturas/sim-${nome}-${t.n}.png`, fullPage: !clicar })
  await ctx.close()
}
await nav.close()
console.log("ok")
