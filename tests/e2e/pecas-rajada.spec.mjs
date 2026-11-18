import { test, expect } from "@playwright/test"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"
import { continuarAviso } from "./auxiliar.mjs"

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
const encontradas = async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)
const lerItens = (page, contador) => page.on("request", req => { if (req.method() === "GET" && new URL(req.url()).pathname === "/rest/v1/pedido_itens") contador.n++ })

test("V75: falha de tempo limite repete o lote sem reler o pedido por cima das peças marcadas", async ({ page, context, baseURL }) => {
  await preparar(page, context, baseURL)
  let chamadas = 0
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async route => {
    chamadas++
    if (chamadas <= 2) return route.fulfill({ status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } })
    await route.fallback()
  })
  const leituras = { n: 0 }
  lerItens(page, leituras)
  // Dispara no mesmo quadro para não depender da velocidade da máquina.
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll(bs => bs.forEach(b => b.click()))
  // A tela não volta atrás: as peças marcadas continuam fora da lista, mesmo com o banco falhando.
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(0)
  await expect.poll(encontradas, { timeout: 15_000 }).toBe(4)
  expect(chamadas).toBeGreaterThanOrEqual(3)
  expect(leituras.n).toBe(0)
  await continuarAviso(page, "Separação", "Conferência") // o aviso de etapa concluída é o único diálogo
  expect(sim.bloqueadas).toEqual([])
})

