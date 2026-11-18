import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// PNG de 1 pixel: serve de foto nos testes (o navegador consegue abri-lo, comprimir e "enviar").
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
const foto = (n) => ({ name: `peca-${n}.png`, mimeType: "image/png", buffer: PNG })
const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

async function semear() {
  const m = await sim.one("insert into clube_modelos(nome,codigo_base,preco,foto_url) values ('Anel Solitário','AN-SOL',89.9,'https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp') returning id")
  await sim.banco.query(`insert into pecas_clube(codigo,nome,variante,preco,modelo_id,foto_url) values
    ('AN-SOL-16','Anel Solitário','N°16',89.9,$1,'https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp'),
    ('AN-SOL-14','Anel Solitário','N°14',89.9,$1,'https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp'),
    ('AN-SOL-18','Anel Solitário','N°18',99,$1,'https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp')`, [m.id])
  await sim.banco.query("insert into pecas_clube(codigo,nome,variante,preco) values ('BR-GOTA','Brinco Gota','DOURADO',30)")
  return m.id
}

// V110: o Clube mostra o produto pai com as variantes (tamanho) juntas e a peça solta como sempre.
test("V110: o Clube agrupa as variantes de um produto e deixa a peça solta sozinha", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto("/clube")
  const produto = page.getByRole("article", { name: "Produto AN-SOL" }).or(page.locator('[aria-label="Produto AN-SOL"]'))
  await expect(produto).toBeVisible()
  await expect(produto.getByRole("list", { name: "Variantes" }).getByRole("listitem")).toHaveCount(3)
  // Tamanhos em ordem: N°14, N°16, N°18.
  await expect(produto.getByRole("listitem").nth(0)).toContainText("N°14")
  await expect(produto.getByRole("listitem").nth(2)).toContainText("N°18")
  await expect(produto.getByRole("listitem").nth(2)).toContainText("R$ 99,00") // preço próprio da variante
  await expect(page.getByText("BR-GOTA", { exact: true })).toBeVisible() // a peça solta continua inteira
  await expect(page.getByText("AN-SOL-14", { exact: true })).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "clube-produto", info)
  // Desativar uma variante (ex.: acabou o tamanho) não mexe nas outras.
  await produto.getByRole("switch", { name: "Ativa AN-SOL-16" }).click()
  await expect.poll(async () => (await sim.one("select ativo from pecas_clube where codigo='AN-SOL-16'")).ativo).toBe(false)
  expect((await sim.one("select count(*)::int n from pecas_clube where modelo_id is not null and ativo")).n).toBe(2)
  expect(sim.bloqueadas).toEqual([])
})

