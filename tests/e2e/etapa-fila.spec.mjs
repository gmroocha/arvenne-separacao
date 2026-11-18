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

// V60: a peça ainda grava quando a tela é lida de novo. A leitura trazia a etapa antiga do banco por cima do que a
// pessoa acabou de marcar: a tela "voltava" para a Separação. Agora a tela das peças só confia no que ela mesma
// marcou até o banco responder, e a etapa nova chega na resposta (sem reler o pedido).
test("V60: peças ainda gravando não deixam a tela voltar para a Separação", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let liberar
  const retida = new Promise((r) => { liberar = r })
  let segurou = false
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async (route) => {
    segurou = true
    await retida
    await route.fallback()
  })
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll((bs) => bs.forEach((b) => b.click()))
  await expect.poll(() => segurou).toBe(true)
  // Foco volta para a aba e o relógio passa enquanto o banco ainda não respondeu: a tela mantém as peças marcadas.
  await page.evaluate(() => { window.__voltouSeparacao = false
    new MutationObserver(() => { if (document.body.innerText.includes("A encontrar") && !document.body.innerText.includes("Nenhuma peça pendente")) window.__voltouSeparacao = true })
      .observe(document.body, { childList: true, subtree: true, characterData: true })
    window.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")) })
  await page.waitForTimeout(600)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(0)
  liberar()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(4)
  expect(await page.evaluate(() => window.__voltouSeparacao)).toBe(false)
  expect(sim.bloqueadas).toEqual([])
})

// V82: cada peça anda sozinha, então as etapas de peça abrem direto (com as peças que já chegaram); as de documentos
// à frente da atual continuam pedindo aviso antes de abrir.
test("V82: etapas de peça abrem direto; as de documentos pedem aviso", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText("A encontrar")).toBeVisible()
  const ir = async (nome) => {
    if ((page.viewportSize()?.width ?? 0) < 1024) {
      await page.getByRole("button", { name: /^Etapa \d+ de/ }).click()
      await page.getByRole("dialog", { name: "Etapas do pedido" }).getByRole("button", { name: new RegExp(`^${nome}`) }).click()
    } else await page.getByRole("list", { name: "Etapas do pedido" }).getByRole("button", { name: new RegExp(`^${nome}`) }).click()
  }
  await ir("Conferência")
  await expect(page.getByText("Nenhuma peça chegou da Separação ainda.")).toBeVisible()
  await expect(page.getByRole("dialog", { name: "Etapa ainda não liberada" })).toHaveCount(0)
  await ir("Embalagem")
  await expect(page.getByRole("dialog", { name: "Etapa ainda não liberada" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

// V62: pedido aberto com a etapa atual já toda feita (feito antes desta versão, ou por outra tela) ficava parado
// esperando um clique em "Concluir". Agora ao abrir o app pede o recálculo e o pedido segue sozinho.
test("V62: abrir o pedido com a etapa atual já completa o leva para a próxima", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL, "encontrado")
  await sim.banco.query("update pedido_itens set status='encontrado', conferido_em=now(), etiquetado_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("bipagem")
  await expect(page.getByRole("textbox", { name: "Código da peça" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

// V63: toques rápidos em "Conferida" no mesmo lugar da tela. Durante a animação das peças a camada da transição
// engolia os toques: a tela parecia travada e peças ficavam sem marcar.
test("V63: toques rápidos seguidos marcam todas as peças", async ({ page, context, baseURL }) => {
  await pedidoComPecas(context, baseURL, "encontrado")
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const botao = page.getByRole("button", { name: "Conferida", exact: true })
  await expect(botao.first()).toBeVisible()
  // Cada toque cai no primeiro "Conferida" da lista (a lista encolhe e a tela se ajusta a cada peça).
  for (let n = 0; n < 4; n++) {
    await botao.first().click()
    await page.waitForTimeout(90)
  }
  await expect.poll(async () => Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and conferido_em is not null", [sim.pedido.id])).n)).toBe(4)
  expect(sim.bloqueadas).toEqual([])
})

// V64: "Contar 1" tocado rápido na mesma peça (3×): a tela contava a partir do número antigo do botão e ficava em 1/3.
// Agora conta na hora, parte do número da tela, e a gravação vai em lote (um valor absoluto).
test("V64: toques rápidos em Contar 1 contam na hora e o pedido segue para a Nota fiscal", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedido_itens set status='encontrado', qtd=3, conferido_em=now(), etiquetado_em=now() where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.fallback()
  })
  const contar = page.getByRole("button", { name: "Contar 1", exact: true })
  await expect(contar).toBeVisible()
  // Três toques antes de a tela redesenhar (aparelho lento ou toques muito rápidos).
  await contar.evaluate((b) => { b.click(); b.click(); b.click() })
  // A tela não espera o banco (700 ms de atraso): a peça já aparece toda bipada.
  await expect(page.getByText("Tudo bipado.")).toBeVisible({ timeout: 600 })
  await expect.poll(async () => Number((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada)).toBe(3)
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("faturamento")
  expect(sim.bloqueadas).toEqual([])
})
