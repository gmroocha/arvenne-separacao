import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })
const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test("Time: Excluir de verdade tira a pessoa da lista e dos pedidos, depois de confirmar", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  const ana = (await sim.one("insert into equipe(nome,email) values('Ana Paula','ana@arvenne.test') returning id")).id
  await sim.banco.query("insert into equipe(nome) values('Bia')")
  await sim.banco.query("update pedidos set responsaveis=jsonb_build_object('separacao',$2::text) where id=$1", [sim.pedido.id, ana])
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await expect(page.getByText("Ana Paula")).toBeVisible()
  await semRolagemLateral(page)
  await page.getByRole("button", { name: "Excluir", exact: true }).first().click()
  const dialogo = page.getByRole("dialog", { name: /^Excluir / })
  await expect(dialogo).toContainText("Os pedidos e o histórico continuam")
  await dialogo.getByRole("button", { name: "Voltar" }).click()
  expect(Number((await sim.one("select count(*) n from equipe")).n)).toBe(2)
  await page.getByRole("button", { name: "Excluir", exact: true }).first().click()
  await page.getByRole("dialog", { name: /^Excluir / }).getByRole("button", { name: "Excluir", exact: true }).click()
  await expect.poll(async () => Number((await sim.one("select count(*) n from equipe")).n)).toBe(1)
  // Quem tinha sido designada deixa de ser responsável; o pedido continua.
  const restante = (await sim.one("select nome from equipe")).nome
  if (restante === "Bia") expect((await sim.one("select responsaveis from pedidos where id=$1", [sim.pedido.id])).responsaveis).toEqual({})
  expect(Number((await sim.one("select count(*) n from pedidos where id=$1", [sim.pedido.id])).n)).toBe(1)
  expect(sim.bloqueadas).toEqual([])
})

test("celular: campos com 16 px (sem zoom ao tocar) e nenhuma rolagem lateral nas telas novas", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  // Peça em falta com nome e código longos: o cartão novo das faltas não pode alargar a página.
  await sim.banco.query("update pedido_itens set nome=$2, sku=$3, variante='N°16 · pedra verde-água muito comprida', nota='Nota longa '||repeat('palavra ',20) where id=$1", [sim.item.id, "Anel solitário com pedra grande e nome comprido".repeat(3), "AN-SOLITARIO-PEDRA-GRANDE-0001"])
  await sim.banco.query("update pedido_itens set status='falta' where id=$1", [sim.item.id])
  await sim.instalar(context, baseURL)
  const camposPequenos = () => page.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea")]
    .filter((e) => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.getAttribute("aria-label") || e.id || e.placeholder || e.tagName))
  for (const rota of ["/", "/concluidos", "/time", "/vendas", `/pedidos/${sim.pedido.id}`]) {
    await page.goto(rota)
    await page.waitForLoadState("networkidle")
    await semRolagemLateral(page)
    if ((page.viewportSize()?.width ?? 0) < 768) expect(await camposPequenos(), `campos com menos de 16 px em ${rota}`).toEqual([])
  }
  mkdirSync("capturas", { recursive: true })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText("Avise a cliente", { exact: true })).toBeVisible()
  await page.screenshot({ path: `capturas/faltas-${info.project.name}.png`, fullPage: true, animations: "disabled" })
  await page.goto("/time")
  await page.getByRole("button", { name: "Adicionar pessoa" }).click()
  if ((page.viewportSize()?.width ?? 0) < 768) expect(await camposPequenos(), "campos do formulário do Time").toEqual([])
  expect(sim.bloqueadas).toEqual([])
})
