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

// V93: quem faz o pedido LR vê, no próprio passo, quais peças têm nota (recado) e o texto. Desde 18/11/2026 as peças com
// nota ficam separadas da lista e fora do "Copiar SKUs".
test("V93: pedido LR separa as peças com nota da lista e do Copiar SKUs", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem)
    values ($1,'avulso','Brinco liso','BR-LISO','PRATA',1,20,2),($1,'avulso','Colar fino','CO-FINO',null,3,30,3)`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set nota='Peça de montagem: temos as partes' where sku in ('AN-1','CO-FINO') and pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'faturamento')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const bloco = page.getByRole("alert", { name: "Peças com nota" })
  await expect(bloco).toContainText("Peças com nota (2)")
  await expect(bloco).toContainText("AN-1")
  await expect(bloco).toContainText("CO-FINO")
  await expect(bloco).not.toContainText("BR-LISO")
  await expect(bloco.getByText("Peça de montagem: temos as partes")).toHaveCount(2)
  const lista = page.getByRole("list", { name: "Peças do pedido LR" })
  await expect(lista.getByRole("listitem")).toHaveCount(1)
  await expect(lista).toContainText("BR-LISO")
  await page.getByRole("button", { name: "Copiar SKUs", exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("BR-LISO x1")
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  // Sem nota nenhuma, o bloco não aparece e todas voltam para a lista.
  await sim.banco.query("update pedido_itens set nota=null where pedido_id=$1", [sim.pedido.id])
  await page.reload()
  await expect(page.getByRole("list", { name: "Peças do pedido LR" }).getByRole("listitem")).toHaveCount(3)
  await expect(page.getByRole("alert", { name: "Peças com nota" })).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})

// Cada peça do pedido LR tem um check: copiar o código, a quantidade ou "Copiar SKUs" marca; tocar desmarca; fica no aparelho.
test("pedido LR: check em cada peça, marcado ao copiar e guardado ao recarregar", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,foto_url)
    values ($1,'avulso','Brinco liso','BR-LISO','PRATA',1,20,2,null),($1,'avulso','Colar fino','CO-FINO',null,3,30,3,null),
           ($1,'avulso','Pulseira','PU-1',null,2,40,4,null)`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set nota='É da Arvenne: não pedir na LR' where sku='PU-1' and pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'faturamento')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const check = (codigo) => page.getByRole("checkbox", { name: `${codigo} passado para a LR` })
  for (const c of ["AN-1", "BR-LISO", "CO-FINO", "PU-1"]) await expect(check(c)).not.toBeChecked()

  await page.getByRole("button", { name: "Copiar código BR-LISO" }).click()
  await expect(check("BR-LISO")).toBeChecked()
  await page.getByRole("button", { name: "Copiar quantidade de PU-1" }).click()
  await expect(check("PU-1")).toBeChecked()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("2")
  await expect(check("AN-1")).not.toBeChecked()

  // "Copiar SKUs" marca a lista inteira (sem as peças com nota).
  await page.getByRole("button", { name: "Copiar SKUs", exact: true }).click()
  for (const c of ["AN-1", "BR-LISO", "CO-FINO"]) await expect(check(c)).toBeChecked()
  await check("CO-FINO").click()
  await expect(check("CO-FINO")).not.toBeChecked()
  await page.screenshot({ path: `capturas/pedido-lr-checks-${info.project.name}.png`, fullPage: true, animations: "disabled" })

  await page.reload()
  await expect(check("BR-LISO")).toBeChecked()
  await expect(check("PU-1")).toBeChecked()
  await expect(check("CO-FINO")).not.toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  expect(sim.bloqueadas).toEqual([])
})
