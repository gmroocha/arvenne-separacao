// Abre uma tela do app com dados REAIS, mas trocando campos do pedido na resposta (ex.: status) e
// BLOQUEANDO qualquer gravação (POST/PATCH/DELETE e RPC). Nada é escrito no Supabase.
// Uso: npm run simular -- <rota> '<json com campos do pedido a trocar>' <nome> ["botão > outro botão"] [texto para rolar até]
// Ex.: npm run simular -- /pedidos/<id> '{"status":"faturamento"}' frete   (precisa do npm run dev e de um npm run capturas antes, para a sessão)
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync } from "node:fs"
import { instalarRedeSemGravacao } from "./simulacao/rede.mjs"
const [rota, sobrescrever, nome, clicar, rolarAte] = process.argv.slice(2)
const extra = JSON.parse(sobrescrever || "{}")
// Opcional: SIM_ITENS='{"status":"pendente"}' troca campos das peças (pedido_itens) na resposta. Nada grava.
const extraItens = JSON.parse(process.env.SIM_ITENS || "{}")
const base = "http://localhost:5173"
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").flatMap((linha) => {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
  return m ? [[m[1], m[2].trim().replace(/^["']|["']$/g, "")]] : []
}))
mkdirSync("capturas", { recursive: true })
const nav = await chromium.launch()
try {
for (const t of [{ n: "celular", w: 390, h: 844 }, { n: "pc", w: 1280, h: 900 }]) {
  const ctx = await nav.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 2, storageState: ".playwright/sessao.json", colorScheme: "dark", serviceWorkers: "block" })
  await instalarRedeSemGravacao(ctx, { baseUrl: base, supabaseUrl: env.VITE_SUPABASE_URL, transformar: async (req, body) => {
    const url = req.url()
    if (url.includes("/v_pedidos")) {
      const mudar = (o) => ({ ...o, ...extra })
      return Array.isArray(body) ? body.map(mudar) : body ? mudar(body) : body
    }
    if (url.includes("/pedido_itens") && Object.keys(extraItens).length) {
      return Array.isArray(body) ? body.map((o) => ({ ...o, ...extraItens })) : body ? { ...body, ...extraItens } : body
    }
    return body
  } })
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
  // Opcional: SIM_DIGITAR="anel" digita no primeiro campo de busca visível (só leitura; gravações seguem bloqueadas).
  if (process.env.SIM_DIGITAR) {
    await pag.locator('input[placeholder*="Buscar"]:visible').first().fill(process.env.SIM_DIGITAR).catch(() => {})
    await pag.waitForTimeout(2500)
  }
  if (rolarAte) await pag.getByText(rolarAte, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {})
  await pag.waitForTimeout(400)
  await pag.screenshot({ path: `capturas/sim-${nome}-${t.n}.png`, fullPage: !clicar })
  await ctx.close()
}
} finally { await nav.close() }
console.log("ok")
