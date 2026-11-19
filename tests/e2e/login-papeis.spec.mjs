import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Fase 2: login por nome de usuário, menu e rotas por papel, cada uma vê só os pedidos da etapa dela.
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const abrirMenu = async (page) => {
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
}

test("login por usuário: sem @ entra com o e-mail interno; com @ usa o e-mail como está; erro em português", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "funcionaria", logins: { "ana@equipe.arvenne.invalid": "segredo1", "dono@exemplo.test": "outra-senha" } })
  await sim.instalar(context, baseURL, { logado: false })
  await page.goto("/login")
  await expect(page.getByLabel("Usuário ou e-mail")).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "login-usuario", info)

  await page.getByLabel("Usuário ou e-mail").fill(" Ana ")
  await page.getByLabel("Senha").fill("errada")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByText("Usuário ou senha incorretos")).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel("Senha").fill("segredo1")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Expedição" })).toBeVisible()
  expect(sim.tentativasLogin).toEqual(["ana@equipe.arvenne.invalid", "ana@equipe.arvenne.invalid"])
  expect(sim.bloqueadas).toEqual([])
})

test("login com e-mail (o Gustavo): o e-mail digitado vai como está, sem e-mail interno", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor", logins: { "dono@exemplo.test": "outra-senha" } })
  await sim.instalar(context, baseURL, { logado: false })
  await page.goto("/login")
  await page.getByLabel("Usuário ou e-mail").fill("dono@exemplo.test")
  await page.getByLabel("Senha").fill("outra-senha")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Expedição" })).toBeVisible()
  expect(sim.tentativasLogin).toEqual(["dono@exemplo.test"])
})

test("funcionária: menu só com Expedição, rotas do gestor voltam para a Expedição e só aparece o pedido dela", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "separacao", papel: "funcionaria" })
  // Um pedido de outra pessoa na mesma etapa e um sem responsável: ela não enxerga nenhum dos dois.
  await sim.banco.query("insert into pedidos(origem,status,cliente_nome,pago_em,forma_pagamento,valor_pago) values ('whatsapp','separacao','Cliente da outra',now(),'Pix',50),('whatsapp','separacao','Cliente sem dona',now(),'Pix',50)")
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await expect(page.getByText("Cliente de teste").locator("visible=true").first()).toBeVisible()
  await expect(page.getByText("Cliente da outra")).toHaveCount(0)
  await expect(page.getByText("Cliente sem dona")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Sincronizar com a Shopify" })).toHaveCount(0)
  await expect(page.getByRole("combobox", { name: "Filtrar por pessoa" })).toHaveCount(0)
  await semRolagemLateral(page)
  await capturarTemas(page, "funcionaria-expedicao", info)

  await abrirMenu(page)
  await expect(page.getByRole("link", { name: "Expedição" })).toBeVisible()
  for (const nome of ["Vendas", "Concluídos", "Peças repetidas", "Catálogo", "Clube", "Arquivo", "Time", "Feedbacks"])
    await expect(page.getByRole("link", { name: nome, exact: true })).toHaveCount(0)
  await expect(page.getByText("Funcionária de teste")).toBeVisible()

  await page.goto("/time")
  await expect(page.getByRole("heading", { name: "Expedição" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await page.goto("/vendas")
  await expect(page).toHaveURL(/\/$/)
  // O pedido dela abre; o de outra pessoa não.
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText("Cliente de teste").locator("visible=true").first()).toBeVisible()
  const outra = await sim.one("select id from pedidos where cliente_nome='Cliente da outra'")
  await page.goto(`/pedidos/${outra.id}`)
  await expect(page.getByText("Este pedido não está com você")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("gestor: vê o menu inteiro e todos os pedidos", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "separacao", papel: "gestor" })
  await sim.banco.query("insert into pedidos(origem,status,cliente_nome,pago_em,forma_pagamento,valor_pago) values ('whatsapp','separacao','Cliente sem dona',now(),'Pix',50)")
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await expect(page.getByText("Cliente sem dona").locator("visible=true").first()).toBeVisible()
  await expect(page.getByText("Cliente de teste").locator("visible=true").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Sincronizar com a Shopify" })).toBeVisible()
  await abrirMenu(page)
  for (const nome of ["Vendas", "Expedição", "Concluídos", "Time"]) await expect(page.getByRole("link", { name: nome, exact: true })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
