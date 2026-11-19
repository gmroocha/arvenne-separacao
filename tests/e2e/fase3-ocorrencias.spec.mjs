import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { DADOS_COMPLETOS } from "../banco/fixtures.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Fase 3: erro na Bipagem pelo menu da peça e o Sheet de Concluídos com "Quem fez" e "Registrar problema na entrega".
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

let contador = 0
// Pedido pago do WhatsApp com duas peças, andando pela esteira até `ate` ("bipagem" ou "enviado"), com Ana na separação e Bia na nota.
async function pedido({ nome, ate }) {
  const b = sim.banco
  contador += 1
  const cols = Object.keys(DADOS_COMPLETOS)
  const ana = (await b.query("insert into equipe(nome,papel) values ('Ana Separadora','funcionaria') returning id")).rows[0].id
  const bia = (await b.query("insert into equipe(nome,papel) values ('Bia da Nota','funcionaria') returning id")).rows[0].id
  const p = (await b.query("insert into pedidos(origem,status,cliente_nome,numero) values ('whatsapp','em_aberto',$1,$2) returning id", [nome, `F${contador}`])).rows[0]
  await b.query("update pedidos set " + cols.map((c, i) => c + "=$" + (i + 2)).join(",") + " where id=$1", [p.id, ...cols.map((c) => DADOS_COMPLETOS[c])])
  await b.query("update pedidos set cliente_nome=$2 where id=$1", [p.id, nome])
  await b.query("insert into pedido_itens(pedido_id,origem,nome,sku,variante,qtd,preco,ordem) values ($1,'avulso','Anel','A1','Aro 16',1,10,0),($1,'avulso','Colar','C1','45 cm',1,10,1)", [p.id])
  await b.query("update pedidos set status='novo',pago_em=now(),valor_pago=20,forma_pagamento='Pix' where id=$1", [p.id])
  await b.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),separado_por=$2,conferido_por=$2 where pedido_id=$1", [p.id, ana])
  await b.query("update pedidos set status='bipagem' where id=$1", [p.id])
  if (ate === "enviado") {
    await b.query("update pedido_itens set qtd_bipada=1,bipado_em=now() where pedido_id=$1", [p.id])
    await b.query("update pedidos set status='faturamento' where id=$1", [p.id])
    await b.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),responsaveis=jsonb_build_object('faturamento',$2::text) where id=$1", [p.id, bia])
    await b.query("update pedidos set embalado_em=now(),frete_gerado_em=now() where id=$1", [p.id])
    await b.query("update pedidos set postado_em=now()-interval '3 hours',rastreio_url='https://rastreio.exemplo/F1',rastreio='AA123' where id=$1", [p.id])
    await b.query("update pedidos set rastreio_enviado_em=now() where id=$1", [p.id])
  }
  return { id: p.id, ana, bia }
}

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test("Bipagem: Erro na peça pelo menu manda a peça de volta para a Separação e registra a separadora", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  const { id, ana } = await pedido({ nome: "Marina Alves", ate: "bipagem" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("heading", { name: "Marina Alves" })).toBeVisible()
  await page.getByRole("button", { name: "Mais opções" }).first().click()
  await page.getByRole("menuitem", { name: "Erro na peça" }).or(page.getByRole("button", { name: "Erro na peça" })).click()
  const dialogo = page.getByRole("dialog", { name: "Erro na peça" })
  await expect(dialogo).toBeVisible()
  const continuar = dialogo.getByRole("button", { name: "Continuar", exact: true })
  await expect(continuar).toBeDisabled()
  await dialogo.getByRole("radio", { name: "Outro" }).click()
  await expect(continuar).toBeDisabled() // "Outro" pede o texto
  await dialogo.getByRole("textbox", { name: "O que aconteceu" }).fill("fecho quebrado")
  await dialogo.getByRole("radio", { name: "Peça suja" }).click()
  await expect(dialogo.getByRole("textbox", { name: "O que aconteceu" })).toHaveCount(0)
  await expect(dialogo.getByRole("combobox", { name: "Separada por" })).toContainText("Ana Separadora")
  await semRolagemLateral(page)
  await capturarTemas(page, "fase3-erro-peca", info)
  await continuar.click()
  await expect(dialogo).toBeHidden()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [id])).status).toBe("separacao")
  const o = await sim.one("select tipo,motivo,etapa,responsavel_id,observacao from ocorrencias where pedido_id=$1", [id])
  expect(o).toEqual({ tipo: "erro_bipagem", motivo: "peca_suja", etapa: "separacao", responsavel_id: ana, observacao: null })
  const itens = (await sim.banco.query("select sku,status,conferido_em,separado_por from pedido_itens where pedido_id=$1 order by ordem", [id])).rows
  expect(itens[0]).toMatchObject({ sku: "A1", status: "pendente", conferido_em: null, separado_por: null })
  expect(itens[1].status).toBe("encontrado")
  // O pedido aparece na Separação e mostra o cartão discreto de ocorrências.
  const cartao = page.getByRole("region", { name: "Ocorrências do pedido" }).or(page.getByLabel("Ocorrências do pedido"))
  await expect(cartao).toContainText("Erro na bipagem")
  await expect(cartao).toContainText("De Ana Separadora")
  await semRolagemLateral(page)
  await capturarTemas(page, "fase3-pedido-com-ocorrencia", info)
  expect(sim.bloqueadas).toEqual([])
})

