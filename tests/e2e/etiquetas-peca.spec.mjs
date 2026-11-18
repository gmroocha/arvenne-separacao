import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Nenhuma impressão de verdade: window.print só registra o que estaria na folha de etiquetas.
async function espiarImpressao(page) {
  await page.addInitScript(() => {
    window.__impressoes = []
    window.print = () => window.__impressoes.push([...document.querySelectorAll("#folha-etiquetas .etiqueta-sku")].map((e) => e.textContent.trim()))
  })
}
const item = (page, nome) => page.getByRole("button", { name: nome, exact: true }).or(page.getByRole("menuitem", { name: nome, exact: true })).first()

// V98: "Imprimir todas" gera uma etiqueta por código e variante (nunca pela quantidade); o menu "…" de cada peça imprime só a dela.
test("V98: imprimir todas é uma etiqueta por código; Imprimir etiqueta no menu da peça imprime só a dela", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" }) // AN-1 com 2 unidades
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem) values
    ($1,'avulso','Brinco','BR-9','PRATA',3,10,2), ($1,'avulso','Brinco','BR-9','PRATA',1,10,3), ($1,'avulso','Brinco','BR-9','DOURADO',4,10,4)`, [sim.pedido.id])
  await espiarImpressao(page)
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  // 4 linhas, 3 combinações (AN-1; BR-9 prata nas duas linhas; BR-9 dourado) = 3 etiquetas, não 11.
  const todas = page.getByRole("button", { name: /^Imprimir todas as etiquetas \(3\)/ })
  await expect(todas).toBeVisible()
  await todas.click()
  await expect.poll(() => page.evaluate(() => window.__impressoes.length)).toBe(1)
  expect(await page.evaluate(() => window.__impressoes[0])).toEqual(["SKU: AN-1", "SKU: BR-9", "SKU: BR-9"])
  // Só a etiqueta da peça AN-1 (2 unidades), pelo menu "…" do cartão.
  await page.getByRole("button", { name: "Mais opções", exact: true }).first().click()
  await item(page, "Imprimir etiqueta").click()
  await expect.poll(() => page.evaluate(() => window.__impressoes.length)).toBe(2)
  expect(await page.evaluate(() => window.__impressoes[1])).toEqual(["SKU: AN-1"])
  expect(sim.bloqueadas).toEqual([])
})

test("V98: Imprimir etiqueta também está no menu da Conferência e das peças em falta", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("select mover_etapa($1,'conferencia')", [sim.pedido.id])
  await espiarImpressao(page)
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("region", { name: "A conferir" }).getByRole("button", { name: "Mais opções", exact: true }).first().click()
  await expect(item(page, "Imprimir etiqueta")).toBeVisible()
  await item(page, "Imprimir etiqueta").click()
  await expect.poll(() => page.evaluate(() => window.__impressoes.length)).toBe(1)
  expect(await page.evaluate(() => window.__impressoes[0])).toEqual(["SKU: AN-1"])
  await sim.banco.query("update pedido_itens set status='falta' where id=$1", [sim.item.id])
  await page.reload()
  await page.getByRole("button", { name: "Resolver", exact: true }).first().click()
  await expect(item(page, "Imprimir etiqueta")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
