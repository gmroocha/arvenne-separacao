import { test, expect } from "@playwright/test"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function pedidoComPecas(context, baseURL, statusItens = "pendente") {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem,status)
    select $1,'avulso','Peça '||n,'PC-'||n,1,10,n,$2 from generate_series(1,3) n`, [sim.pedido.id, statusItens])
  await sim.instalar(context, baseURL)
}

// V60: "Ir para Conferência" com a última peça ainda gravando. O recarregar da fila de peças trazia a
// etapa antiga do banco por cima da nova: a tela "voltava" para a Separação logo depois de confirmar.
test("V60: confirmar a próxima etapa com peça ainda gravando não volta a tela para a Separação", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let liberarPeca
  const pecaRetida = new Promise((r) => { liberarPeca = r })
  let retida = false
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/alterar_item", async (route) => {
    if (route.request().postDataJSON().p_item === sim.item.id) { retida = true; await pecaRetida }
    await route.fallback()
  })
  // A mudança de etapa demora a chegar ao banco: é nessa janela que a tela voltava.
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/pedidos", async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })
  const achei = page.getByRole("button", { name: "Achei", exact: true })
  for (let n = 0; n < 4; n++) await achei.first().click()
  await expect.poll(() => retida).toBe(true)
  await page.getByRole("button", { name: "Ir para Conferência", exact: true }).click()
  await expect(page.getByRole("button", { name: "Conferida", exact: true }).first()).toBeVisible()
  // Vigia a tela durante a janela inteira: a Separação não pode reaparecer nem por um instante.
  await page.evaluate(() => {
    window.__voltouSeparacao = false
    const olhar = () => { if (document.body.innerText.includes("A encontrar")) window.__voltouSeparacao = true }
    new MutationObserver(olhar).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  liberarPeca()
  await page.waitForTimeout(1200)
  await expect(page.getByRole("button", { name: "Conferida", exact: true }).first()).toBeVisible()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  await sim.ocioso()
  expect(await page.evaluate(() => window.__voltouSeparacao)).toBe(false)
  expect(sim.bloqueadas).toEqual([])
})

// V61: com a tela atrasada, a pessoa tocava na etapa seguinte ("Ver mesmo assim"); se o pedido chegava
// nela enquanto o aviso estava aberto, a etapa atual ficava marcada como "vista" e, ao conferir tudo,
// o diálogo da próxima etapa não abria.
test("V61: abrir a etapa atual por \"Ver mesmo assim\" ainda oferece a próxima etapa ao concluir", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL, "encontrado")
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='separacao' where id=$1", [sim.pedido.id])
  await page.clock.install()
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText("A encontrar")).toBeVisible()
  // A separação já completa oferece a Conferência (V62); a pessoa fica e olha a esteira.
  await page.getByRole("dialog").getByRole("button", { name: "Ficar aqui" }).click()
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: /^Etapa 1 de/ }).click()
    await page.getByRole("dialog", { name: "Etapas do pedido" }).getByRole("button", { name: "Conferência", exact: true }).click()
  } else await page.getByRole("button", { name: "Conferência", exact: true }).click()
  const aviso = page.getByRole("dialog", { name: "Etapa ainda não liberada" })
  await expect(aviso).toBeVisible()
  // Enquanto o aviso está aberto, o pedido chega à Conferência e a tela recarrega.
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await page.clock.fastForward(20_000)
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
  await expect(page.getByText("A conferir")).toBeAttached()
  await aviso.getByRole("button", { name: "Ver mesmo assim" }).click()
  const conferida = page.getByRole("button", { name: "Conferida", exact: true })
  for (let n = 0; n < 4; n++) await conferida.first().click()
  await expect(page.getByRole("dialog").getByText("Conferência concluída")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

// V62: pedido aberto já com a etapa toda feita (concluída noutra tela, ou com a tela atrasada) não oferecia
// a próxima etapa: o diálogo só abria no toque que completava a etapa.
test("V62: abrir o pedido com a etapa atual já completa oferece a próxima etapa", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL, "encontrado")
  await sim.banco.query("update pedido_itens set status='encontrado', conferido_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const dialogo = page.getByRole("dialog").filter({ hasText: "Conferência concluída" })
  await expect(dialogo).toBeVisible()
  // "Ficar aqui" é respeitado: o diálogo não volta sozinho enquanto nada muda.
  await dialogo.getByRole("button", { name: "Ficar aqui" }).click()
  await expect(dialogo).toBeHidden()
  await page.waitForTimeout(500)
  await expect(dialogo).toBeHidden()
  expect(sim.bloqueadas).toEqual([])
})

// V63: toques rápidos em "Etiquetada" (ou "Conferida") no mesmo lugar da tela. Durante a animação das peças
// a camada da transição engolia os toques: a tela parecia travada e peças ficavam sem marcar.
test("V63: toques rápidos seguidos marcam todas as peças", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL, "encontrado")
  await sim.banco.query("update pedido_itens set status='encontrado', conferido_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='etiquetagem' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const botao = page.getByRole("button", { name: "Etiquetada", exact: true }).first()
  await expect(botao).toBeVisible()
  const caixa = await botao.boundingBox()
  for (let n = 0; n < 4; n++) {
    await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.waitForTimeout(90)
  }
  await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and etiquetado_em is not null", [sim.pedido.id])).n)).toBe(4)
  expect(sim.bloqueadas).toEqual([])
})

// V64: "Contar 1" tocado rápido na mesma peça (3×): a tela contava a partir do número antigo do botão,
// ficava em 1/3 e a próxima etapa só aparecia quando a fila de gravações acabava.
test("V64: toques rápidos em Contar 1 contam na hora e oferecem a próxima etapa", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedido_itens set status='encontrado', qtd=3, conferido_em=now(), etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/bipar_ajustar", async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.fallback()
  })
  const contar = page.getByRole("button", { name: "Contar 1", exact: true })
  await expect(contar).toBeVisible()
  // Três toques antes de a tela redesenhar (aparelho lento ou toques muito rápidos).
  await contar.evaluate((b) => { b.click(); b.click(); b.click() })
  // A fila leva ~2 s para gravar as três; a tela não espera por ela.
  await expect(page.getByRole("dialog").getByText("Bipagem concluída")).toBeVisible({ timeout: 1200 })
  await expect.poll(async () => Number((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada)).toBe(3)
  expect(sim.bloqueadas).toEqual([])
})
