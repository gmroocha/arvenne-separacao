import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

// Celular de verdade (projeto "celular-toque": isMobile + hasTouch + escala 3x). Num celular real, qualquer elemento
// mais largo que a tela faz o navegador alargar a área visível: dá zoom para fora, deixa arrastar a página para o
// lado e deixa diálogos e menus fora do lugar. O projeto "celular" (Chromium de 390 px sem toque) não vê isso.
// Em cada tela e janela confere: sem zoom (visualViewport.scale = 1), sem rolagem lateral e nenhum elemento visível
// passando de 390 px. O culpado vem na mensagem (tag, classes, texto e quanto passou).
const L = 390
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const FOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9b" /></svg>')}`
// Nomes e variantes longos de propósito: o que mais alarga a página no celular é texto sem quebra.
const NOMES = [
  ["ANEL-ESPIRAL-ZIRCONIA-COM-NOME-DE-CODIGO-MUITO-LONGO-18", "Anel espiral de zircônia com nome de peça bem comprido para ocupar várias linhas", "DOURADO / N°18", 1],
  ["BR-ESP-1", "Brinco espiral", "PRATA", 2],
  ["CO-CORACAO-ZIRCONIA-VERDE-ESMERALDA-45CM", "Colar coração zircônia verde esmeralda", "VERDE ESMERALDA / 45 CM", 1],
  ["AN-3", "Anel solitário", "N°14", 1],
  ["PU-4", "Pulseira riviera", "PRATA / 18 CM", 1],
  ["PI-5", "Pingente de letra", "A", 1],
  ["BR-6", "Brinco argola", "DOURADO", 1],
  ["CO-7", "Colar choker", "PRATA", 1],
]

async function montar(context, baseURL, { status = "novo" } = {}) {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query("delete from pedido_itens where pedido_id=$1", [sim.pedido.id])
  for (const [n, [sku, nome, variante, qtd]] of NOMES.entries())
    await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem,foto_url) values ($1,'avulso',$2,$3,$4,$5,10,$6,$7)", [sim.pedido.id, nome, sku, variante, qtd, n + 1, FOTO])
  await sim.banco.query(`update pedidos set cliente_nome='Maria Aparecida da Conceição de Albuquerque e Souza', cliente_telefone='11987654321',cliente_cpf='12345678909',
    entrega_cep='01001000',entrega_logradouro='Rua de teste com um nome de rua bem comprido para quebrar linha',entrega_numero='10',entrega_bairro='Centro',
    entrega_cidade='São Paulo',entrega_uf='SP',forma_pagamento=case when $2='em_aberto' then null else 'Cartão' end,
    valor_pago=case when $2='em_aberto' then null else 100 end,pago_em=case when $2='em_aberto' then null else now() end,status=$2 where id=$1`, [sim.pedido.id, status])
  await sim.instalar(context, baseURL)
}

// Tudo o que a tela mede de uma vez: escala, larguras e os elementos que passam de 390 px (fora de rolagens de propósito).
const medir = () => {
  const vv = window.visualViewport
  const culpados = []
  const rolagem = (el) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === "auto" || o === "scroll") return true
    }
    return false
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("[data-sonner-toaster], [role=progressbar]")) continue // aviso passageiro; a barra de progresso desloca o preenchimento por transform
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed" && cs.opacity === "0") continue
    const r = el.getBoundingClientRect()
    if (r.width <= 1 && r.height <= 1) continue
    if (r.width === 0 || r.height === 0) continue
    const [dx, dy] = [0, 0]
    const direita = r.right + dx - 390, esquerda = -(r.left + dy)
    if (direita > 0.5 || esquerda > 0.5) {
      if (rolagem(el)) continue
      // Só o mais externo de cada ramo: filhos de um culpado quase sempre passam junto.
      if (culpados.some((c) => c.el.contains(el))) continue
      culpados.push({ el, direita: Math.round(direita), esquerda: Math.round(esquerda), tag: el.tagName.toLowerCase(), classes: String(el.getAttribute("class") ?? "").slice(0, 110), texto: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50), label: el.getAttribute("aria-label") ?? el.getAttribute("data-slot") ?? "" })
    }
  }
  // Cortados: o elemento passa da borda de um pai que esconde o excesso (overflow hidden/clip), como o botão da seta no
  // cabeçalho do passo do LR. Não alarga a página, mas o botão fica pela metade na tela.
  const cortados = []
  for (const el of document.body.querySelectorAll("button, a, svg, [data-slot=badge], input, textarea")) {
    if (el.closest("[data-sonner-toaster], [role=progressbar]")) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) continue
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") continue
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === "auto" || o === "scroll") break
      if (o === "hidden" || o === "clip") {
        const b = a.getBoundingClientRect()
        if (b.width > 0 && (r.right > b.right + 1.5 || r.left < b.left - 1.5)) {
          cortados.push(`<${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? el.getAttribute("data-slot") ?? ""}> "${(el.textContent ?? "").trim().slice(0, 30)}" passa ${Math.round(Math.max(r.right - b.right, b.left - r.left))} px do <${a.tagName.toLowerCase()} ${a.getAttribute("data-slot") ?? ""}>`)
          break
        }
      }
    }
  }
  return {
    cortados,
    escala: vv.scale,
    larguraVisivel: Math.round(vv.width),
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth,
    culpados: culpados.map(({ el: _el, ...c }) => c),
  }
}

