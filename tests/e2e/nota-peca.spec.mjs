import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Nota da peça pelo menu "…" na separação: aparece no cartão e segue para as próximas etapas.
test("nota da peça: anotar na separação, ver no cartão e na conferência", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const item = test.info().project.name === "pc" ? "menuitem" : "button"
  await page.getByRole("button", { name: "Mais opções", exact: true }).first().click()
  await page.getByRole(item, { name: "Nota", exact: true }).click()
  const janela = page.getByRole("dialog", { name: "Nota da peça" })
  await janela.getByRole("textbox", { name: "Nota da peça" }).fill("Peça de montagem: temos, falta montar")
  await janela.getByRole("button", { name: "Salvar nota" }).click()
  await expect(janela).toBeHidden()
  await expect(page.getByText("Peça de montagem: temos, falta montar")).toBeVisible()
  expect((await sim.one("select nota from pedido_itens where id = $1", [sim.item.id])).nota).toBe("Peça de montagem: temos, falta montar")

  // Conferência: a nota continua no cartão; dá para apagar pelo mesmo menu ("Editar nota").
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await page.reload()
  await expect(page.getByText("Peça de montagem: temos, falta montar")).toBeVisible()
  await page.getByRole("region", { name: "A conferir" }).getByRole("button", { name: "Mais opções", exact: true }).first().click()
  await page.getByRole(item, { name: "Editar nota", exact: true }).click()
  await page.getByRole("dialog", { name: "Nota da peça" }).getByRole("button", { name: "Apagar nota" }).click()
  await expect(page.getByText("Peça de montagem: temos, falta montar")).toHaveCount(0)
  expect((await sim.one("select nota from pedido_itens where id = $1", [sim.item.id])).nota).toBeNull()
  expect(sim.bloqueadas).toEqual([])
})

// V93: quem faz o pedido LR vê, no próprio passo, quais peças têm nota (recado) e o texto; as peças continuam na lista.
test("V93: pedido LR mostra o bloco 'Peças com nota' acima da lista", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem)
    values ($1,'avulso','Brinco liso','BR-LISO','PRATA',1,20,2),($1,'avulso','Colar fino','CO-FINO',null,3,30,3)`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set nota='Peça de montagem: temos as partes' where sku in ('AN-1','CO-FINO') and pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'faturamento')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const bloco = page.getByRole("alert", { name: "Peças com nota" })
  await expect(bloco).toContainText("Peças com nota (2)")
  await expect(bloco).toContainText("AN-1")
  await expect(bloco).toContainText("CO-FINO")
  await expect(bloco).not.toContainText("BR-LISO")
  await expect(bloco.getByText("Peça de montagem: temos as partes")).toHaveCount(2)
  const lista = page.getByRole("list", { name: "Peças do pedido LR" })
  await expect(lista.getByRole("listitem")).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  // Sem nota nenhuma, o bloco não aparece.
  await sim.banco.query("update pedido_itens set nota=null where pedido_id=$1", [sim.pedido.id])
  await page.reload()
  await expect(page.getByRole("list", { name: "Peças do pedido LR" })).toBeVisible()
  await expect(page.getByRole("alert", { name: "Peças com nota" })).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})
