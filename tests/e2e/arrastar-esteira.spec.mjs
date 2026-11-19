import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const rolagem = (loc) => loc.evaluate((e) => e.scrollLeft)

// V94: a esteira da Expedição rola arrastando com o mouse (clique segurado), sem engolir o clique comum e sem
// atrapalhar o arrastar dos cartões (que muda o pedido de etapa).
test("V94: PC — arrastar o fundo do quadro rola a esteira; clique no cartão abre o pedido", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "pc", "quadro de colunas só no PC")
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  const viewport = page.locator("[data-slot=scroll-area-viewport]").first()
  const coluna = page.getByRole("region", { name: "Separação" })
  await expect(coluna).toBeVisible()
  expect(await viewport.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeGreaterThan(200)
  const caixa = await coluna.locator("header").boundingBox() // cabeçalho da coluna: não é um cartão arrastável
  const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 120, y, { steps: 6 })
  await page.mouse.move(x - 320, y, { steps: 6 })
  await page.mouse.up()
  expect(await rolagem(viewport)).toBeGreaterThan(250)
  // Arrastar de volta para a direita.
  const antes = await rolagem(viewport)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 200, y, { steps: 6 })
  await page.mouse.up()
  expect(await rolagem(viewport)).toBeLessThan(antes - 100)
  // Um clique comum (sem arrastar) no cartão continua abrindo o pedido.
  await viewport.evaluate((e) => { e.scrollLeft = 0 })
  await page.getByRole("link", { name: /Cliente de teste/ }).click()
  await expect(page).toHaveURL(new RegExp(`/pedidos/${sim.pedido.id}$`))
  expect(sim.bloqueadas).toEqual([])
})

test("V94: faixa da esteira no celular/estreito — arrastar com o mouse rola e não escolhe a etapa por engano", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "celular", "faixa de ícones só abaixo de 1024 px")
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  const faixa = page.getByRole("list", { name: "Esteira" }).locator("xpath=..")
  await expect(faixa).toBeVisible()
  expect(await faixa.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeGreaterThan(100)
  const url = page.url()
  const botao = page.getByRole("button", { name: /Embalagem e frete/ }).first()
  const b = await faixa.getByRole("button").nth(1).boundingBox()
  const marcado = await page.getByRole("button", { pressed: true }).first().textContent()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x - 60, b.y + b.height / 2, { steps: 6 })
  await page.mouse.move(b.x - 160, b.y + b.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await rolagem(faixa)).toBeGreaterThan(80)
  expect(page.url()).toBe(url) // o clique que fecha o arrasto foi descartado: a etapa escolhida não mudou
  expect(await page.getByRole("button", { pressed: true }).first().textContent()).toBe(marcado)
  // Clique comum continua escolhendo a etapa.
  await botao.scrollIntoViewIfNeeded()
  await botao.click()
  await expect(botao).toHaveAttribute("aria-pressed", "true")
  expect(sim.bloqueadas).toEqual([])
})
