import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// V69: peça tirada enquanto a venda era montada aparecia em "Removidas" na separação, com "Restaurar".
test("V69: separação não lista peça removida durante a montagem da venda", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem,status,observacao) values
    ($1,'avulso','Brinco da montagem','BR-VENDA',1,30,2,'removido','removida na venda'),
    ($1,'avulso','Colar desistido','CO-DESISTE',1,40,3,'removido','cliente desistiu')`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const removidas = page.getByRole("button", { name: "Removidas (1)" })
  await expect(removidas).toBeVisible()
  await removidas.click()
  await expect(page.getByText("CO-DESISTE")).toBeVisible()
  await expect(page.getByText("BR-VENDA")).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})

test("venda: clique direito duplica e exclui", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.instalar(context, baseURL)
  await page.goto("/vendas")
  const linha = page.getByRole("link", { name: /W0001/ })
  await linha.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Duplicar venda" }).click()
  await expect(page).toHaveURL(/\/vendas\/(?!.*W0001)[0-9a-f-]{36}$/)
  const copia = await sim.one("select id, numero, status from pedidos where id <> $1 and origem = 'whatsapp'", [sim.pedido.id])
  expect(copia.status).toBe("em_aberto")
  expect(page.url()).toContain(copia.id)
  expect((await sim.one("select count(*)::int n from pedido_itens where pedido_id = $1", [copia.id])).n).toBe(1)

  await page.goto("/vendas")
  await page.getByRole("link", { name: new RegExp(copia.numero) }).click({ button: "right" })
  await page.getByRole("menuitem", { name: "Excluir venda" }).click()
  const dialogo = page.getByRole("dialog", { name: `Excluir a venda #${copia.numero}?` })
  await dialogo.getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByRole("link", { name: new RegExp(copia.numero) })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /W0001/ })).toBeVisible()
  // Nada apagado: só marcado.
  expect((await sim.one("select excluido_em from pedidos where id = $1", [copia.id])).excluido_em).not.toBeNull()
  expect(sim.bloqueadas).toEqual([])
})

test("arquivo: clique direito exclui pedido cancelado", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedidos set status = 'cancelado' where id = $1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto("/arquivo")
  const linha = page.getByRole("link", { name: /W0001/ })
  await linha.click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "Marcar como perdida" })).toHaveCount(0)
  await page.getByRole("menuitem", { name: "Excluir pedido" }).click()
  await page.getByRole("dialog", { name: "Excluir o pedido #W0001?" }).getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByText("Nenhum pedido encontrado")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