// Registra tudo o que estiver errado nesta tela (a lista inteira aparece de uma vez no final).
async function conferir(page, onde, problemas) {
  await page.waitForTimeout(350) // fim das animações de entrada
  const m = await page.evaluate(medir)
  const erros = []
  if (m.escala !== 1) erros.push(`zoom (visualViewport.scale) = ${m.escala}`)
  if (m.scrollWidth > L) erros.push(`página alargou: scrollWidth ${m.scrollWidth} > ${L}`)
  if (m.innerWidth > L) erros.push(`área visível alargou: innerWidth ${m.innerWidth} > ${L}`)
  for (const c of m.cortados) erros.push(`cortado: ${c}`)
  for (const c of m.culpados) erros.push(`elemento largo: <${c.tag}${c.label ? ` ${c.label}` : ""}> passa ${c.direita} px à direita / ${c.esquerda} px à esquerda | "${c.texto}" | ${c.classes}`)
  for (const e of erros) problemas.push(`[${onde}] ${e}`)
  return m
}

async function toque(loc) {
  await loc.scrollIntoViewIfNeeded()
  await loc.tap()
}

// Teclado do celular: o campo ganha o foco e a área visível encolhe (Android/iOS). Confere que a janela continua
// toda dentro da área visível e que o campo (16 px, sem zoom ao tocar) fica à vista.
async function comTeclado(page, onde, campo, problemas, caixa) {
  await toque(campo)
  await expect(campo).toBeFocused()
  const fonte = await campo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  if (fonte < 16) problemas.push(`[${onde}] campo com fonte ${fonte}px (< 16): o iPhone dá zoom ao tocar`)
  await conferir(page, `${onde} (campo focado)`, problemas)
  await page.setViewportSize({ width: L, height: 470 }) // teclado aberto
  await page.waitForTimeout(400)
  await conferir(page, `${onde} (teclado aberto)`, problemas)
  await page.screenshot({ path: `capturas/celular-toque-teclado-${onde.replace(/[^a-z]+/gi, "-").toLowerCase()}.png` })
  const r = await caixa.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } })
  const c = await campo.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom } })
  const altura = await page.evaluate(() => innerHeight)
  if (r.bottom > altura + 1) problemas.push(`[${onde}] janela passa da área visível com o teclado: base ${Math.round(r.bottom)} > ${altura}`)
  if (c.top < 0 || c.bottom > altura + 1) problemas.push(`[${onde}] campo fora da área visível com o teclado: ${Math.round(c.top)}..${Math.round(c.bottom)} (altura ${altura})`)
  await page.setViewportSize({ width: L, height: 844 })
  await page.waitForTimeout(300)
}

// Um passo que falha (tela quebrada impede o toque) vira problema na lista e o teste segue para as outras telas.
async function passo(page, onde, problemas, fn) {
  try { await fn() } catch (e) {
    problemas.push(`[${onde}] a interação falhou: ${String(e.message).split("\n")[0].slice(0, 160)}`)
    await page.keyboard.press("Escape").catch(() => {})
    await page.setViewportSize({ width: L, height: 844 }).catch(() => {})
  }
}

async function fechar(page) {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(450)
}

async function menuDaPeca(page, item) {
  await toque(page.getByRole("button", { name: "Mais opções", exact: true }).first())
  await toque(page.getByRole("button", { name: item, exact: true }).or(page.getByRole("menuitem", { name: item, exact: true })).first())
}

