import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

// As barras de rolagem aparecem como no computador da loja (o Playwright as esconde por padrão).
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } })

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// V40: com barra de rolagem visível (Windows), a lista da esquerda ganhava barra só na aba "Preço parecido" e as abas
// davam um tranco de ~10 px. No celular, a gaveta crescia com o conteúdo e as abas subiam ~120 px. O Playwright esconde as barras por padrão; aqui elas aparecem como no computador da loja.
test("V40: trocar de aba não desloca as abas; V38: Cobrir tudo esconde o campo e o número gigante", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ troca: true })
  await sim.banco.query(`insert into catalogo_site(variant_id,produto_id,sku,produto,preco,status,vende_sem_estoque)
    select n,n,'CAT-'||n,'Peça de teste '||n,40+(n%10),'ACTIVE',true from generate_series(1,40) n`)
  await sim.banco.query("insert into catalogo_sincronizacao(modo,iniciado_em) values ('completo',now())")
  await sim.instalar(context, baseURL, { logado: true })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: /Editar troca|Continuar troca/ }).first().click()
  const lista = page.locator('[data-slot="tabs-list"]')
  await expect(lista).toBeVisible()
  const x = async () => (await lista.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.x, Math.round(r.y), r.width] }))
  await page.getByRole("tab", { name: "Variantes" }).click()
  await expect(page.getByRole("tab", { name: "Variantes" })).toHaveAttribute("data-state", "active")
  await expect(page.getByText("Incluir peças que já estão no pedido")).toBeVisible()
  const antes = await x()
  await page.getByRole("tab", { name: "Preço parecido" }).click()
  await expect(page.getByText("Faixa de preço")).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => document.querySelectorAll("img, svg").length))).toBeGreaterThan(5)
  expect(await x()).toEqual(antes)
  await page.getByRole("tab", { name: "Variantes" }).click()
  expect(await x()).toEqual(antes)

  // Cobrir diferença: "Tudo" grava o máximo do banco sem mostrar o número; "Até" mostra o campo.
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: /opç(ão|ões) escolhida/ }).click()
  await page.getByRole("switch", { name: "Cobrir diferença" }).click()
  await page.getByRole("radio", { name: "Tudo" }).click()
  await expect.poll(async () => Number((await sim.one("select cobrir_ate from trocas where id=$1", [sim.troca.id])).cobrir_ate)).toBe(99999999.99)
  await expect(page.getByText("A Arvenne cobre a diferença inteira da troca.")).toBeVisible()
  await expect(page.getByLabel("até")).toHaveCount(0)
  expect(await page.locator("body").innerText()).not.toMatch(/99\.999\.999/)
  await page.getByRole("radio", { name: /^Até/ }).click()
  await expect(page.getByLabel("até")).toBeVisible()
  await expect(page.getByLabel("até")).toHaveValue("")
  await expect.poll(async () => Number((await sim.one("select cobrir_ate from trocas where id=$1", [sim.troca.id])).cobrir_ate)).toBe(0)
  await expect(page.getByRole("switch", { name: "Cobrir diferença" })).toBeChecked()
  expect(sim.bloqueadas).toEqual([])
})
