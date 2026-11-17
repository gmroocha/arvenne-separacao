import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Busca de peça nas etapas: filtra os cartões e as peças já feitas pelo código, nome, variante ou nota.
test("busca de peça na separação filtra a fazer e as encontradas", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,status) values
    ($1,'avulso','PULSEIRA PONTO DE LUZ','PU017-Z','ZIRCÔNIA',1,10,2,'pendente'),
    ($1,'avulso','PULSEIRA PONTO DE LUZ','PU017-E','ESMERALDA',1,10,3,'encontrado'),
    ($1,'avulso','COLAR GOTA','COL-GDC-1',null,1,10,4,'encontrado')`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const busca = page.getByRole("textbox", { name: "Buscar peça: código, nome ou variante" })
  await busca.fill("pulseira")
  await expect(page.getByText("PU017-Z", { exact: true })).toBeVisible()
  await expect(page.getByText("PU017-E", { exact: true })).toBeVisible()
  await expect(page.getByText("AN-1", { exact: true })).toHaveCount(0)
  await expect(page.getByText("COL-GDC-1", { exact: true })).toHaveCount(0)
  await busca.fill("zirconia")
  await expect(page.getByText("PU017-Z", { exact: true })).toBeVisible()
  await expect(page.getByText("PU017-E", { exact: true })).toHaveCount(0)
  await busca.fill("xyz")
  await expect(page.getByText("Nenhuma peça com “xyz” neste pedido.")).toBeVisible()
  await busca.fill("")
  await expect(page.getByText("AN-1", { exact: true })).toBeVisible()
  // A busca só esconde: o progresso continua contando o pedido inteiro.
  await expect(page.getByText("2 de 4 peças")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
