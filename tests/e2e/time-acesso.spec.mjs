import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Fase 2: o gestor cria o acesso por usuário, troca a senha, escolhe o papel e define quem cuida de cada etapa.
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test("Time (gestor): Criar acesso, Trocar senha, Papel e Quem cuida de cada etapa", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "separacao", papel: "gestor" })
  await sim.banco.query("insert into equipe(nome,papel,usuario,user_id) values ('Ana Paula','funcionaria','ana',gen_random_uuid())")
  await sim.banco.query("insert into equipe(nome,papel) values ('Bia','funcionaria')")
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  const bia = page.getByRole("listitem").filter({ hasText: "Bia" })
  const ana = page.getByRole("listitem").filter({ hasText: "Ana Paula" })
  await expect(ana.getByText("Usuário: ana")).toBeVisible()
  await expect(ana.getByRole("button", { name: "Trocar senha" })).toBeVisible()
  await expect(bia.getByRole("button", { name: "Criar acesso" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Quem cuida de cada etapa" })).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "time-acesso", info, { fullPage: true })

  // Criar acesso: sugere o usuário pelo nome; senha curta é recusada na tela; depois, a função Edge recebe o pedido.
  await bia.getByRole("button", { name: "Criar acesso" }).click()
  const dialogo = page.getByRole("dialog", { name: "Criar acesso para Bia" })
  await expect(dialogo.getByLabel("Usuário")).toHaveValue("bia")
  await dialogo.getByLabel("Senha").fill("123")
  await dialogo.getByRole("button", { name: "Criar acesso" }).click()
  await expect(page.getByText("A senha precisa ter pelo menos 6 caracteres")).toBeVisible()
  expect(sim.chamadasAcesso).toEqual([])
  await semRolagemLateral(page)
  await capturarTemas(page, "time-criar-acesso", info)
  await dialogo.getByLabel("Senha").fill("segredo1")
  await dialogo.getByRole("button", { name: "Criar acesso" }).click()
  await expect.poll(() => sim.chamadasAcesso.length).toBe(1)
  expect(sim.chamadasAcesso[0]).toMatchObject({ acao: "criar", usuario: "bia", senha: "segredo1" })
  await expect(bia.getByRole("button", { name: "Trocar senha" })).toBeVisible()

  // Trocar senha.
  await ana.getByRole("button", { name: "Trocar senha" }).click()
  const troca = page.getByRole("dialog", { name: "Trocar senha de Ana Paula" })
  await troca.getByLabel("Senha nova").fill("nova-senha")
  await troca.getByRole("button", { name: "Trocar senha" }).click()
  await expect.poll(() => sim.chamadasAcesso.length).toBe(2)
  expect(sim.chamadasAcesso[1]).toMatchObject({ acao: "trocar_senha", senha: "nova-senha" })

  // Desativar quem tem acesso bloqueia o login; reativar desbloqueia.
  await ana.getByRole("button", { name: "Desativar", exact: true }).click()
  await expect.poll(() => sim.chamadasAcesso.map((c) => c.acao)).toContain("bloquear")
  await ana.getByRole("button", { name: "Reativar", exact: true }).click()
  await expect.poll(() => sim.chamadasAcesso.map((c) => c.acao)).toContain("desbloquear")

  // Papel: o gestor escolhe ao editar.
  await bia.getByRole("button", { name: "Editar" }).click()
  await page.getByRole("combobox", { name: "Papel" }).click()
  await page.getByRole("option", { name: "Gestor" }).click()
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select papel from equipe where nome='Bia'")).papel).toBe("gestor")

  // Responsável padrão por etapa.
  await page.getByRole("combobox", { name: "Conferência" }).click()
  await page.getByRole("option", { name: "Ana Paula" }).click()
  await expect.poll(async () => (await sim.one("select m.nome from responsavel_padrao r join equipe m on m.id=r.membro_id where r.etapa='conferencia'"))?.nome).toBe("Ana Paula")
  expect(sim.bloqueadas).toEqual([])
})
