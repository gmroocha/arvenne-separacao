import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function montar(context, baseURL, pecas = 4) {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||lpad(n::text,2,'0'),1,10,n from generate_series(1,${pecas}) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
}
const status = async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status

// V95: barra inferior das etapas. As setas só trocam a etapa que aparece (nunca o status), "Concluir etapa" confirma e usa
// mover_etapa, e todo avanço mostra "Etapa X concluída → agora Y".
test("V95: a barra fica presa no rodapé e as setas só navegam, sem mudar o status", async ({ page, context, baseURL }, info) => {
  await montar(context, baseURL, 12)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const barra = page.getByRole("button", { name: "Concluir etapa", exact: true })
  await expect(barra).toBeVisible()
  const anterior = page.getByRole("button", { name: "Etapa anterior", exact: true })
  const proxima = page.getByRole("button", { name: "Próxima etapa: Conferência", exact: true })
  await expect(anterior).toBeDisabled()
  // Preso no rodapé mesmo com a lista comprida (sem rolar a página).
  const altura = page.viewportSize().height
  const caixa = await barra.boundingBox()
  expect(caixa.y + caixa.height).toBeGreaterThan(altura - 70)
  expect(caixa.y + caixa.height).toBeLessThanOrEqual(altura)
  await capturarTemas(page, "barra-etapa", info)
  await proxima.click()
  await expect(page.getByRole("button", { name: "Próxima etapa: Bipagem", exact: true })).toBeEnabled() // a tela agora está na Conferência
  await expect(page.getByRole("button", { name: "Etapa anterior: Separação", exact: true })).toBeEnabled()
  expect(await status()).toBe("novo")
  // Conferência → Bipagem: etapas de peça abrem sempre; Bipagem → Nota fiscal pede aviso (documento à frente).
  await page.getByRole("button", { name: "Próxima etapa: Bipagem", exact: true }).click()
  await page.getByRole("button", { name: "Próxima etapa: Nota fiscal", exact: true }).click()
  const bloqueio = page.getByRole("dialog", { name: "Etapa ainda não liberada" })
  await expect(bloqueio).toContainText("conclua antes: Separação, Conferência e Bipagem")
  await bloqueio.getByRole("button", { name: "Ok", exact: true }).click()
  await page.getByRole("button", { name: "Etapa anterior: Conferência", exact: true }).click()
  await page.getByRole("button", { name: "Etapa anterior: Separação", exact: true }).click()
  await expect(page.getByRole("button", { name: "Etapa anterior", exact: true })).toBeDisabled() // de volta à Separação
  expect(await status()).toBe("novo")
  expect(sim.bloqueadas).toEqual([])
})

test("V95: Concluir etapa confirma, marca o que falta, avança e mostra 'Etapa Separação concluída'", async ({ page, context, baseURL }, info) => {
  await montar(context, baseURL, 3)
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1 and sku='PC-01'", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  const confirmar = page.getByRole("dialog", { name: "Concluir Separação?" })
  await capturarTemas(page, "barra-etapa-confirmar", info)
  await expect(confirmar).toContainText("3 peças ainda não foram achadas") // AN-1 e PC-02 e PC-03 (PC-01 já foi achada)
  await expect(confirmar).toContainText("o pedido vai para Conferência")
  await confirmar.getByRole("button", { name: "Voltar", exact: true }).click()
  expect(await status()).toBe("separacao") // voltar não muda nada
  await page.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  await confirmar.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  const aviso = page.getByRole("dialog", { name: "Etapa Separação concluída" })
  await expect(aviso).toContainText("agora Conferência")
  await capturarTemas(page, "etapa-concluida", info)
  expect(await status()).toBe("conferencia")
  expect(Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and status='encontrado'", [sim.pedido.id])).n)).toBe(4)
  await aviso.getByRole("button", { name: "Continuar", exact: true }).click()
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(4)
  expect(sim.bloqueadas).toEqual([])
})

test("V95: o banco recusa (troca em andamento) e a mensagem aparece dentro do diálogo, que continua aberto", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, 2)
  await sim.banco.query("insert into trocas(pedido_id,status) values ($1,'rascunho')", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  const confirmar = page.getByRole("dialog", { name: "Concluir Separação?" })
  await confirmar.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  await expect(confirmar.getByRole("alert")).toContainText("troca em andamento")
  await expect(confirmar).toBeVisible()
  expect(await status()).toBe("novo")
})

test("V95: o aviso 'Etapa X concluída' também aparece quando a última peça avança o pedido sozinha", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, 1)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(2)
  await page.getByRole("button", { name: "Achei", exact: true }).evaluateAll((bs) => bs.forEach((x) => x.click()))
  const aviso = page.getByRole("dialog", { name: "Etapa Separação concluída" })
  await expect(aviso).toContainText("agora Conferência")
  await aviso.getByRole("button", { name: "Continuar", exact: true }).click()
  await expect(aviso).toBeHidden()
  expect(await status()).toBe("conferencia")
})
