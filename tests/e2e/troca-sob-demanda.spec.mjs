import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

// Lentidão de 23/11/2026: troca_painel era a leitura mais cara do banco (560 chamadas em 3 h, 4,6 s em média sob carga) e
// rodava em TODO pedido aberto na Separação/Conferência, mesmo sem peça em falta. Só precisa dela quando há falta ou defeito.
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const contarPainel = (page) => {
  const c = { n: 0 }
  page.on("request", (req) => {
    const p = new URL(req.url()).pathname
    if (p === "/rest/v1/rpc/troca_painel") c.n++
  })
  return c
}

test("pedido sem peça em falta não lê a troca", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n from generate_series(1,2) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  const c = contarPainel(page)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  await expect(page.getByRole("button", { name: "Achei", exact: true }).first()).toBeVisible()
  expect(c.n).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

test("pedido com peça em falta continua lendo a troca", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem,status)
    values ($1,'avulso','Peça em falta','PC-F',1,10,1,'falta')`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  const c = contarPainel(page)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  await expect.poll(() => c.n).toBeGreaterThan(0)
  expect(sim.bloqueadas).toEqual([])
})
