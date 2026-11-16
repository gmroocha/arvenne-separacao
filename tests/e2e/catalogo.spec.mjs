import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Catálogo: acha a peça (busca e categoria), escolhe quantas etiquetas e imprime numa fila só.
test("catálogo busca, filtra, seleciona e imprime etiquetas", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into catalogo_site(variant_id,produto_id,sku,produto,variante,preco,status) values
    (101,1,'AN-10','ANEL SOLITÁRIO','Nº16',80,'ACTIVE'),(102,1,'AN-11','ANEL SOLITÁRIO','Nº18',80,'ACTIVE'),
    (201,2,'BR-20','BRINCO PONTO DE LUZ',null,60,'ACTIVE'),(301,3,'CO-30','COLAR CORAÇÃO',null,90,'ACTIVE'),
    (401,4,'AR-40','ANEL ARQUIVADO',null,50,'ARCHIVED')`)
  await sim.instalar(context, baseURL)
  await page.goto("/catalogo")
  await expect(page.getByText("4 de 4 peças ativas da Shopify.")).toBeVisible()
  await page.getByRole("textbox", { name: "Buscar peça ou código" }).fill("anel")
  await expect(page.getByText("2 de 4 peças ativas da Shopify.")).toBeVisible()
  await page.getByRole("textbox", { name: "Buscar peça ou código" }).fill("")
  await page.getByRole("combobox", { name: "Categoria" }).click()
  await page.getByRole("option", { name: "Brinco" }).click()
  await expect(page.getByText("1 de 4 peças ativas da Shopify.")).toBeVisible()
  await page.getByRole("button", { name: "Selecionar" }).click()
  await page.getByRole("button", { name: /Aumentar/ }).first().click()
  await expect(page.getByText("1 peça · 2 etiquetas")).toBeVisible()
  mkdirSync("capturas", { recursive: true })
  await page.screenshot({ path: `capturas/catalogo-${info.project.name}.png`, fullPage: true })
  await page.getByRole("button", { name: /^Imprimir/ }).click()
  // Sem Zebra no teste: abre a folha do navegador (fictícia); nada vai para impressora real.
  expect(sim.bloqueadas).toEqual([])
})