test("celular de verdade: nenhuma tela alarga a página, dá zoom ou quebra os diálogos", async ({ page, context, baseURL }, info) => {
  test.setTimeout(240_000)
  test.skip(info.project.name !== "celular-toque", "só vale com toque e viewport mobile")
  mkdirSync("capturas", { recursive: true })
  const problemas = []
  await montar(context, baseURL, { status: "novo" })
  const id = sim.pedido.id
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("button", { name: "Achei", exact: true }).first()).toBeVisible()
  await conferir(page, "Separação (tudo pendente)", problemas)

  // O caminho do relato: tocar em "Achei" e ver a faixa das peças feitas aparecer embaixo.
  await toque(page.getByRole("button", { name: "Achei", exact: true }).first())
  await toque(page.getByRole("button", { name: "Achei", exact: true }).first())
  await expect(page.getByRole("button", { name: /Encontradas/ })).toBeVisible()
  await conferir(page, "Separação depois de tocar em Achei (faixa das peças feitas)", problemas)
  await page.screenshot({ path: `capturas/celular-toque-separacao.png`, fullPage: true })

  // Diálogos com o teclado: Nota da peça e Feedback da peça (menu "…"), e o Feedback do cabeçalho.
  await passo(page, "Nota da peça", problemas, async () => {
    await menuDaPeca(page, "Nota")
    const nota = page.getByRole("dialog", { name: "Nota da peça" })
    await expect(nota).toBeVisible()
    await conferir(page, "Nota da peça (aberta)", problemas)
    await comTeclado(page, "Nota da peça", nota.getByRole("textbox", { name: "Nota da peça" }), problemas, nota)
    await fechar(page)
  })
  await passo(page, "Feedback da peça", problemas, async () => {
    await menuDaPeca(page, "Feedback")
    const feedbackPeca = page.getByRole("dialog", { name: "Feedback da peça" })
    await expect(feedbackPeca).toBeVisible()
    await comTeclado(page, "Feedback da peça", feedbackPeca.getByRole("textbox", { name: "Feedback da peça" }), problemas, feedbackPeca)
    await fechar(page)
  })
  await passo(page, "Feedback do cabeçalho", problemas, async () => {
    await toque(page.getByRole("button", { name: "Feedback", exact: true }).first())
    const feedback = page.getByRole("dialog", { name: "Feedback", exact: true })
    await expect(feedback).toBeVisible()
    await comTeclado(page, "Feedback do cabeçalho", feedback.getByRole("textbox"), problemas, feedback)
    await fechar(page)
  })

  // Foto ampliada e menu de etapas.
  await passo(page, "Foto ampliada", problemas, async () => {
    await toque(page.getByRole("button", { name: /^Anel espiral/ }).first())
    await expect(page.getByRole("dialog")).toBeVisible()
    await conferir(page, "Detalhe da peça (foto ampliada)", problemas)
    await page.screenshot({ path: "capturas/celular-toque-detalhe-peca.png" })
    await fechar(page)
  })
  await passo(page, "Menu de etapas", problemas, async () => {
    await toque(page.getByRole("button", { name: /^Etapa \d+ de \d+/ }))
    await expect(page.getByRole("dialog", { name: "Etapas do pedido" })).toBeVisible()
    await conferir(page, "Menu de etapas", problemas)
    await fechar(page)
  })

  // Faixas de peças feitas em cada etapa de peça (o banco leva o pedido à etapa e marca algumas peças).
  const marcar = (sql) => sim.banco.query(`update pedido_itens set ${sql} where pedido_id=$1 and ordem<=3`, [id])
  await sim.banco.query("select mover_etapa($1,'conferencia')", [id])
  await marcar("conferido_em=now(), etiquetado_em=now()")
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("button", { name: "Conferida", exact: true }).first()).toBeVisible()
  await conferir(page, "Conferência (com peças conferidas)", problemas)
  await page.screenshot({ path: `capturas/celular-toque-conferencia.png`, fullPage: true })
  await sim.banco.query("select mover_etapa($1,'bipagem')", [id])
  await marcar("qtd_bipada=qtd, bipado_em=now()")
  await sim.banco.query("update pedido_itens set qtd_bipada=0,bipado_em=null where pedido_id=$1 and ordem>3", [id])
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("textbox", { name: "Código da peça" })).toBeVisible()
  await conferir(page, "Bipagem (com peças bipadas)", problemas)
  await page.screenshot({ path: `capturas/celular-toque-bipagem.png`, fullPage: true })

  // Nota fiscal com "Peças do pedido" aberto, e o passo do pedido LR (botão do LR).
  await sim.banco.query("select mover_etapa($1,'faturamento')", [id])
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("button", { name: "Nota emitida", exact: true })).toBeVisible()
  await conferir(page, "Nota fiscal", problemas)
  await toque(page.getByRole("button", { name: /^Peças do pedido/ }))
  await expect(page.getByText("BR-ESP-1").first()).toBeVisible()
  await conferir(page, "Nota fiscal com Peças do pedido aberto", problemas)
  await page.screenshot({ path: `capturas/celular-toque-nota.png`, fullPage: true })
  await expect(page.getByRole("button", { name: "Pedido LR feito", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Pedido LR feito", exact: true }).scrollIntoViewIfNeeded()
  await conferir(page, "Pedido LR (botão)", problemas)
  await page.screenshot({ path: `capturas/celular-toque-lr.png`, fullPage: true })

  // Embalagem, Frete, Postagem e Concluídos.
  for (const [etapa, rotulo] of [["embalagem", "Embalagem"], ["frete", "Frete"], ["pronto_envio", "Postagem"]]) {
    await sim.banco.query("select mover_etapa($1,$2)", [id, etapa])
    await page.goto(`/pedidos/${id}`)
    await page.waitForLoadState("networkidle")
    await conferir(page, rotulo, problemas)
  }
  await sim.banco.query("select mover_etapa($1,'enviado')", [id])
  await page.goto(`/pedidos/${id}`)
  await page.waitForLoadState("networkidle")
  await conferir(page, "Pedido concluído", problemas)
  await page.goto("/concluidos")
  await expect(page.getByRole("link", { name: /Maria Aparecida/ })).toBeVisible()
  await conferir(page, "Concluídos", problemas)
  await page.screenshot({ path: `capturas/celular-toque-concluidos.png`, fullPage: true })

  // Outras listas.
  for (const [rota, nome] of [["/", "Expedição"], ["/vendas", "Vendas"], ["/arquivo", "Arquivo"], ["/time", "Time"], ["/repetidas", "Peças repetidas"], ["/catalogo", "Catálogo"], ["/clube", "Clube"], ["/feedbacks", "Feedbacks"]]) {
    await page.goto(rota)
    await page.waitForLoadState("networkidle")
    await conferir(page, nome, problemas)
  }
  expect(sim.bloqueadas).toEqual([])
  expect(problemas, `Problemas de largura no celular:\n${problemas.join("\n")}`).toEqual([])
})

test("celular de verdade: venda em montagem e página da cliente", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000)
  test.skip(info.project.name !== "celular-toque", "só vale com toque e viewport mobile")
  const problemas = []
  await montar(context, baseURL, { status: "em_aberto" })
  await page.goto(`/vendas/${sim.pedido.id}`)
  await expect(page.getByRole("textbox", { name: "Nome", exact: true })).toBeVisible()
  await conferir(page, "Venda", problemas)
  await passo(page, "Resumo da venda", problemas, async () => {
    await toque(page.getByRole("button", { name: "Resumo", exact: true }))
    await conferir(page, "Resumo da venda", problemas)
    await fechar(page)
  })
  await passo(page, "Marcar como pago", problemas, async () => {
    await page.goto(`/vendas/${sim.pedido.id}`)
    await toque(page.getByRole("button", { name: "Resumo", exact: true }))
    await toque(page.getByRole("button", { name: "Pago", exact: true }).filter({ visible: true }))
    await expect(page.getByRole("dialog", { name: "Marcar como pago", exact: true })).toBeVisible()
    await conferir(page, "Marcar como pago", problemas)
  })
  const token = (await sim.one("select token_publico from pedidos where id=$1", [sim.pedido.id]))?.token_publico
  if (token) {
    await page.goto(`/r/${token}`)
    await page.waitForLoadState("networkidle")
    await conferir(page, "Página da cliente (romaneio)", problemas)
  }
  expect(problemas, `Problemas de largura no celular:\n${problemas.join("\n")}`).toEqual([])
})

test("celular de verdade: troca (peça em falta) e acerto sem alargar a página", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000)
  test.skip(info.project.name !== "celular-toque", "só vale com toque e viewport mobile")
  const problemas = []
  sim = await criarSimulacao({ troca: true })
  await sim.banco.query("update pedido_itens set foto_url=$2, nome='Anel espiral de zircônia com nome de peça bem comprido para ocupar várias linhas', sku='ANEL-ESPIRAL-ZIRCONIA-COM-NOME-DE-CODIGO-MUITO-LONGO-18' where id=$1", [sim.item.id, FOTO])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: /Editar troca|Continuar troca/ }).first()).toBeVisible()
  await conferir(page, "Pedido com troca", problemas)
  await toque(page.getByRole("button", { name: /Editar troca|Continuar troca/ }).first())
  await expect(page.getByRole("dialog")).toBeVisible()
  await conferir(page, "Janela da troca", problemas)
  expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([]) // a troca pede o catálogo à Edge (bloqueada)
  expect(problemas, `Problemas de largura no celular:\n${problemas.join("\n")}`).toEqual([])
})