test("V76: sequência de peças vai em lote e não recarrega o pedido a cada clique", async ({ page, context, baseURL }) => {
  await preparar(page, context, baseURL)
  const leituras = { n: 0 }
  lerItens(page, leituras)
  let lotes = 0
  page.on("request", req => { if (new URL(req.url()).pathname === "/rest/v1/rpc/marcar_pecas") lotes++ })
  for (let n = 1; n <= 4; n++) {
    await page.getByRole("button", { name: "Achei", exact: true }).first().click()
    if (n < 4) await page.waitForTimeout(60)
  }
  await expect.poll(encontradas).toBe(4)
  // O pedido avança sozinho para a Conferência (com o aviso de etapa concluída) e a tela vai junto, sem reler nada.
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  await continuarAviso(page, "Separação", "Conferência")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(4)
  expect(lotes).toBeLessThanOrEqual(2)
  expect(leituras.n).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

test("V77: timeout confirmado da bipagem é repetido sem contar duas vezes", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let chamadas = 0
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async route => {
    chamadas++
    if (chamadas === 1) return route.fulfill({ status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } })
    await route.fallback()
  })
  const campo = page.getByPlaceholder(/código/i)
  await campo.fill("AN-1")
  await campo.press("Enter")
  await expect.poll(() => chamadas, { timeout: 15_000 }).toBe(2)
  await expect.poll(async () => (await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada).toBe(1)
  // Esta versão não guarda mais cada leitura (tabela bipagens): a contagem fica na peça.
  expect(Number((await sim.one("select count(*) n from bipagens where pedido_id=$1", [sim.pedido.id])).n)).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

test("V77: resposta perdida depois de bipar não conta duas vezes (o lote traz o total, não +1)", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let chamadas = 0, perdeu = false
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async route => {
    chamadas++
    if (perdeu) return route.fallback()
    const corpo = route.request().postDataJSON()
    await sim.banco.exec("begin; set local role authenticated")
    try { await sim.banco.query("select marcar_pecas($1,$2::jsonb)", [sim.pedido.id, JSON.stringify(corpo.p_marcas)]); await sim.banco.exec("commit") }
    catch (e) { await sim.banco.exec("rollback"); throw e }
    perdeu = true
    await route.fulfill({ status: 502, json: { message: "Resposta perdida após gravar" } })
  })
  const campo = page.getByPlaceholder(/código/i)
  await campo.fill("AN-1")
  await campo.press("Enter")
  await expect.poll(() => chamadas, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(300)
  expect((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada).toBe(1)
  await page.reload()
  await expect(page.getByText("1/2", { exact: true }).first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V75: trinta cliques rápidos sobrevivem a refoco durante a gravação e o pedido avança sozinho", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n from generate_series(1,29) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.clock.install()
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let retida = false, liberar, chamadas = 0
  const espera = new Promise(r => { liberar = r })
  await context.route(u => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async route => {
    chamadas++
    if (!retida) { retida = true; await espera }
    await route.fallback()
  })
  const leituras = { n: 0 }
  lerItens(page, leituras)
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll(bs => bs.forEach(b => b.click()))
  try {
    await page.clock.fastForward(1_000)
    await expect.poll(() => retida).toBe(true)
    await page.clock.fastForward(20_000)
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
    // Com o banco ainda respondendo, a tela mostra as 30 peças marcadas e nenhuma releitura traz a lista antiga.
    await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(0)
    expect(leituras.n).toBe(0)
  } finally { liberar() }
  await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)).toBe(30)
  await page.clock.resume()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  await continuarAviso(page, "Separação", "Conferência")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(30)
  expect(chamadas).toBeLessThanOrEqual(2)
  expect(sim.bloqueadas).toEqual([])
})

test("V80: conferência rápida com Broadcast em duas telas mantém a lista e outro pedido acessíveis", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao()
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n from generate_series(1,29) n`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  const outro = await sim.one("insert into pedidos(origem,status,cliente_nome) values('whatsapp','novo','Outra cliente') returning id")
  await sim.instalar(context, baseURL)
  const lista = await context.newPage()
  const canais = new Map()
  for (const tela of [page, lista]) {
    // Servidor Phoenix fictício: o navegador usa o cliente Realtime real, sem abrir conexão externa.
    await tela.routeWebSocket('wss://simulacao.supabase.test/**', ws => {
      ws.onMessage(raw => {
        const [join, ref, topic, evento] = JSON.parse(raw.toString())
        if (evento === 'phx_join') canais.set(tela, { ws, join, topic })
        ws.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
      })
    })
  }
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await lista.goto('/')
  await Promise.all([page.waitForLoadState('networkidle'), lista.waitForLoadState('networkidle')])
  await expect.poll(() => canais.size).toBe(2)
  let detalhes = 0, listas = 0, contagens = 0, avisos = 0
  page.on('request', req => { if (new URL(req.url()).pathname === '/rest/v1/pedido_itens') detalhes++ })
  lista.on('request', req => {
    const u = new URL(req.url())
    if (u.pathname === '/rest/v1/v_pedidos_operacao' && u.searchParams.has('status')) listas++
    if (u.pathname === '/rest/v1/rpc/contagens_pedidos') contagens++
  })
  page.on('requestfinished', req => {
    if (new URL(req.url()).pathname !== '/rest/v1/rpc/marcar_pecas') return
    avisos++
    for (const { ws, join, topic } of canais.values()) ws.send(JSON.stringify([
      join, null, topic, 'broadcast', { event: 'mudou', type: 'broadcast', payload: { t: 'pedido_itens', p: [sim.pedido.id] } },
    ]))
  })
  await page.getByRole('button', { name: 'Conferida', exact: true }).evaluateAll(bs => bs.forEach(b => b.click()))
  await expect.poll(() => avisos).toBeGreaterThanOrEqual(1)
  await expect.poll(async () => Number((await sim.one('select count(*) n from pedido_itens where pedido_id=$1 and conferido_em is not null', [sim.pedido.id])).n)).toBe(30)
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe('bipagem')
  await lista.waitForTimeout(1800)
  // Quem marcou não relê o pedido (o eco do próprio lote é ignorado); a outra tela relê a lista uma vez.
  expect(detalhes).toBe(0)
  expect(listas).toBeLessThanOrEqual(1)
  expect(contagens).toBeLessThanOrEqual(1)
  await lista.goto(`/pedidos/${outro.id}`)
  await expect(lista.getByText('Outra cliente', { exact: true }).first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
  await lista.close()
})
