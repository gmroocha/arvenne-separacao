// Tira prints das telas em celular (390 px) e PC (1280 px) para conferir o visual.
// Uso: npm run capturas -- / /pedidos/<id> [--clicar "Botão"]... [--rolar] [--esperar ms] [--seletor css] [--nome sufixo]
// --clicar pode repetir (clica em ordem); --seletor fotografa só aquele elemento (ex.: "[role=dialog]").
// Precisa do app rodando (npm run dev) e de E2E_EMAIL / E2E_SENHA no .env.local (usuário só de teste).
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync, existsSync } from "node:fs"

const env = {}
if (existsSync(".env.local"))
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }

const args = process.argv.slice(2)
const opt = (nome) => {
  const i = args.indexOf(nome)
  if (i < 0) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const cliques = []
for (let i = args.indexOf("--clicar"); i >= 0; i = args.indexOf("--clicar")) cliques.push(opt("--clicar"))
const rolar = args.includes("--rolar") && !!args.splice(args.indexOf("--rolar"), 1)
const esperar = Number(opt("--esperar") ?? 600)
const seletor = opt("--seletor")
const sufixo = opt("--nome")
const rotas = args.length ? args : ["/"]
const base = process.env.APP_URL ?? "http://localhost:5173"
const tamanhos = [
  { nome: "celular", width: 390, height: 844 },
  { nome: "pc", width: 1280, height: 800 },
]

if (!env.E2E_EMAIL || !env.E2E_SENHA) {
  console.error("Falta E2E_EMAIL e E2E_SENHA no .env.local (usuário de teste).")
  process.exit(1)
}

mkdirSync("capturas", { recursive: true })
mkdirSync(".playwright", { recursive: true })
const navegador = await chromium.launch()
const sessao = ".playwright/sessao.json"

async function entrar(ctx) {
  const pag = await ctx.newPage()
  await pag.goto(`${base}/login`)
  await pag.fill("#email", env.E2E_EMAIL)
  await pag.fill("#senha", env.E2E_SENHA)
  await pag.click("button[type=submit]")
  await pag.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 })
  await ctx.storageState({ path: sessao })
  await pag.close()
}

for (const t of tamanhos) {
  const ctx = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    ...(existsSync(sessao) ? { storageState: sessao } : {}),
  })
  if (!existsSync(sessao)) await entrar(ctx)
  for (const rota of rotas) {
    const pag = await ctx.newPage()
    const erros = []
    pag.on("pageerror", (e) => erros.push(e.message))
    await pag.goto(`${base}${rota}`)
    await pag.waitForLoadState("networkidle")
    // Sessão guardada vencida ou o app voltou para o login depois de carregar: entra de novo e repete a navegação.
    if (new URL(pag.url()).pathname.startsWith("/login") && !rota.startsWith("/login")) {
      await entrar(ctx)
      await pag.goto(`${base}${rota}`)
      await pag.waitForLoadState("networkidle")
    }
    for (const texto of cliques) {
      const alvo = pag.getByRole("button", { name: texto }).or(pag.getByRole("tab", { name: texto })).first()
      await alvo.click()
      await pag.waitForTimeout(esperar)
    }
    if (rolar) {
      await pag.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await pag.waitForTimeout(esperar)
    }
    const nome = `${rota.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "inicio"}${sufixo ? "-" + sufixo : ""}-${t.nome}`
    const arquivo = `capturas/${nome}.png`
    if (seletor) await pag.locator(seletor).first().screenshot({ path: arquivo })
    else await pag.screenshot({ path: arquivo, fullPage: cliques.length === 0 && !rolar })
    const largura = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`${arquivo}${largura > 0 ? `  ⚠ rolagem horizontal de ${largura}px` : ""}${erros.length ? `  ⚠ erros: ${erros.join("; ")}` : ""}`)
    await pag.close()
  }
  await ctx.close()
}
await navegador.close()
