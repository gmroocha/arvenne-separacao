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
