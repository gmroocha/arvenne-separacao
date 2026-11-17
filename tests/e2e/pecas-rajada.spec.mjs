import { test, expect } from "@playwright/test"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function preparar(page, context, baseURL) {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n from generate_series(1,3) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
}

test("V75: falha numa peça não relê o pedido por cima das outras ainda na fila", async ({ page, context, baseURL }) => {
  await preparar(page, context, baseURL)
  let falhas = 0, retida = false, liberar
  const espera = new Promise(r => { liberar = r })
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/alterar_item", async route => {
    if (route.request().postDataJSON().p_item === sim.item.id) {
      falhas++
      return route.fulfill({ status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } })
    }
    retida = true
    await espera
    await route.fallback()
  })
  let leituras = 0
  page.on("request", req => { if (req.method() === "GET" && new URL(req.url()).pathname === "/rest/v1/pedido_itens") leituras++ })
  // Dispara no mesmo quadro para não depender da velocidade da máquina.
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll(bs => bs.forEach(b => b.click()))
  try {
    await expect.poll(() => retida && falhas >= 2).toBe(true)
    await page.waitForTimeout(400)
    expect(leituras).toBe(0)
  } finally { liberar() }
  await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)).toBe(3)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(1)
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(sim.bloqueadas).toEqual([])
})

test("V76: sequência de peças não recarrega o pedido inteiro entre cada clique", async ({ page, context, baseURL }) => {
  await preparar(page, context, baseURL)
  let leituras = 0
  page.on("request", req => { if (req.method() === "GET" && new URL(req.url()).pathname === "/rest/v1/pedido_itens") leituras++ })
  for (let n = 1; n <= 4; n++) {
    await page.getByRole("button", { name: "Achei", exact: true }).first().click()
    await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)).toBe(n)
    if (n < 4) await page.waitForTimeout(150)
  }
  await expect(page.getByRole("dialog").getByText("Separação concluída")).toBeVisible()
  await expect.poll(() => leituras).toBe(1)
  expect(sim.bloqueadas).toEqual([])
})

test("V77: timeout confirmado da bipagem pode ser repetido sem contar duas vezes", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let chamadas = 0
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/bipar", async route => {
    chamadas++
    if (chamadas === 1) return route.fulfill({ status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } })
    await route.fallback()
  })
  const campo = page.getByPlaceholder(/código/i)
  await campo.fill("AN-1")
  await campo.press("Enter")
  await expect.poll(() => chamadas).toBe(2)
  await expect.poll(async () => (await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada).toBe(1)
  expect(Number((await sim.one("select count(*) n from bipagens where pedido_id=$1", [sim.pedido.id])).n)).toBe(1)
  expect(sim.bloqueadas).toEqual([])
})

test("V77: resposta perdida depois de bipar não repete a contagem", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let chamadas = 0
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/bipar", async route => {
    chamadas++
    await sim.one("select bipar($1,$2,'AN-1')", [sim.pedido.id, sim.item.id])
    await route.fulfill({ status: 502, json: { message: "Resposta perdida após gravar" } })
  })
  const campo = page.getByPlaceholder(/código/i)
  await campo.fill("AN-1")
  await campo.press("Enter")
  await expect(page.getByText(/Resposta perdida após gravar/)).toBeVisible()
  await page.waitForTimeout(1200)
  expect(chamadas).toBe(1)
  expect((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada).toBe(1)
  await page.reload()
  await expect(page.getByText("1/2", { exact: true }).first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V75: trinta cliques rápidos sobrevivem a refoco durante a gravação e concluem a etapa", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n from generate_series(1,29) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.clock.install()
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let retida = false, liberar
  const espera = new Promise(r => { liberar = r })
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/alterar_item", async route => {
    if (!retida) { retida = true; await espera }
    await route.fallback()
  })
  let leituras = 0
  page.on("request", req => { if (req.method() === "GET" && new URL(req.url()).pathname === "/rest/v1/pedido_itens") leituras++ })
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll(bs => bs.forEach(b => b.click()))
  try {
    await expect.poll(() => retida).toBe(true)
    await page.clock.fastForward(20_000)
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
    await expect(page.getByRole("dialog").getByText("Separação concluída")).toBeVisible()
    expect(leituras).toBe(0)
  } finally { liberar() }
  await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)).toBe(30)
  await page.clock.resume()
  await page.getByRole("button", { name: "Ir para Conferência", exact: true }).click()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(30)
  expect(sim.bloqueadas).toEqual([])
})
