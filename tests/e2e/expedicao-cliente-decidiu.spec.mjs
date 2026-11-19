import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const CLIENTE = "Cliente de teste"
const celular = (page) => (page.viewportSize()?.width ?? 0) < 1024

// Celular: toca no ícone da etapa na faixa e devolve a lista; PC: devolve a coluna do quadro.
async function coluna(page, nome) {
  if (celular(page)) {
    await page.getByRole("list", { name: "Esteira" }).getByRole("button", { name: new RegExp(nome) }).click()
    return page.locator("main")
  }
  return page.getByRole("region", { name: nome, exact: true })
}

const cartao = (onde) => onde.getByRole("link").filter({ hasText: CLIENTE })

// A cliente escolhe pela página pública da troca (anon) e a equipe conclui a peça pelo app (authenticated).
async function clienteEscolhe() {
  await sim.ocioso()
  await sim.banco.exec("begin; set local role anon")
  await sim.banco.query("select troca_escolher($1, $2, 'credito', null)", [sim.troca.token, sim.item.id])
  await sim.banco.exec("commit")
}
async function equipeConclui() {
  await sim.ocioso()
  await sim.banco.exec(`begin; select set_config('request.jwt.claims','{"email":"teste@example.test","role":"service_role"}',true); set local role authenticated`)
  const peca = (await sim.banco.query("select id from troca_pecas where troca_id = $1", [sim.troca.id])).rows[0]
  await sim.banco.query("select troca_concluir_peca($1, $2, 'credito', null, 'credito')", [sim.troca.id, peca.id])
  await sim.banco.exec("commit")
}

test("Cliente decidiu: o pedido sai de Aguardando e vai para a coluna nova até a equipe concluir a troca", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ troca: true })
  await sim.instalar(context, baseURL)
  await page.goto("/")

  // Ainda sem escolha: o pedido está em Aguardando cliente e a coluna nova está vazia.
  await expect(cartao(await coluna(page, "Aguardando cliente"))).toHaveCount(1)
  await expect(cartao(await coluna(page, "Cliente decidiu"))).toHaveCount(0)
  await expect(page.getByText(/Decidiu \d+ de \d+/).locator("visible=true")).toHaveCount(0)

  // A cliente escolhe na página da troca, sem a equipe concluir nada.
  await clienteEscolhe()
  await page.reload()
  const decidiu = await coluna(page, "Cliente decidiu")
  await expect(cartao(decidiu)).toHaveCount(1)
  await expect(decidiu.getByText("Decidiu 1 de 1").locator("visible=true")).toBeVisible()
  await expect(cartao(await coluna(page, "Aguardando cliente"))).toHaveCount(0)
  await expect(cartao(await coluna(page, "Avisar cliente"))).toHaveCount(0)
  if (!celular(page)) {
    await expect(page.getByRole("region", { name: "Cliente decidiu", exact: true }).getByText("1", { exact: true })).toBeVisible()
    await page.getByRole("region", { name: "Cliente decidiu", exact: true }).scrollIntoViewIfNeeded() // fica à direita da faixa visível
    await capturarTemas(page, "expedicao-cliente-decidiu", info)
  } else {
    await coluna(page, "Cliente decidiu") // a última etapa aberta no teste foi a de Avisar cliente
    await capturarTemas(page, "expedicao-cliente-decidiu", info)
  }

  // A equipe conclui a troca: o desvio termina e o cartão sai da coluna nova.
  await equipeConclui()
  await page.reload()
  await expect(cartao(await coluna(page, "Cliente decidiu"))).toHaveCount(0)
  await expect(page.getByText(/Decidiu \d+ de \d+/).locator("visible=true")).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})

test("Cliente decidiu: não aceita soltar cartão (PC)", async ({ page, context, baseURL }) => {
  test.skip(celular(page), "arrastar só existe no quadro do PC")
  sim = await criarSimulacao({ troca: true })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  const aguardando = page.getByRole("region", { name: "Aguardando cliente", exact: true })
  await expect(cartao(aguardando)).toHaveCount(1)
  // Arrastar e soltar de verdade (eventos de arrasto com o mesmo DataTransfer).
  const dt = await page.evaluateHandle(() => new DataTransfer())
  const origem = cartao(aguardando).locator('xpath=ancestor::div[@draggable="true"]')
  const destino = page.getByRole("region", { name: "Cliente decidiu", exact: true })
  await origem.dispatchEvent("dragstart", { dataTransfer: dt })
  await destino.dispatchEvent("dragover", { dataTransfer: dt })
  await destino.dispatchEvent("drop", { dataTransfer: dt })
  await expect(page.getByText("Arraste para a próxima etapa")).toBeVisible()
  await expect(cartao(aguardando)).toHaveCount(1)
  const { status } = await sim.one("select status from pedidos where id = $1", [sim.pedido.id])
  expect(status).toBe("aguardando_cliente")
})
