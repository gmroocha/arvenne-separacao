import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function conferencia(context, baseURL) {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,status)
    select $1,'avulso','Peça '||n,'PC-'||n,'N°1'||n,1,10,n,'encontrado' from generate_series(1,3) n`, [sim.pedido.id])
  await sim.banco.query("update pedido_itens set status='encontrado' where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='conferencia' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
}

// V66: marcar uma peça animava os blocos (deslizar até o fim da fileira de cima) e a tela engasgava.
// A troca agora é direta: nenhuma transição de tela começa ao marcar.
test("V66: marcar peça troca a tela sem animação de transição", async ({ page, context, baseURL }) => {
  await conferencia(context, baseURL)
  await context.addInitScript(() => {
    window.__transicoes = 0
    const original = document.startViewTransition?.bind(document)
    if (original) document.startViewTransition = (...a) => { window.__transicoes++; return original(...a) }
  })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const conferida = page.getByRole("button", { name: "Conferida", exact: true })
  await expect(conferida).toHaveCount(4)
  await conferida.first().click()
  await expect(conferida).toHaveCount(3)
  expect(await page.evaluate(() => window.__transicoes)).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

// Feedback de uma peça pelo menu "…": grava o texto com a peça, o código e o pedido.
test("feedback da peça pelo menu grava peça e código", async ({ page, context, baseURL }) => {
  await conferencia(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const primeira = page.getByRole("region", { name: "A conferir" }).getByRole("button", { name: "Mais opções" }).first()
  await primeira.click()
  await page.getByRole(test.info().project.name === "pc" ? "menuitem" : "button", { name: "Feedback", exact: true }).click()
  const janela = page.getByRole("dialog", { name: "Feedback da peça" })
  await expect(janela).toBeVisible()
  await janela.getByRole("textbox", { name: "Feedback da peça" }).fill("Foto bem diferente da peça")
  await janela.getByRole("button", { name: "Enviar feedback" }).click()
  await expect(janela).toBeHidden()
  const fb = await sim.one("select f.texto, f.sku, f.pedido_id, i.sku as sku_item from feedbacks f join pedido_itens i on i.id = f.item_id")
  expect(fb).toMatchObject({ texto: "Foto bem diferente da peça", pedido_id: sim.pedido.id })
  expect(fb.sku).toBe(fb.sku_item)
  expect(sim.bloqueadas).toEqual([])
})

// V67: no seletor de quantidade (− 1 +) cada junção tinha dois traços translúcidos somados (mais claros e
// grossos que o contorno). Contorno cinza voltou à borda de 1 px do shadcn: cada peça depois da primeira
// fica sem a borda esquerda, e nenhuma desenha o traço de sombra.
test("V67: seletor de quantidade com um traço só em cada junção; venda separa carrinho de peças à mão", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query("update pedido_itens set entrada='carrinho', variante='N°18', sku='TR2456-18' where id=$1", [sim.item.id])
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,entrada)
    values ($1,'avulso','Brinco à mão','BR-9',null,1,30,5,'manual')`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const carrinho = page.getByRole("region", { name: "Do carrinho da cliente" })
  const aMao = page.getByRole("region", { name: "Adicionadas à mão" })
  await expect(carrinho.getByText("TR2456-18")).toBeVisible()
  await expect(aMao.getByText("BR-9")).toBeVisible()
  const grupo = carrinho.getByRole("group").filter({ has: page.getByRole("button", { name: "Diminuir" }) })
  const bordas = await grupo.evaluate((g) =>
    [...g.children].map((c) => {
      const e = getComputedStyle(c)
      return { topo: e.borderTopWidth, esquerda: e.borderLeftWidth, sombra: /inset/.test(e.boxShadow) && !/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px inset/.test(e.boxShadow) }
    }),
  )
  expect(bordas.every((b) => b.topo === "1px" && !b.sombra)).toBe(true)
  expect(bordas.slice(1).every((b) => b.esquerda === "0px")).toBe(true)
  expect(sim.bloqueadas).toEqual([])
})

