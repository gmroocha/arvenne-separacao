import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { DADOS_COMPLETOS } from "../banco/fixtures.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Reabrir pedido concluído: só o gestor volta um pedido de Concluídos para uma etapa anterior (Concluídos e tela do pedido).
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

let contador = 0
// Pedido pago que andou pela esteira inteira e está Concluído (status enviado), com rastreio e, se pedido, entregue.
async function concluido({ nome, origem = "whatsapp", entregue = false, cidade = "Campinas", uf = "SP" }) {
  const b = sim.banco
  contador += 1
  const cols = Object.keys(DADOS_COMPLETOS)
  const p = (await b.query("insert into pedidos(origem,status,cliente_nome,numero) values ('whatsapp','em_aberto',$1,$2) returning id", [nome, `R${contador}`])).rows[0]
  await b.query("update pedidos set " + cols.map((c, i) => c + "=$" + (i + 2)).join(",") + " where id=$1", [p.id, ...cols.map((c) => DADOS_COMPLETOS[c])])
  await b.query("update pedidos set cliente_nome=$2 where id=$1", [p.id, nome])
  if (origem === "shopify") await b.query("update pedidos set origem='shopify',shopify_order_id=$2 where id=$1", [p.id, 6000 + contador])
  await b.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values ($1,'avulso','Anel','A1',1,10)", [p.id])
  await b.query("update pedidos set status='novo',pago_em=now(),valor_pago=10,forma_pagamento='Pix' where id=$1", [p.id])
  await b.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=1 where pedido_id=$1", [p.id])
  for (const s of ["bipagem", "faturamento"]) await b.query("update pedidos set status=$2 where id=$1", [p.id, s])
  await b.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),entrega_cidade=$2,entrega_uf=$3,rastreio_url='https://rastreio.exemplo/R1' where id=$1", [p.id, cidade, uf])
  await b.query("update pedidos set embalado_em=now() where id=$1", [p.id])
  await b.query("update pedidos set frete_gerado_em=now() where id=$1", [p.id])
  await b.query("update pedidos set postado_em=now()-interval '3 hours' where id=$1", [p.id])
  if (origem !== "shopify") await b.query("update pedidos set rastreio_enviado_em=now() where id=$1", [p.id])
  if (entregue) await b.query("update pedidos set entregue_em=now()-interval '1 hour' where id=$1", [p.id])
  return p.id
}

const abrirMais = (escopo) => escopo.getByRole("button", { name: "Mais ações" }).click()
const itemMenu = (page, nome) => page.getByRole("menuitem", { name: nome, exact: true }).or(page.getByRole("button", { name: nome, exact: true }))
const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test("Concluídos: gestor reabre um pedido em Embalagem e frete e ele volta para a Expedição", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  const id = await concluido({ nome: "Ana Souza" })
  await concluido({ nome: "Carla Dias", entregue: true, cidade: "Curitiba", uf: "PR" })
  await sim.instalar(context, baseURL)
  await page.goto("/concluidos")
  const cartao = page.getByRole("listitem").filter({ hasText: "Ana Souza" })
  await expect(cartao).toBeVisible()
  await abrirMais(cartao)
  await expect(page.getByText("Mover para outra etapa")).toBeVisible()
  await expect(itemMenu(page, "Enviar rastreio")).toBeVisible()
  await expect(itemMenu(page, "Concluído")).toHaveCount(0)
  await semRolagemLateral(page)
  await capturarTemas(page, "reabrir-menu-concluidos", info)
  await itemMenu(page, "Embalagem e frete").click()
  const dialogo = page.getByRole("dialog", { name: "Reabrir em Embalagem e frete?" })
  await expect(dialogo).toContainText("O que foi feito desta etapa em diante será desfeito (Embalagem e frete, Postagem, Enviar rastreio)")
  await expect(dialogo).toContainText("volta para a Expedição")
  await capturarTemas(page, "reabrir-dialogo-concluidos", info)
  await dialogo.getByRole("button", { name: "Reabrir pedido", exact: true }).click()
  await expect(page.getByRole("listitem").filter({ hasText: "Ana Souza" })).toHaveCount(0)
  const ped = await sim.one("select status,embalado_em,frete_gerado_em,postado_em,rastreio_enviado_em,nf_emitida_em,rastreio_url from pedidos where id=$1", [id])
  expect(ped.status).toBe("embalagem")
  expect([ped.embalado_em, ped.frete_gerado_em, ped.postado_em, ped.rastreio_enviado_em]).toEqual([null, null, null, null])
  expect(ped.nf_emitida_em).not.toBeNull()
  expect(ped.rastreio_url).toBe("https://rastreio.exemplo/R1")
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("heading", { name: "Ana Souza" })).toBeVisible()
  await expect(page.getByRole("main").getByRole("link", { name: "Expedição" })).toBeVisible()
  await expect(page.getByRole("main").getByRole("link", { name: "Concluídos" })).toHaveCount(0)
  await capturarTemas(page, "reabrir-pedido-na-expedicao", info)
  expect(sim.bloqueadas).toEqual([])
})

