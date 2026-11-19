import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Fase 4: página de Indicadores (só gestor). Os números vêm das funções do banco; a tela só exibe.
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const abrirMenu = async (page) => {
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
}
const cartao = (page, rotulo) => page.locator('[data-slot="indicador"]').filter({ hasText: rotulo })

// Um pedido já enviado (separação e conferência da Ana) e o pedido semeado parado na Separação, com um problema na cliente.
async function semear() {
  const { banco } = sim
  const ana = (await banco.query("insert into equipe (nome, papel, email) values ('Ana','funcionaria','ana@x.test') returning id")).rows[0].id
  const p = (await banco.query(`insert into pedidos (origem, status, cliente_nome, pago_em, postado_em, responsaveis)
    values ('whatsapp','novo','Cliente enviada', now() - interval '1 day', now(), $1::jsonb) returning id`, [JSON.stringify({ separacao: ana, conferencia: ana })])).rows[0].id
  await banco.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status, separado_por, conferido_em, conferido_por) values ($1,'avulso','Anel','A1',2,50,'encontrado',$2,now(),$2)", [p, ana])
  await banco.exec("alter table pedidos disable trigger pedidos_antes; alter table pedidos disable trigger pedidos_depois")
  await banco.query("update pedidos set status='enviar_rastreio' where id=$1", [p])
  await banco.exec("alter table pedidos enable trigger pedidos_antes; alter table pedidos enable trigger pedidos_depois")
  await banco.query("delete from pedido_eventos where pedido_id=$1", [p])
  await banco.query(`insert into pedido_eventos (pedido_id, tipo, para, created_at) values
    ($1,'status','separacao', now() - interval '3 hours'), ($1,'status','conferencia', now() - interval '2 hours'),
    ($1,'status','bipagem', now() - interval '1 hour'), ($1,'status','enviar_rastreio', now() - interval '30 minutes')`, [p])
  await banco.query("insert into ocorrencias (pedido_id, tipo, motivo, etapa, responsavel_id) values ($1,'problema_entrega','peca_errada','bipagem',$2)", [p, ana])
  await banco.query("update pedidos set status_desde = now() - interval '3 days' where id=$1", [sim.pedido.id])
}

test("gestor: vê os seis números, a fila, o tempo por etapa, as colaboradoras e a pontuação", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "separacao", papel: "gestor" })
  await semear()
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await abrirMenu(page)
  await page.getByRole("link", { name: "Indicadores", exact: true }).click()
  await expect(page).toHaveURL(/\/indicadores$/)
  await expect(page.getByRole("heading", { name: "Indicadores" })).toBeVisible()
  await page.getByRole("tab", { name: "7 dias" }).click()

  await expect(cartao(page, "Enviados no prazo")).toContainText("100%")
  await expect(cartao(page, "Enviados no prazo")).toContainText("1 de 1 pedido ")
  await expect(cartao(page, "Enviados").last()).toContainText("1 pedido")
  await expect(cartao(page, "Erros a cada 100 peças")).toContainText("0")
  await expect(cartao(page, "Problemas na cliente")).toContainText("1")
  await expect(cartao(page, "Erros pegos antes da cliente")).toContainText("0%")
  await expect(cartao(page, "Gargalo")).toContainText(/Separação|Conferência|Bipagem/)

  // Fila: o pedido semeado está na Separação e é o mais antigo dela.
  const fila = page.getByRole("link", { name: /Separação: 1 pedidos/ })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText("Mais antigo")
  await expect(fila).toContainText("há 3 d")
  await expect(page.getByText("Enquanto as colaboradoras não têm login, quem fez = responsável da etapa.")).toBeVisible()
  await expect(page.getByText("Bônus: 85 pontos ou mais e nenhum problema na cliente.", { exact: false })).toBeVisible()
  await expect(page.getByText("Ana", { exact: true }).first()).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "indicadores", info, { fullPage: true })

  await fila.click()
  await expect(page).toHaveURL(/\/\?etapa=separacao/)
  expect(sim.bloqueadas).toEqual([])
})

test("funcionária: não vê o item no menu e a rota volta para a Expedição", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "separacao", papel: "funcionaria" })
  await sim.instalar(context, baseURL)
  await page.goto("/")
  await abrirMenu(page)
  await expect(page.getByRole("link", { name: "Indicadores", exact: true })).toHaveCount(0)
  await page.goto("/indicadores")
  await expect(page.getByRole("heading", { name: "Expedição" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  expect(sim.bloqueadas).toEqual([])
})

test("gestor sem movimento: estado vazio amigável", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  await sim.instalar(context, baseURL)
  await page.goto("/indicadores")
  await expect(page.getByText("Sem movimento neste período")).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "indicadores-vazio", info)
})