test("Concluídos: tocar na linha abre o Sheet com peças e quem fez; registrar problema na entrega e anular", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  const { id, bia } = await pedido({ nome: "Carla Dias", ate: "enviado" })
  await sim.instalar(context, baseURL)
  await page.goto("/concluidos")
  const linha = page.getByRole("listitem").filter({ hasText: "Carla Dias" })
  await expect(linha).toBeVisible()
  await linha.getByText(/postado há/).click()
  const sheet = page.getByRole("dialog", { name: "Carla Dias" })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText("A1", { exact: true })).toBeVisible()
  await expect(sheet.getByText("Aro 16")).toBeVisible()
  await expect(sheet.getByText("separada por Ana Separadora")).toHaveCount(2)
  const quemFez = sheet.getByRole("region", { name: "Quem fez" })
  await expect(quemFez).toContainText("Nota fiscal")
  await expect(quemFez).toContainText("Bia da Nota")
  await expect(sheet.getByText("Nenhum problema registrado neste pedido.")).toBeVisible()
  await expect(sheet).not.toContainText("R$")
  await capturarTemas(page, "fase3-concluidos-sheet", info)

  await sheet.getByRole("button", { name: "Registrar problema na entrega" }).click()
  const dialogo = page.getByRole("dialog", { name: "Problema na entrega" })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole("radio", { name: "Nota errada" }).click()
  await expect(dialogo.getByRole("combobox", { name: "Etapa onde o erro aconteceu" })).toContainText("Nota fiscal")
  await expect(dialogo.getByRole("combobox", { name: "Quem fez essa etapa" })).toContainText("Bia da Nota")
  await dialogo.getByRole("textbox", { name: "Observação" }).fill("CPF errado na nota")
  await capturarTemas(page, "fase3-problema-entrega", info)
  await dialogo.getByRole("button", { name: "Registrar problema", exact: true }).click()
  await expect(dialogo).toBeHidden()
  const o = await sim.one("select tipo,motivo,etapa,responsavel_id,observacao from ocorrencias where pedido_id=$1", [id])
  expect(o).toEqual({ tipo: "problema_entrega", motivo: "nota_errada", etapa: "faturamento", responsavel_id: bia, observacao: "CPF errado na nota" })
  const lista = sheet.getByRole("region", { name: "Ocorrências" })
  await expect(lista).toContainText("Problema na entrega")
  await expect(lista).toContainText("De Bia da Nota")
  await expect(lista).toContainText("CPF errado na nota")
  await capturarTemas(page, "fase3-concluidos-ocorrencia", info)

  await lista.getByRole("button", { name: "Anular" }).click()
  await expect(lista.getByText("Anulada")).toBeVisible()
  expect((await sim.one("select anulada_em is not null as a from ocorrencias where pedido_id=$1", [id])).a).toBe(true)
  expect(sim.bloqueadas).toEqual([])
})
