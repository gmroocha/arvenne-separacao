import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// O link do romaneio (resumo do pedido para a cliente) fica no "⋯" do pedido em qualquer etapa, não só na venda.
test("romaneio: copiar o link e enviar no WhatsApp pelo menu do pedido, já na esteira", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedidos set cliente_telefone='11987654321' where id=$1", [sim.pedido.id])
  await sim.banco.query("select mover_etapa($1,'conferencia')", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const { token_publico: token, numero } = await sim.one("select token_publico, numero from pedidos where id=$1", [sim.pedido.id])

  await page.getByRole("button", { name: "Mais ações", exact: true }).click()
  await expect(page.getByText("Copiar link do romaneio", { exact: true })).toBeVisible()
  await page.screenshot({ path: `capturas/romaneio-menu-${test.info().project.name}.png`, animations: "disabled" })
  await page.getByText("Copiar link do romaneio", { exact: true }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toBe(`${new URL(page.url()).origin}/r/${token}`)

  // WhatsApp: abre o wa.me com a mensagem pronta (a aba nova é barrada pelo simulador; só conferimos o endereço).
  await page.evaluate(() => { window.__aberto = null; window.open = (u) => { window.__aberto = u; return null } })
  await page.getByRole("button", { name: "Mais ações", exact: true }).click()
  await page.getByText("Enviar romaneio no WhatsApp", { exact: true }).click()
  const wa = await page.evaluate(() => window.__aberto)
  expect(wa).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/)
  const texto = decodeURIComponent(wa.split("?text=")[1])
  expect(texto).toContain(numero.replace(/^#/, ""))
  expect(texto).toContain(`/r/${token}`)

  // O link abre o romaneio com as peças do pedido.
  await page.goto(`/r/${token}`)
  await expect(page.getByText("AN-1").first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
