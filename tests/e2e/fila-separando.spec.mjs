import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// V96: o tempo "na fila" (pago, ainda não começou) e "separando" (começou) aparecem separados, no pedido e no cartão.
test("V96: Na fila há… vira Separando há… ao começar a separação", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await expect(page.getByRole("link", { name: /Cliente de teste/ }).first()).toContainText(/Na fila há \d+ min/)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByText(/^Na fila há \d+ min$/)).toBeVisible()
  await page.getByRole("button", { name: "Começar separação", exact: true }).click()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("separacao")
  await expect(page.getByText(/^Separando há \d+ min$/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Começar separação", exact: true })).toHaveCount(0)
  await page.goto("/")
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: /Separação/ }).first().click()
  await expect(page.getByRole("link", { name: /Cliente de teste/ }).first()).toContainText(/Separando há \d+ min/)
  expect(sim.bloqueadas).toEqual([])
})
