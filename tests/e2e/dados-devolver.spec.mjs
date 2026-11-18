import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Dados do pedido: "Pago após acertos" confundia. Agora é "Pago pela cliente" e, se peças saíram depois do pagamento,
// aparece "A devolver à cliente" com o valor do banco (v_pedidos.a_devolver) e o porquê.
test("dados do pedido: pago pela cliente e a devolver quando peça sai depois do pagamento", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status,ordem) values ($1,'avulso','Colar','CO-9',1,30,'pendente',5)", [sim.pedido.id])
  await sim.banco.query("update pedidos set valor_pago=130 where id=$1", [sim.pedido.id])
  await sim.banco.query("update pedido_itens set status='removido', observacao='cliente desistiu' where pedido_id=$1 and sku='CO-9'", [sim.pedido.id])
  const { a_devolver, total_pago } = await sim.one("select a_devolver, total_pago from v_pedidos where id=$1", [sim.pedido.id])
  expect(Number(a_devolver)).toBeGreaterThan(0)
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  // Na separação os valores ficam em "Ver dados do pedido" (o caso do W0023, que levou à mudança).
  await page.getByRole("button", { name: "Mais ações", exact: true }).click()
  await page.getByText("Ver dados do pedido", { exact: true }).click()
  const dados = page.getByText("Cliente e valores").locator("xpath=ancestor::*[@data-slot='card'][1]")
  await expect(dados.getByText("Pago após acertos")).toHaveCount(0)
  await expect(dados.getByText("Pago pela cliente")).toBeVisible()
  await expect(dados.getByText("A devolver à cliente")).toBeVisible()
  const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n)).replace("$", "\\$").replace(/\s/g, "\\s*")
  await expect(dados).toContainText(new RegExp(brl(a_devolver)))
  await expect(dados).toContainText(new RegExp(brl(total_pago)))
  await dados.screenshot({ path: `capturas/dados-devolver-${test.info().project.name}.png`, animations: "disabled" })
  expect(sim.bloqueadas).toEqual([])
})
