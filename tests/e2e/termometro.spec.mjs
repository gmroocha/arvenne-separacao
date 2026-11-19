import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const celular = (page) => (page.viewportSize()?.width ?? 0) < 1024
const CLIENTE = "Cliente de teste"

// Cartão do pedido na Expedição (o da coluna/lista visível).
// O cartão é o pai do link (o MenuContexto troca o data-slot do Card por "context-menu-trigger").
const cartao = (page) => page.getByRole("link").filter({ hasText: CLIENTE }).locator("xpath=..").first()
// O contorno de 1,5 px do termômetro é um anel (box-shadow) de 1,5 px; o cartão comum tem anel de 1 px.
const contorno = (page) => cartao(page).evaluate((el) => getComputedStyle(el).boxShadow)
const antigo = (dias) => sim.banco.query("update pedidos set status_desde = now() - make_interval(days => $2) where id=$1", [sim.pedido.id, dias])

// Celular: toca na etapa da faixa; PC: o quadro mostra todas as colunas (a coluna alvo é levada à vista).
async function irParaEtapa(page, nome) {
  if (celular(page)) await page.getByRole("list", { name: "Esteira" }).getByRole("button", { name: new RegExp(nome) }).click()
  else await page.getByRole("region", { name: nome, exact: true }).scrollIntoViewIfNeeded()
}

test("Fila: sem contorno colorido e sem ponto, só o texto 'Na fila há'", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await irParaEtapa(page, "Fila")
  await expect(cartao(page)).toBeVisible()
  await expect(cartao(page)).toContainText("Na fila há")
  await expect(cartao(page).locator("[data-termometro]")).toHaveCount(0)
  expect(await contorno(page)).not.toContain("1.5px")
  // Mesmo uma fila de 90 dias continua sem cor.
  await antigo(90)
  await page.reload()
  await irParaEtapa(page, "Fila")
  await expect(cartao(page)).toContainText(/Na fila há \d+ d/)
  await expect(cartao(page).locator("[data-termometro]")).toHaveCount(0)
  expect(await contorno(page)).not.toContain("1.5px")
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-fila", info)
  expect(sim.bloqueadas).toEqual([])
})

test("Separação: verde sem contorno (só o pontinho) e vermelho com contorno", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  await sim.banco.query("update pedidos set status='separacao', status_desde=now() where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await irParaEtapa(page, "Separação")
  const chip = cartao(page).locator("[data-termometro]")
  await expect(chip).toHaveAttribute("data-termometro", "verde")
  await expect(chip.locator("span.bg-success")).toHaveCount(1) // o pontinho verde fica
  expect(await contorno(page)).not.toContain("1.5px") // mas o cartão não ganha contorno
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-separacao-verde", info)

  await antigo(90)
  await page.reload()
  await irParaEtapa(page, "Separação")
  await expect(cartao(page).locator("[data-termometro]")).toHaveAttribute("data-termometro", "vermelho")
  expect(await contorno(page)).toContain("1.5px")
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-separacao-vermelho", info)
  expect(sim.bloqueadas).toEqual([])
})

test("Avisar cliente tem termômetro; Aguardando cliente não", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ troca: true, papel: "gestor" })
  // O desvio nasce em Aguardando cliente; aqui só trocamos o status (sem gatilhos) para as duas etapas do desvio.
  const para = async (status, dias) => {
    await sim.banco.exec("set session_replication_role = replica")
    await sim.banco.query("update pedidos set status=$2, status_desde = now() - make_interval(days => $3) where id=$1", [sim.pedido.id, status, dias])
    await sim.banco.exec("set session_replication_role = origin")
  }
  await para("avisar_cliente", 90)
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await irParaEtapa(page, "Avisar cliente")
  await expect(cartao(page).locator("[data-termometro]")).toHaveAttribute("data-termometro", "vermelho")
  expect(await contorno(page)).toContain("1.5px")
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-avisar-cliente", info)

  await para("aguardando_cliente", 90)
  await page.reload()
  await irParaEtapa(page, "Aguardando cliente")
  await expect(cartao(page)).toContainText("Nesta etapa há")
  await expect(cartao(page).locator("[data-termometro]")).toHaveCount(0)
  expect(await contorno(page)).not.toContain("1.5px")
  expect(sim.bloqueadas).toEqual([])
})

test("Expedição: atalho 'Metas' leva ao Time, na seção de metas", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await page.getByRole("link", { name: "Metas de tempo por etapa" }).click()
  await expect(page).toHaveURL(/\/time#metas$/)
  const secao = page.locator("section#metas")
  await expect(secao.getByRole("heading", { name: "Metas de tempo por etapa" })).toBeVisible()
  await expect(secao.getByRole("textbox", { name: "Avisar cliente (horas)" })).toHaveValue("2")
  await expect(secao.getByRole("textbox")).toHaveCount(8)
  await expect(secao.getByRole("textbox", { name: /^Fila/ })).toHaveCount(0)
  await expect(secao).toBeInViewport() // a página rolou até a seção
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-metas-atalho", info)
  expect(sim.bloqueadas).toEqual([])
})

test("Expedição: o atalho 'Metas' só aparece para gestor", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "separacao", papel: "funcionaria" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await expect(cartao(page)).toBeVisible() // a página já carregou como funcionária
  await expect(page.getByRole("link", { name: "Metas de tempo por etapa" })).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})
