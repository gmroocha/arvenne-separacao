import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { DADOS_COMPLETOS } from "../banco/fixtures.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

let contador = 0
// Cria um pedido já pago e andando pela esteira até a etapa pedida, com a cliente, a cidade e o rastreio.
async function criar({ nome, origem = "whatsapp", etapa = "enviado", cidade = "São Paulo", uf = "SP", entregue = false, rastreioUrl = "https://rastreio.exemplo/X1" }) {
  const b = sim.banco
  contador += 1
  const cols = Object.keys(DADOS_COMPLETOS)
  const p = (await b.query("insert into pedidos(origem,status,cliente_nome,numero) values ('whatsapp','em_aberto',$1,$2) returning id", [nome, `T${contador}`])).rows[0]
  const sets = cols.map((c, i) => c + "=$" + (i + 2)).join(",")
  await b.query("update pedidos set " + sets + " where id=$1", [p.id, ...cols.map((c) => DADOS_COMPLETOS[c])])
  await b.query("update pedidos set cliente_nome=$2 where id=$1", [p.id, nome])
  if (origem === "shopify") await b.query("update pedidos set origem='shopify',shopify_order_id=$2 where id=$1", [p.id, 5000 + contador])
  await b.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values ($1,'avulso','Anel','A1',1,10)", [p.id])
  await b.query("update pedidos set status='novo',pago_em=now(),valor_pago=10,forma_pagamento='Pix' where id=$1", [p.id])
  await b.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=1 where pedido_id=$1", [p.id])
  await b.query("update pedidos set status='bipagem' where id=$1", [p.id])
  await b.query("update pedidos set status='faturamento' where id=$1", [p.id])
  await b.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),entrega_cidade=$2,entrega_uf=$3,rastreio_url=$4 where id=$1", [p.id, cidade, uf, rastreioUrl])
  await b.query("update pedidos set embalado_em=now() where id=$1", [p.id])
  await b.query("update pedidos set frete_gerado_em=now() where id=$1", [p.id])
  await b.query("update pedidos set postado_em=now()-interval '3 hours' where id=$1", [p.id])
  if (etapa === "enviado" && origem !== "shopify") await b.query("update pedidos set rastreio_enviado_em=now() where id=$1", [p.id])
  if (entregue) await b.query("update pedidos set entregue_em=now()-interval '1 hour' where id=$1", [p.id])
  return p.id
}

// V107: a coluna laranja "Enviar rastreio" na Expedição e o cartão do pedido que espera a mensagem.
test("V107: a Expedição tem a coluna laranja Enviar rastreio só com pedido do WhatsApp já postado", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await criar({ nome: "Ana Souza", etapa: "enviar_rastreio" })
  await criar({ nome: "Bia Lima", origem: "shopify", etapa: "enviado" })
  await sim.instalar(context, baseURL)
  await page.goto("/?etapa=enviar_rastreio")
  const coluna = page.getByRole("region", { name: "Enviar rastreio" })
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await coluna.scrollIntoViewIfNeeded()
    await expect(coluna.getByRole("link", { name: /Ana Souza/ })).toBeVisible()
    await expect(page.getByText("Bia Lima")).toHaveCount(0)
    // Pedido já postado não mostra prazo vencido.
    await expect(coluna.getByText(/venc|atras/i)).toHaveCount(0)
  } else {
    await expect(page.getByRole("button", { name: /Enviar rastreio/ })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("link", { name: /Ana Souza/ })).toBeVisible()
  }
  await capturarTemas(page, "expedicao-rastreio", info)
  await page.getByRole("link", { name: /Ana Souza/ }).first().click()
  await expect(page.getByRole("button", { name: "Mensagem enviada", exact: true })).toBeVisible()
  await capturarTemas(page, "etapa-enviar-rastreio", info)
  expect(sim.bloqueadas).toEqual([])
})

// V108: Concluídos só tem A caminho e Entregues, com cartão simples e ações no lugar.
test("V108: Concluídos com abas simples, cartão com cidade e tempo, desfazer no menu", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await criar({ nome: "Ana Souza", cidade: "Campinas", uf: "SP" })
  await criar({ nome: "Bia Lima", origem: "shopify", cidade: "Recife", uf: "PE" })
  await criar({ nome: "Carla Dias", entregue: true, cidade: "Curitiba", uf: "PR" })
  await sim.instalar(context, baseURL)
  await page.goto("/concluidos")
  await expect(page.getByRole("tab", { name: "A caminho (2)" })).toHaveAttribute("data-state", "active")
  await expect(page.getByRole("tab", { name: "Entregues (1)" })).toBeVisible()
  await expect(page.getByRole("tab")).toHaveCount(2)
  const cartao = page.getByRole("listitem").filter({ hasText: "Ana Souza" })
  await expect(cartao).toContainText("Campinas/SP")
  await expect(cartao).toContainText("WhatsApp")
  await expect(cartao).toContainText(/postado há \d+ h/)
  await expect(cartao.getByRole("link", { name: "Abrir rastreio" })).toHaveAttribute("href", "https://rastreio.exemplo/X1")
  await expect(cartao.getByRole("button", { name: "Marcar entregue" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Desfazer mensagem enviada" })).toHaveCount(0)
  // Sem rolagem lateral.
  const largura = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
  expect(largura.s).toBeLessThanOrEqual(largura.c)
  await capturarTemas(page, "concluidos-redesenhado", info)
  // Busca por nome ou número.
  await page.getByRole("textbox", { name: "Número, cliente ou telefone" }).fill("Bia")
  await expect(page.getByRole("link", { name: "Bia Lima" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ana Souza" })).toHaveCount(0)
  await page.getByRole("textbox", { name: "Número, cliente ou telefone" }).fill("")
  // Marcar entregue passa para Entregues; desfazer pelo menu "..." volta.
  await cartao.getByRole("button", { name: "Marcar entregue" }).click()
  await expect(page.getByRole("tab", { name: "A caminho (1)" })).toBeVisible()
  await page.getByRole("tab", { name: "Entregues (2)" }).click()
  const entregue = page.getByRole("listitem").filter({ hasText: "Carla Dias" })
  await expect(entregue).toContainText(/entregue há/)
  await capturarTemas(page, "concluidos-entregues", info)
  await entregue.getByRole("button", { name: "Mais ações" }).click()
  await page.getByRole("menuitem", { name: "Desfazer entrega" }).or(page.getByRole("button", { name: "Desfazer entrega", exact: true })).click()
  await expect(page.getByRole("tab", { name: "A caminho (2)" })).toBeVisible()
  expect((await sim.one("select entregue_em from pedidos where cliente_nome='Carla Dias'")).entregue_em).toBeNull()
  expect(sim.bloqueadas).toEqual([])
})
