import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const FOTO = "https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp"

// Nenhuma impressão de verdade: window.print só registra o que estaria na folha de etiquetas.
async function espiarImpressao(page) {
  await page.addInitScript(() => {
    window.__impressoes = []
    window.print = () => window.__impressoes.push([...document.querySelectorAll("#folha-etiquetas .etiqueta-sku")].map((e) => e.textContent.trim()))
  })
}

async function semear() {
  await sim.banco.query(`insert into pecas_clube(codigo,nome,variante,preco,foto_url,catalogo,live_em) values
    ('LV-BR-1','Brinco Estrela','DOURADO',40,$1,'live','2026-11-24'),
    ('LV-CO-2','Colar Lua',null,60,$1,'live','2026-11-24'),
    ('LV-AN-3','Anel Sol',null,55,$1,'live','2026-11-20')`, [FOTO])
  await sim.banco.query("insert into pecas_clube(codigo,nome,preco) values ('CL-1','Peça só do Clube',30)")
}

test("Live: cadastrar peça com a data, achar na aba Live da venda pelo seletor e adicionar ao pedido", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto("/live")
  // A live mais recente já vem escolhida; a do dia 20 e o Clube não aparecem.
  await expect(page.getByText("LV-BR-1", { exact: true })).toBeVisible()
  await expect(page.getByText("LV-AN-3", { exact: true })).toHaveCount(0)
  await expect(page.getByText("CL-1", { exact: true })).toHaveCount(0)
  await semRolagemLateral(page)
  await capturarTemas(page, "live-pagina", info)
  await page.getByRole("button", { name: "Nova peça", exact: true }).click()
  const janela = page.getByRole("dialog", { name: "Nova peça da Live" })
  await expect(janela.getByLabel("Data da live")).toHaveValue("2026-11-24") // a live escolhida
  await janela.getByLabel("Data da live").fill("2026-11-26")
  await janela.getByLabel("Código", { exact: true }).fill("LV-PU-9")
  await janela.getByLabel("Nome", { exact: true }).fill("Pulseira Nova")
  await janela.getByLabel("Preço", { exact: true }).fill("70,00")
  await janela.getByRole("button", { name: "Salvar peça" }).click()
  await expect.poll(async () => (await sim.one("select live_em::text d from pecas_clube where codigo='LV-PU-9'"))?.d).toBe("2026-11-26")
  expect((await sim.one("select catalogo from pecas_clube where codigo='LV-PU-9'")).catalogo).toBe("live")

  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Adicionar peça" }).click()
  const busca = page.getByRole("dialog", { name: "Adicionar peça" })
  await expect(busca.getByText("nas peças da Live")).toBeVisible()
  await busca.getByRole("tab", { name: "Live" }).click()
  // Mais recente (26) escolhida: só a pulseira. Troca para o dia 24 pelo seletor.
  await expect(busca.getByText("LV-PU-9", { exact: true })).toBeVisible()
  await expect(busca.getByText("LV-BR-1", { exact: true })).toHaveCount(0)
  await capturarTemas(page, "live-busca-venda", info)
  await busca.getByRole("combobox", { name: "Data da live" }).click()
  await page.getByRole("option", { name: /Live 24\/11\/2026/ }).click()
  await expect(busca.getByText("LV-BR-1", { exact: true })).toBeVisible()
  await expect(busca.getByText("CL-1", { exact: true })).toHaveCount(0)
  await busca.getByRole("button", { name: "Adicionar" }).first().click()
  await busca.getByRole("button", { name: /^Salvar/ }).click()
  await expect.poll(async () => (await sim.one("select count(*)::int n from pedido_itens i join pecas_clube p on p.id=i.peca_clube_id where i.origem='clube' and p.catalogo='live'")).n).toBe(1)
  expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([])
})

test("Live: a página gera a folha de etiquetas das peças escolhidas e de todas as da live", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await semear()
  await espiarImpressao(page)
  await sim.instalar(context, baseURL)
  await page.goto("/live")
  await page.getByRole("button", { name: "Etiquetar LV-BR-1" }).click()
  await page.getByRole("button", { name: /^Aumentar/ }).click()
  await expect(page.getByText(/1 peça · 2 etiquetas/)).toBeVisible()
  await page.getByRole("button", { name: "Imprimir", exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__impressoes.length)).toBe(1)
  expect(await page.evaluate(() => window.__impressoes[0])).toEqual(["SKU: LV-BR-1", "SKU: LV-BR-1"])
  await page.getByRole("button", { name: "Imprimir todas desta live" }).click()
  await expect.poll(() => page.evaluate(() => window.__impressoes.length)).toBe(2)
  expect((await page.evaluate(() => window.__impressoes[1])).sort()).toEqual(["SKU: LV-BR-1", "SKU: LV-CO-2"])
  expect(sim.bloqueadas).toEqual([])
})

test("Live: a funcionária vê o menu Live e abre a página", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "separacao", papel: "funcionaria" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto("/")
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
  await expect(page.getByRole("link", { name: "Live", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Clube", exact: true })).toHaveCount(0)
  await page.getByRole("link", { name: "Live", exact: true }).click()
  await expect(page).toHaveURL(/\/live$/)
  await expect(page.getByText("LV-BR-1", { exact: true })).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "live-funcionaria", info)
  expect(sim.bloqueadas).toEqual([])
})
