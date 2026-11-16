import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// V65: aba aberta durante uma publicação pede o pacote antigo da página, que não existe mais. O app recarrega
// sozinho uma vez; se ainda assim falhar, mostra o aviso (sem repetir o recarregar sem fim).
test("V65: pacote da versão antiga recarrega a página uma vez", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/vendas")
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
  await expect(page.getByRole("link", { name: "Arquivo" }).first()).toBeVisible()
  await context.route((u) => u.pathname.includes("/src/pages/Arquivo.tsx"), (route) => route.abort())
  let cargas = 0
  page.on("load", () => cargas++)
  await page.getByRole("link", { name: "Arquivo" }).first().click()
  await expect(page.getByText("Algo deu errado nesta tela")).toBeVisible()
  expect(cargas).toBe(1)
  mkdirSync("capturas", { recursive: true })
  await page.screenshot({ path: `capturas/erro-tela-${info.project.name}.png` })
  await expect(page.getByRole("button", { name: "Recarregar" })).toBeVisible()
})
