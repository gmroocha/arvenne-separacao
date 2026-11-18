import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

// Papéis suspensos (18/11/2026): todo mundo faz tudo no Time, sem seletor nem selo de Papel.
test("papéis suspensos: funcionária vê e usa Adicionar, Editar, Desativar e Excluir", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into equipe(nome,email,papel) values ('Gestora','gestora@arvenne.test','gestor'),('Ana Paula','teste@example.test','funcionaria')")
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await expect(page.getByText("Ana Paula")).toBeVisible()
  await expect(page.getByRole("button", { name: "Adicionar pessoa" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Desativar", exact: true })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Excluir", exact: true })).toHaveCount(2)
  await expect(page.getByText("Gestor", { exact: true })).toHaveCount(0)
  await semRolagemLateral(page)
  await capturarTemas(page, "time-todos", info)

  await page.getByRole("button", { name: "Adicionar pessoa" }).click()
  await expect(page.getByRole("combobox", { name: "Papel" })).toHaveCount(0)
  await page.getByRole("textbox", { name: "Nome" }).fill("Nova Pessoa")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select nome from equipe where nome='Nova Pessoa'"))?.nome).toBe("Nova Pessoa")

  // A única gestora pode ser desativada (sem o bloqueio de "último gestor").
  await page.getByRole("listitem").filter({ hasText: "Gestora" }).getByRole("button", { name: "Desativar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select ativo from equipe where nome='Gestora'")).ativo).toBe(false)
  expect(sim.bloqueadas).toEqual([])
})
