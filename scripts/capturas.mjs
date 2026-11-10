// Tira prints das telas em celular (390 px) e PC (1280 px) para conferir o visual.
// Uso: npm run capturas -- / /pedidos/<id> [--clicar "Texto do botão"] [--nome sufixo]
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
const clicar = opt("--clicar")
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
    if (pag.url().includes("/login")) {
      await entrar(ctx)
      await pag.goto(`${base}${rota}`)
    }
    await pag.waitForLoadState("networkidle")
    if (clicar) {
      await pag.getByRole("button", { name: clicar }).first().click()
      await pag.waitForTimeout(600)
    }
    const nome = `${rota.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "inicio"}${sufixo ? "-" + sufixo : ""}-${t.nome}`
    await pag.screenshot({ path: `capturas/${nome}.png`, fullPage: !clicar })
    const largura = await pag.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log(`capturas/${nome}.png${largura > 0 ? `  ⚠ rolagem horizontal de ${largura}px` : ""}${erros.length ? `  ⚠ erros: ${erros.join("; ")}` : ""}`)
    await pag.close()
  }
  await ctx.close()
}
await navegador.close()