test("V110: cadastrar produto com variantes: o código sai sugerido, o preço vazio é o do pai e tudo grava junto", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto("/clube")
  await page.getByRole("button", { name: "Nova peça", exact: true }).click()
  const janela = page.getByRole("dialog", { name: "Nova peça do Clube" })
  await janela.getByRole("switch", { name: "Produto com variantes" }).click()
  await janela.getByLabel("Código do produto").fill("BR-LUA")
  await janela.getByLabel("Nome", { exact: true }).fill("Brinco Lua")
  await janela.getByLabel("Preço", { exact: true }).fill("49,90")
  // Variante sem nada: o erro aparece na linha e nada é salvo.
  await janela.getByRole("button", { name: "Salvar produto" }).click()
  await expect(janela.getByRole("alert").filter({ hasText: "Informe o código da variante" })).toBeVisible()
  expect((await sim.one("select count(*)::int n from clube_modelos")).n).toBe(0)
  // Preenche as duas variantes.
  await janela.getByLabel("Variante 1: Tamanho", { exact: true }).fill("P")
  await expect(janela.getByLabel("Variante 1: Código")).toHaveValue("BR-LUA-P")
  await janela.getByRole("button", { name: "Adicionar variante", exact: true }).click()
  await janela.getByLabel("Variante 2: Tamanho", { exact: true }).fill("G")
  await janela.getByLabel("Variante 2: Preço", { exact: true }).fill("59,90")
  await capturarTemas(page, "clube-produto-form", info)
  await janela.getByRole("button", { name: "Salvar produto" }).click()
  await expect.poll(async () => (await sim.one("select count(*)::int n from pecas_clube where modelo_id is not null")).n).toBe(2)
  const pecas = (await sim.banco.query("select codigo, nome, variante, preco from pecas_clube order by codigo")).rows
  expect(pecas.map((p) => [p.codigo, p.nome, p.variante, Number(p.preco)])).toEqual([["BR-LUA-G", "Brinco Lua", "G", 59.9], ["BR-LUA-P", "Brinco Lua", "P", 49.9]])
  expect((await sim.one("select codigo_base, nome from clube_modelos")).codigo_base).toBe("BR-LUA")
  await expect(page.locator('[aria-label="Produto BR-LUA"]')).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V110: editar o produto inteiro: muda o pai e acrescenta uma variante", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto("/clube")
  await page.locator('[aria-label="Produto AN-SOL"]').getByRole("button", { name: "Editar produto e variantes" }).click()
  const janela = page.getByRole("dialog", { name: "Editar produto do Clube" })
  await expect(janela.getByLabel("Nome", { exact: true })).toHaveValue("Anel Solitário")
  await janela.getByLabel("Nome", { exact: true }).fill("Anel Solitário Fino")
  await janela.getByRole("button", { name: "Adicionar variante", exact: true }).click()
  await janela.getByLabel("Variante 4: Tamanho", { exact: true }).fill("20")
  await janela.getByRole("button", { name: "Salvar alterações" }).click()
  await expect.poll(async () => (await sim.one("select count(*)::int n from pecas_clube where modelo_id is not null")).n).toBe(4)
  expect((await sim.one("select count(*)::int n from pecas_clube where nome='Anel Solitário Fino' and modelo_id is not null")).n).toBe(4)
  expect((await sim.one("select preco from pecas_clube where codigo='AN-SOL-20'")).preco).toBe("89.90") // o preço vazio é o do pai
  expect(sim.bloqueadas).toEqual([])
})

