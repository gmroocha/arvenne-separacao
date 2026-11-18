import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

// V109: só o gestor mexe no Time; a funcionária vê a lista, sem nenhum botão de escrita.
test("V109: o gestor vê Adicionar, Editar, Desativar, Excluir e o seletor de Papel", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into equipe(nome,email,papel) values ('Gestora','teste@example.test','gestor'),('Ana Paula','ana@arvenne.test','funcionaria')")
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await expect(page.getByText("Ana Paula")).toBeVisible()
  await expect(page.getByRole("button", { name: "Adicionar pessoa" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Desativar", exact: true })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Excluir", exact: true })).toHaveCount(2)
  await expect(page.getByText("Gestor", { exact: true })).toBeVisible() // o selo de quem é gestora
  await semRolagemLateral(page)
  await capturarTemas(page, "time-gestor", info)
  // Adicionar uma pessoa já como gestor, pelo seletor de Papel.
  await page.getByRole("button", { name: "Adicionar pessoa" }).click()
  await page.getByRole("textbox", { name: "Nome" }).fill("Segunda Gestora")
  await page.getByRole("textbox", { name: /E-mail do login/ }).fill("segunda@arvenne.test")
  await page.getByRole("combobox", { name: "Papel" }).click()
  await capturarTemas(page, "time-papel", info)
  await page.getByRole("option", { name: "Gestor", exact: true }).click()
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select papel from equipe where nome='Segunda Gestora'"))?.papel).toBe("gestor")
  // Promover a Ana pelo Editar.
  await page.getByRole("listitem").filter({ hasText: "Ana Paula" }).getByRole("button", { name: "Editar", exact: true }).click()
  await page.getByRole("combobox", { name: "Papel" }).click()
  await page.getByRole("option", { name: "Gestor", exact: true }).click()
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select papel from equipe where nome='Ana Paula'")).papel).toBe("gestor")
  expect(sim.bloqueadas).toEqual([])
})

test("V109: a funcionária vê a lista do Time só para ler, e o último gestor não sai", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into equipe(nome,email,papel) values ('Gestora','gestora@arvenne.test','gestor'),('Ana Paula','teste@example.test','funcionaria')")
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await expect(page.getByRole("listitem").filter({ hasText: "Gestora" })).toContainText("Gestor")
  await expect(page.getByText("Ana Paula")).toBeVisible()
  await expect(page.getByText(/Só o gestor adiciona/)).toBeVisible()
  for (const nome of ["Adicionar pessoa", "Editar", "Desativar", "Excluir"]) await expect(page.getByRole("button", { name: nome, exact: true })).toHaveCount(0)
  await semRolagemLateral(page)
  await capturarTemas(page, "time-funcionaria", info)
  // O resto do app continua inteiro para ela.
  await page.goto("/concluidos")
  await expect(page.getByRole("tab", { name: /A caminho/ })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V109: o banco recusa tirar o último gestor pela tela (mensagem clara)", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into equipe(nome,email,papel) values ('Gestora','teste@example.test','gestor')")
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await page.getByRole("button", { name: "Desativar", exact: true }).click()
  await expect(page.getByText(/pelo menos um gestor/).first()).toBeVisible()
  expect((await sim.one("select ativo from equipe where nome='Gestora'")).ativo).toBe(true)
  expect(sim.bloqueadas).toEqual([])
})