// Situação da venda numa lista no topo (em vez dos dois botões no resumo).
test("situação da venda pela lista do topo grava na hora", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.getByRole("combobox", { name: "Situação da venda" }).click()
  await page.getByRole("option", { name: "⏳ Aguardando pagamento" }).click()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("aguardando_pagamento")
  await page.getByRole("combobox", { name: "Situação da venda" }).click()
  await page.getByRole("option", { name: "❌ Perdida…" }).click()
  await expect(page.getByRole("dialog", { name: "Marcar como perdida?" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
const FOTO = "https://cdn.shopify.com/s/files/teste/anel.png"

// Ao ampliar uma foto, a janela abria vazia (só o X no meio) até a foto grande chegar. Agora abre no
// tamanho final com a miniatura já carregada, e a grande entra por cima.
test("foto ampliada abre no tamanho certo antes da foto grande chegar", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedido_itens set foto_url=$2 where id=$1", [sim.item.id, FOTO])
  await sim.instalar(context, baseURL)
  await page.route("https://cdn.shopify.com/**", async (route) => {
    if (route.request().url().includes("width=1200")) await new Promise((r) => setTimeout(r, 2500))
    await route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const miniatura = page.getByRole("region", { name: "A encontrar" }).locator("button.cursor-zoom-in").first()
  await expect(miniatura.locator("img")).toHaveJSProperty("complete", true)
  await miniatura.click()
  const janela = page.getByRole("dialog")
  await expect(janela).toBeVisible()
  const caixa = await janela.locator(".rounded-lg.bg-muted").first().boundingBox()
  expect(caixa.width).toBeGreaterThan(200)
  expect(caixa.height).toBeGreaterThan(200)
  expect(sim.bloqueadas).toEqual([])
})

// Página da cliente: cartões com foto grande; tocar abre o carrossel com código, variante, quantidade,
// valor unitário e total (do banco); arrasta/setas para as outras peças. Resumo preso no rodapé.
test("romaneio: carrossel das peças com valores do banco e resumo fixo", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem)
    values ($1,'avulso','Brinco gota','BR-2','Azul',2,33.33,2), ($1,'avulso','Colar fino','CO-3',null,1,80,3)`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/r/${sim.pedido.token_publico}`)
  await page.getByRole("button", { name: "Ver BR-2, Azul" }).click()
  const janela = page.getByRole("dialog")
  await expect(janela.getByText("2 de 3")).toBeVisible()
  const atual = janela.getByRole("region", { name: "Peça 2 de 3" })
  await expect(atual.getByText("Total da peça")).toBeVisible()
  await expect(atual.getByText("R$ 66,66")).toBeVisible()
  await expect(atual.getByText("R$ 33,33")).toBeVisible()
  // Arrasta para o lado (no PC também há setas).
  await janela.locator(".snap-x").evaluate((el) => el.scrollTo({ left: el.clientWidth * 2, behavior: "instant" }))
  await expect(janela.getByText("3 de 3")).toBeVisible()
  await expect(janela.getByRole("region", { name: "Peça 3 de 3" }).getByText("CO-3")).toBeVisible()
  await page.keyboard.press("Escape")
  // Resumo preso no rodapé e cabeçalho preso no topo.
  const rodape = page.locator("div.fixed.bottom-0")
  await expect(rodape.getByText("Total", { exact: true })).toBeVisible()
  expect(await page.locator("header").evaluate((h) => getComputedStyle(h).position)).toBe("sticky")
  expect(sim.bloqueadas).toEqual([])
})

// Peça do Clube: editar pelo cartão em "Adicionar peça" e somar uma segunda variante (tamanho e cor).
test("Clube: editar peça com mais de uma variante", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  const peca = await sim.one("insert into pecas_clube (codigo, nome, variante, preco) values ('anf804am', 'Meia Aliança Colorida', '20', 97.17) returning id")
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Adicionar peça" }).click()
  const janela = page.getByRole("dialog", { name: "Adicionar peça" })
  await janela.getByRole("tab", { name: "Clube" }).click()
  await janela.getByRole("button", { name: "Editar" }).click()
  await expect(janela.getByLabel("Tamanho", { exact: true })).toHaveValue("20")
  // Mais de uma variante na mesma peça: tamanho e cor.
  await janela.getByRole("button", { name: "Adicionar outra variante" }).click()
  await janela.getByLabel("Cor", { exact: true }).fill("Verde")
  await expect(janela.getByText("Verde / N°20")).toBeVisible()
  await janela.getByRole("button", { name: "Salvar alterações" }).click()
  await expect.poll(async () => (await sim.one("select variante from pecas_clube where id=$1", [peca.id])).variante).toBe("Verde / N°20")
  // A aba Site tenta atualizar o catálogo sozinha (função Edge): no simulador ela é barrada, como deve.
  expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([])
})