// V111: cadastro em massa por fotos.
test("V111: adicionar em massa: fotos em paralelo (no máximo 3), linhas marcadas e tudo salvo de uma vez", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  let emVoo = 0
  let maximo = 0
  let envios = 0
  // A foto sobe para o Storage (fictício): resposta de mentira com atraso, para medir quantas sobem ao mesmo tempo.
  await page.route("**/storage/v1/object/fotos/**", async (route) => {
    emVoo += 1; envios += 1
    maximo = Math.max(maximo, emVoo)
    await new Promise((r) => setTimeout(r, 300))
    emVoo -= 1
    await route.fulfill({ status: 200, json: { Key: "fotos/clube/x.webp" } })
  })
  await page.goto("/clube")
  await page.getByRole("button", { name: "Adicionar em massa" }).click()
  const janela = page.getByRole("dialog", { name: "Adicionar peças em massa" })
  await janela.getByLabel("Escolher fotos", { exact: true }).setInputFiles([foto(1), foto(2), foto(3), foto(4)])
  await expect(janela.getByText("4 fotos enviadas")).toBeVisible()
  expect(envios).toBe(4)
  expect(maximo).toBeGreaterThan(1)
  expect(maximo).toBeLessThanOrEqual(3)
  await expect(janela.getByRole("listitem", { name: /^Linha \d$/ })).toHaveCount(4)
  await semRolagemLateral(page)
  const caixa = await janela.boundingBox()
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(page.viewportSize().width)
  await capturarTemas(page, "clube-em-massa", info)
  // Preenche as linhas (a 3 fica sem nome: deve ser marcada e nada é salvo).
  const campo = (n, rotulo) => janela.getByLabel(`Linha ${n}: ${rotulo}`, { exact: true })
  await campo(1, "Código").fill("BR-1"); await campo(1, "Nome").fill("Brinco Um"); await campo(1, "Preço").fill("10,00")
  await campo(2, "Código").fill("AN-2"); await campo(2, "Nome").fill("Anel Dois"); await campo(2, "Preço").fill("20,00")
  await janela.getByRole("switch", { name: "Linha 2: Com variantes" }).click()
  await janela.getByLabel("Linha 2: variante 1: Tamanho", { exact: true }).fill("14")
  await janela.getByRole("button", { name: "Adicionar variante", exact: true }).click()
  await janela.getByLabel("Linha 2: variante 2: Tamanho", { exact: true }).fill("16")
  await campo(3, "Código").fill("CO-3")
  await campo(4, "Código").fill("PU-4"); await campo(4, "Nome").fill("Pulseira Quatro")
  await janela.getByRole("button", { name: /Salvar todas \(4\)/ }).click()
  await expect(janela.getByRole("listitem", { name: "Linha 3" }).getByRole("alert")).toContainText("Informe o nome")
  expect((await sim.one("select count(*)::int n from pecas_clube")).n).toBe(0)
  await capturarTemas(page, "clube-em-massa-erro", info)
  await campo(3, "Nome").fill("Colar Três")
  await janela.getByRole("button", { name: /Salvar todas \(4\)/ }).click()
  await expect.poll(async () => (await sim.one("select count(*)::int n from pecas_clube")).n).toBe(5)
  expect((await sim.one("select count(*)::int n from clube_modelos")).n).toBe(1)
  const pecas = (await sim.banco.query("select codigo, nome, variante, preco, foto_url is not null as foto, modelo_id is not null as com_pai from pecas_clube order by codigo")).rows
  expect(pecas.map((p) => [p.codigo, p.variante, Number(p.preco), p.foto, p.com_pai])).toEqual([
    ["AN-2-14", "N°14", 20, true, true], ["AN-2-16", "N°16", 20, true, true], ["BR-1", null, 10, true, false], ["CO-3", null, 0, true, false], ["PU-4", null, 0, true, false],
  ])
  await expect(janela).toBeHidden()
  await expect(page.locator('[aria-label="Produto AN-2"]')).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V111: foto que falha pode ser enviada de novo e bloqueia salvar enquanto isso", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  let tentativas = 0
  await page.route("**/storage/v1/object/fotos/**", async (route) => {
    tentativas += 1
    if (tentativas === 1) return route.fulfill({ status: 500, json: { message: "falha simulada no envio" } })
    return route.fulfill({ status: 200, json: { Key: "fotos/clube/x.webp" } })
  })
  await page.goto("/clube")
  await page.getByRole("button", { name: "Adicionar em massa" }).click()
  const janela = page.getByRole("dialog", { name: "Adicionar peças em massa" })
  await janela.getByLabel("Escolher fotos", { exact: true }).setInputFiles([foto(1)])
  await expect(janela.getByRole("alert").filter({ hasText: "Não foi possível enviar a foto" })).toBeVisible()
  await expect(janela.getByRole("button", { name: /Salvar todas/ })).toBeDisabled()
  await janela.getByRole("button", { name: "Tentar de novo" }).click()
  await expect(janela.getByText("1 foto enviada")).toBeVisible()
  await expect(janela.getByRole("button", { name: /Salvar todas/ })).toBeEnabled()
  expect((await sim.one("select count(*)::int n from pecas_clube")).n).toBe(0)
})

// A busca do Clube na venda: o produto com variantes aparece como um cartão com os botões de tamanho e escolher um
// tamanho põe aquela variante (a peça certa) no pedido.
test("V110: na venda, o Clube mostra o produto com botões de variante e o pedido guarda a variante escolhida", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Adicionar peça" }).click()
  const janela = page.getByRole("dialog", { name: "Adicionar peça" })
  await janela.getByRole("tab", { name: "Clube" }).click()
  const tamanhos = janela.getByRole("group", { name: "Tamanho" })
  await expect(tamanhos).toHaveCount(1) // um cartão só para as três variantes
  await expect(tamanhos.getByRole("button", { name: "N°14" })).toBeVisible()
  await expect(janela.getByText("AN-SOL", { exact: true })).toBeVisible()
  await capturarTemas(page, "clube-busca-produto", info)
  await tamanhos.getByRole("button", { name: "N°16" }).click()
  await expect(janela.getByText(/1 peça/).first()).toBeVisible() // entrou no carrinho
  await janela.getByRole("button", { name: /^Salvar/ }).click()
  await expect.poll(async () => (await sim.one("select count(*)::int n from pedido_itens where sku='AN-SOL-16' and peca_clube_id is not null")).n).toBe(1)
  const variante = await sim.one("select id from pecas_clube where codigo='AN-SOL-16'")
  expect((await sim.one("select peca_clube_id from pedido_itens where sku='AN-SOL-16'")).peca_clube_id).toBe(variante.id)
  expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([])
})
