import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const FOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9b" /></svg>')}`

// V97: tocar na foto da peça abre o detalhe (foto, código, nome, variante, quantidade, preço, nota e, se faltar, quantas
// faltam). O preço só aparece aqui, lido do banco: os cartões das etapas continuam sem valores.
test("V97: foto da peça na Separação abre o detalhe com o preço; o cartão não mostra valores", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedido_itens set foto_url=$2, nome='Anel de teste com nome bem comprido para o detalhe', variante='DOURADO / N°18', nota='Peça de montagem' where id=$1", [sim.item.id, FOTO])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toBeVisible()
  expect(await page.locator("main, body").first().innerText()).not.toContain("R$") // cartões sem valores
  await page.getByRole("button", { name: /^Anel de teste com nome/ }).first().click()
  const detalhe = page.getByRole("dialog", { name: "AN-1" })
  await expect(detalhe).toBeVisible()
  await expect(detalhe).toContainText("Anel de teste com nome bem comprido para o detalhe")
  await expect(detalhe).toContainText("DOURADO / N°18")
  await expect(detalhe.getByText("Quantidade do pedido")).toBeVisible()
  await expect(detalhe.locator("dd").first()).toHaveText("2")
  await expect(detalhe.getByText("Preço", { exact: true })).toBeVisible()
  await expect(detalhe).toContainText(/R\$\s*50,00/)
  await expect(detalhe).toContainText("Peça de montagem")
  await expect(detalhe.getByText(/^Faltam/)).toHaveCount(0)
  await capturarTemas(page, "detalhe-peca", info)
  // Sem sombra no X; a janela não alarga a página.
  const fechar = detalhe.getByRole("button", { name: "Fechar" })
  expect(await fechar.evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none")
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await fechar.click()
  await expect(detalhe).toBeHidden()
  // Peça sem foto também abre o detalhe.
  await sim.banco.query("update pedido_itens set foto_url=null where id=$1", [sim.item.id])
  await page.reload()
  await page.locator("button.cursor-zoom-in").first().click()
  await expect(page.getByRole("dialog", { name: "AN-1" })).toContainText(/R\$\s*50,00/)
  expect(sim.bloqueadas).toEqual([])
})

test("V97: peça em falta mostra quantas faltam, nos Problemas e no cartão da troca (uma linha, abre o detalhe)", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ troca: true })
  await sim.banco.query("update pedido_itens set foto_url=$2, variante='DOURADO / N°18 com texto bem longo para quebrar a linha no celular' where id=$1", [sim.item.id, FOTO])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.locator("button.cursor-zoom-in").first().click()
  const detalhe = page.getByRole("dialog", { name: "AN-1" })
  await expect(detalhe.getByText("Faltam 2")).toBeVisible()
  await expect(detalhe).toContainText(/R\$\s*50,00/)
  await page.keyboard.press("Escape")
  await expect(detalhe).toBeHidden()
  await page.getByRole("button", { name: /Editar troca|Continuar troca/ }).first().click()
  const troca = page.getByRole("dialog").filter({ hasText: "Cliente pagou" }).first()
  const cartao = troca.getByRole("button", { name: /AN-1/ }).first()
  await expect(cartao).toBeVisible()
  // Uma linha por texto, com reticências: nada quebra para a linha de baixo.
  for (const linha of await cartao.locator("span.truncate").all()) expect(await linha.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true)
  await capturarTemas(page, "troca-cartao-peca", info)
  await cartao.click()
  await expect(page.getByRole("dialog", { name: "AN-1" }).getByText("Faltam 2")).toBeVisible()
  await capturarTemas(page, "detalhe-peca-falta", info)
  expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([])
})
