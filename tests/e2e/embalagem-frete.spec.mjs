import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas, continuarAviso } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const CHAVE = "35240112345678000190550010000001231000001230"
const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const DADOS_FRETE = "entrega_cep='01001000',entrega_logradouro='Rua A',entrega_numero='1',entrega_bairro='Centro',entrega_cidade='São Paulo',entrega_uf='SP',cliente_cpf='12345678909'"
const status = async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status

// Chave de acesso da nota: cola na Nota fiscal (com espaços e pontos), aparece em grupos de 4, avisa se não tem 44 números e é
// copiada (só com os números) no bloco Frete e no "Copiar tudo".
test("chave da nota: salvar na Nota fiscal e copiar na Embalagem e frete", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`update pedidos set ${DADOS_FRETE} where id=$1`, [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'faturamento')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const campo = page.getByRole("textbox", { name: /Chave de acesso/ })
  await expect(campo).toBeVisible()

  // Com menos de 44 números: avisa e não grava.
  await campo.fill(CHAVE.slice(0, 40))
  await campo.press("Enter")
  await expect(page.getByText("Faltam 4 números: a chave tem 44 (você tem 40).")).toBeVisible()
  expect((await sim.one("select nf_chave from pedidos where id=$1", [sim.pedido.id])).nf_chave).toBeNull()

  // Colada com espaços e pontos: guarda só os dígitos e mostra em grupos de 4.
  await campo.fill("3524.0112.3456 7800 0190 5500 1000 0001 2310 0000 1230")
  await campo.press("Enter")
  await expect.poll(async () => (await sim.one("select nf_chave from pedidos where id=$1", [sim.pedido.id])).nf_chave).toBe(CHAVE)
  await expect(campo).toHaveValue("3524 0112 3456 7800 0190 5500 1000 0001 2310 0000 1230")
  await expect(page.getByText(/Faltam|Sobram/)).toHaveCount(0)
  await semRolagemLateral(page)
  await campo.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await capturarTemas(page, "nota-chave", info)

  // Na Embalagem e frete, o bloco Frete mostra a chave e copia só os números.
  await sim.banco.query("select mover_etapa($1,'embalagem')", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText("Chave da nota", { exact: true })).toBeVisible()
  await page.getByText("Chave da nota", { exact: true }).evaluate((el) => el.scrollIntoView({ block: "center" }))
  await capturarTemas(page, "frete-chave", info)
  await page.getByRole("button", { name: "Copiar Chave da nota" }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CHAVE)
  await page.getByRole("button", { name: "Copiar tudo" }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Chave da nota: ${CHAVE}`)
  // Sem chave, a linha nem aparece (é opcional).
  await sim.banco.query("update pedidos set nf_chave=null where id=$1", [sim.pedido.id])
  await page.reload()
  await expect(page.getByText("Embalagem", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Chave da nota", { exact: true })).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})

// Embalagem e frete: dois botões ("Embalado" e "Frete gerado"), em qualquer ordem; só a Postagem exige os dois.
test("Embalagem e frete: Frete gerado antes do Embalado; o pedido só avança com os dois", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`update pedidos set ${DADOS_FRETE} where id=$1`, [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'embalagem')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Embalado", exact: true })).toBeDisabled() // falta marcar o checklist
  await expect(page.getByRole("button", { name: "Frete gerado", exact: true })).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "embalagem-frete", info, { fullPage: true })

  await page.getByRole("button", { name: "Frete gerado", exact: true }).click()
  await expect.poll(async () => (await sim.one("select frete_gerado_em from pedidos where id=$1", [sim.pedido.id])).frete_gerado_em).not.toBeNull()
  expect(await status()).toBe("embalagem")

  for (const item of ["Caixa do tamanho certo", "Nota impressa dentro", "Caixa fechada"]) await page.getByRole("checkbox", { name: item }).click()
  await page.getByRole("button", { name: "Embalado", exact: true }).click()
  await expect.poll(status).toBe("pronto_envio")
  await continuarAviso(page, "Embalagem e frete", "Postagem")
  expect(sim.bloqueadas).toEqual([])
})

// Termômetro: o cartão da Expedição mostra o tempo na etapa em todas as etapas, com a cor que o banco calculou.
test("termômetro: cartão com a cor do banco e o tempo na etapa, em etapa que não é a Separação", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("select mover_etapa($1,'bipagem')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto("/?etapa=bipagem")
  const chip = page.locator("[data-termometro]:visible").first()
  await expect(chip).toHaveAttribute("data-termometro", "verde")
  await expect(chip).toContainText("Nesta etapa há")
  await chip.scrollIntoViewIfNeeded() // PC: a coluna da Bipagem fica à direita da faixa visível
  await semRolagemLateral(page)
  await capturarTemas(page, "termometro-verde", info)

  await sim.banco.query("update pedidos set status_desde = now() - interval '90 days' where id=$1", [sim.pedido.id])
  await page.reload()
  await expect(page.locator("[data-termometro]:visible").first()).toHaveAttribute("data-termometro", "vermelho")
  await expect(page.locator("[data-termometro]:visible").first()).toContainText(/Nesta etapa há \d+ d/)
  await page.locator("[data-termometro]:visible").first().scrollIntoViewIfNeeded()
  await capturarTemas(page, "termometro-vermelho", info)
  await semRolagemLateral(page)
  expect(sim.bloqueadas).toEqual([])
})

// Time: metas de tempo por etapa (horas úteis), uma por etapa, salvas ao sair do campo.
test("Time: metas de tempo por etapa", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/time")
  await expect(page.getByRole("heading", { name: "Metas de tempo por etapa" })).toBeVisible()
  const sep = page.getByRole("textbox", { name: "Separação (horas)" })
  await expect(sep).toHaveValue("2")
  await expect(page.getByRole("textbox", { name: "Embalagem e frete (horas)" })).toHaveValue("2")
  await expect(page.getByRole("textbox", { name: "Postagem (horas)" })).toHaveValue("4")
  // "Avisar cliente" tem meta própria (2 h) e vem logo depois da Separação; a Fila não tem meta.
  await expect(page.getByRole("textbox", { name: "Avisar cliente (horas)" })).toHaveValue("2")
  const rotulos = await page.locator("section#metas label").allTextContents()
  expect(rotulos.slice(0, 2)).toEqual(["Separação (horas)", "Avisar cliente (horas)"])
  await semRolagemLateral(page)
  await capturarTemas(page, "time-metas", info, { fullPage: true })
  await sep.fill("3,5")
  await sep.press("Enter")
  await expect.poll(async () => Number((await sim.one("select meta_horas_uteis from metas_etapa where etapa='separacao'")).meta_horas_uteis)).toBe(3.5)
  // Valor inválido não grava e avisa.
  await sep.fill("0")
  await sep.press("Enter")
  await expect(page.getByText("Digite as horas da meta")).toBeVisible()
  expect(Number((await sim.one("select meta_horas_uteis from metas_etapa where etapa='separacao'")).meta_horas_uteis)).toBe(3.5)
  // A meta de "Avisar cliente" também se edita.
  const avisar = page.getByRole("textbox", { name: "Avisar cliente (horas)" })
  await avisar.fill("1,5")
  await avisar.press("Enter")
  await expect.poll(async () => Number((await sim.one("select meta_horas_uteis from metas_etapa where etapa='avisar_cliente'")).meta_horas_uteis)).toBe(1.5)
  expect(sim.bloqueadas).toEqual([])
})