test("Concluídos: aba Entregues oferece desfazer entrega e reabrir; reabrir limpa a entrega", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  const id = await concluido({ nome: "Carla Dias", entregue: true, cidade: "Curitiba", uf: "PR" })
  await sim.instalar(context, baseURL)
  await page.goto("/concluidos?aba=entregues")
  const cartao = page.getByRole("listitem").filter({ hasText: "Carla Dias" })
  await abrirMais(cartao)
  await expect(itemMenu(page, "Desfazer entrega")).toBeVisible()
  await expect(page.getByText("Mover para outra etapa")).toBeVisible()
  await capturarTemas(page, "reabrir-menu-entregues", info)
  await itemMenu(page, "Postagem").click()
  await page.getByRole("dialog", { name: "Reabrir em Postagem?" }).getByRole("button", { name: "Reabrir pedido", exact: true }).click()
  await expect(page.getByRole("listitem").filter({ hasText: "Carla Dias" })).toHaveCount(0)
  const ped = await sim.one("select status,entregue_em,postado_em from pedidos where id=$1", [id])
  expect([ped.status, ped.entregue_em, ped.postado_em]).toEqual(["pronto_envio", null, null])
  expect(sim.bloqueadas).toEqual([])
})

test("Tela do pedido concluído: o menu ⋯ tem Mover para outra etapa; Shopify não oferece Enviar rastreio", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  const wa = await concluido({ nome: "Ana Souza" })
  const sh = await concluido({ nome: "Bia Lima", origem: "shopify", cidade: "Recife", uf: "PE" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sh}`)
  await expect(page.getByRole("heading", { name: "Bia Lima" })).toBeVisible()
  await abrirMais(page)
  await expect(page.getByText("Mover para outra etapa")).toBeVisible()
  await expect(itemMenu(page, "Postagem")).toBeVisible()
  await expect(itemMenu(page, "Enviar rastreio")).toHaveCount(0)
  await expect(itemMenu(page, "Concluir pedido")).toHaveCount(0)
  await capturarTemas(page, "reabrir-menu-pedido", info)
  await page.keyboard.press("Escape")

  await page.goto(`/pedidos/${wa}`)
  await abrirMais(page)
  await expect(itemMenu(page, "Enviar rastreio")).toBeVisible()
  await itemMenu(page, "Nota fiscal").click()
  const dialogo = page.getByRole("dialog", { name: "Reabrir em Nota fiscal?" })
  await expect(dialogo).toContainText("(Nota fiscal, Embalagem e frete, Postagem, Enviar rastreio)")
  await semRolagemLateral(page)
  await capturarTemas(page, "reabrir-dialogo-pedido", info)
  await dialogo.getByRole("button", { name: "Reabrir pedido", exact: true }).click()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [wa])).status).toBe("faturamento")
  // Já reaberto, o pedido não oferece mais "Reabrir": mostra o menu normal da esteira.
  await expect(page.getByRole("main")).toContainText("Nota fiscal")
  await expect(page.getByRole("button", { name: "Concluir etapa" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("funcionária não vê pedido concluído, nem o menu de reabrir", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo", papel: "funcionaria", responsavel: false })
  const id = await concluido({ nome: "Ana Souza" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByText("Este pedido não está com você")).toBeVisible()
  await expect(page.getByRole("button", { name: "Mais ações" })).toHaveCount(0)
  await page.goto("/concluidos")
  await expect(page).toHaveURL(/\/$/)
  expect((await sim.one("select status from pedidos where id=$1", [id])).status).toBe("enviado")
  expect(sim.bloqueadas).toEqual([])
})
