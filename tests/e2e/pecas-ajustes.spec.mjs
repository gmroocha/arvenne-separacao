import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function conferencia(context, baseURL) {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,status)
    select $1,'avulso','Peça '||n,'PC-'||n,'N°1'||n,1,10,n,'encontrado' from generate_series(1,3) n`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
}

// V66: marcar uma peça animava os blocos (deslizar até o fim da fileira de cima) e a tela engasgava.
// A troca agora é direta: nenhuma transição de tela começa ao marcar.
test("V66: marcar peça troca a tela sem animação de transição", async ({ page, context, baseURL }) => {
  await conferencia(context, baseURL)
  await context.addInitScript(() => {
    window.__transicoes = 0
    const original = document.startViewTransition?.bind(document)
    if (original) document.startViewTransition = (...a) => { window.__transicoes++; return original(...a) }
  })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const conferida = page.getByRole("button", { name: "Conferida", exact: true })
  await expect(conferida).toHaveCount(4)
  await conferida.first().click()
  await expect(conferida).toHaveCount(3)
  expect(await page.evaluate(() => window.__transicoes)).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

// Feedback de uma peça pelo menu "…": grava o texto com a peça, o código e o pedido.
test("feedback da peça pelo menu grava peça e código", async ({ page, context, baseURL }) => {
  await conferencia(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const primeira = page.getByRole("region", { name: "A conferir" }).getByRole("button", { name: "Mais opções" }).first()
  await primeira.click()
  await page.getByRole(test.info().project.name === "pc" ? "menuitem" : "button", { name: "Feedback", exact: true }).click()
  const janela = page.getByRole("dialog", { name: "Feedback da peça" })
  await expect(janela).toBeVisible()
  await janela.getByRole("textbox", { name: "Feedback da peça" }).fill("Foto bem diferente da peça")
  await janela.getByRole("button", { name: "Enviar feedback" }).click()
  await expect(janela).toBeHidden()
  const fb = await sim.one("select f.texto, f.sku, f.pedido_id, i.sku as sku_item from feedbacks f join pedido_itens i on i.id = f.item_id")
  expect(fb).toMatchObject({ texto: "Foto bem diferente da peça", pedido_id: sim.pedido.id })
  expect(fb.sku).toBe(fb.sku_item)
  expect(sim.bloqueadas).toEqual([])
})

// V67: no seletor de quantidade (− 1 +) cada junção tinha dois traços translúcidos somados (mais claros e
// grossos que o contorno). Cada peça do grupo corta o próprio traço do lado em que a próxima encosta.
test("V67: seletor de quantidade com um traço só em cada junção; venda separa carrinho de peças à mão", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query("update pedido_itens set entrada='carrinho', variante='N°18', sku='TR2456-18' where id=$1", [sim.item.id])
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,entrada)
    values ($1,'avulso','Brinco à mão','BR-9',null,1,30,5,'manual')`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const carrinho = page.getByRole("region", { name: "Do carrinho da cliente" })
  const aMao = page.getByRole("region", { name: "Adicionadas à mão" })
  await expect(carrinho.getByText("TR2456-18")).toBeVisible()
  await expect(aMao.getByText("BR-9")).toBeVisible()
  const grupo = carrinho.getByRole("group").filter({ has: page.getByRole("button", { name: "Diminuir" }) })
  const recortes = await grupo.evaluate((g) => [...g.children].map((c) => getComputedStyle(c).clipPath))
  expect(recortes.slice(0, -1).every((c) => c !== "none")).toBe(true)
  expect(recortes.at(-1)).toBe("none")
  expect(sim.bloqueadas).toEqual([])
})
