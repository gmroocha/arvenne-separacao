import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

// Pedido de venda da LR no Bling: a função Edge `bling` é respondida de mentira (scripts/simulacao/bling.mjs); nenhuma
// chamada vai ao Bling, ao Supabase real ou usa segredo. O que a tela enviou fica em sim.bling.chamadas.
let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const FOTO = "https://simulacao.supabase.test/storage/v1/object/public/fotos/clube/anel.webp"

// Pedido na etapa Nota fiscal com duas peças (uma com recado), Bling conectado e dois produtos no Bling fictício.
async function preparar({ conectado = true, papel } = {}) {
  sim = await criarSimulacao({ status: "novo", papel })
  const id = sim.pedido.id
  await sim.banco.query("update pedido_itens set foto_url=$2, variante='N°14' where pedido_id=$1", [id, FOTO])
  await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,nota,ordem) values ($1,'avulso','Colar de teste','CO-3',1,40,'Gravar a letra M',1)", [id])
  await sim.banco.query("select mover_etapa($1,'faturamento')", [id])
  if (papel === "funcionaria") await sim.banco.query("update pedidos set responsaveis = jsonb_build_object('faturamento', (select id::text from equipe where papel='funcionaria' limit 1)) where id=$1", [id])
  sim.bling.produtos = { "ANEL-001": { nome: "Anel Liso", preco: 12.5 }, "COLAR-3": { nome: "Colar Fino", preco: 20 }, "BR-2": { nome: "Brinco Argola", preco: 8 } }
  if (conectado)
    await sim.banco.query("insert into bling_conexao(id, access_token, refresh_token, expira_em, contato_id, contato_nome) values (true,'t','r', now() + interval '6 hours', 77, 'Arvenne Pratas')")
  await sim.banco.query("insert into bling_codigos(sku, codigo_bling) values ('AN-1','ANEL-001')")
  return id
}
const LR = (id) => sim.one("select pedido_fornecedor_numero n, pedido_fornecedor_em em from pedidos where id=$1", [id])
const gerou = () => sim.bling.chamadas.filter((c) => c.acao === "gerar")

test("etapa Nota fiscal: gerar no Bling já com as peças do pedido, código lembrado e preço do cadastro", async ({ page, context, baseURL }, info) => {
  const id = await preparar()
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await page.getByRole("button", { name: "Gerar no Bling", exact: true }).click()
  const folha = page.getByRole("dialog", { name: "Gerar pedido no Bling" })
  // Confere sozinho ao abrir: o SKU AN-1 vira o código lembrado, a peça com recado fica em linha própria.
  await expect(folha.getByLabel("Código no Bling da linha 1")).toHaveValue("ANEL-001")
  await expect(folha.getByText("Anel Liso · código lembrado")).toBeVisible()
  await expect(folha.getByText("Recado: Gravar a letra M")).toBeVisible()
  await expect(folha.getByLabel("Quantidade da linha 1")).toHaveValue("2")
  await expect(folha.getByLabel("Preço da linha 1")).toHaveValue("12,50")
  // CO-3 não existe no Bling com esse código: fica em destaque e o botão de gerar espera a correção.
  await expect(folha.getByText("Não achei este código no Bling")).toBeVisible()
  await expect(folha.getByRole("button", { name: "Gerar pedido no Bling" })).toBeDisabled()
  await semRolagemLateral(page)
  await capturarTemas(page, "bling-etapa-erro", info)

  // Corrige o código, confere de novo (o app oferece lembrar), troca o preço da primeira linha e confere outra vez.
  await folha.getByLabel("Código no Bling da linha 2").fill("COLAR-3")
  await expect(folha.getByRole("button", { name: "Gerar pedido no Bling" })).toBeDisabled() // mudou: precisa conferir
  await expect(folha.getByLabel("Lembrar o código da linha 2 para as próximas")).toBeChecked()
  await folha.getByLabel("Preço da linha 1").fill("10,00")
  await folha.getByRole("button", { name: "Conferir no Bling" }).click()
  await expect(folha.getByLabel("Total no Bling")).toContainText(/R\$\s*40,00/) // 2 x 10 + 1 x 20, calculado pela função
  await expect(folha.getByText("Colar Fino")).toBeVisible()
  await capturarTemas(page, "bling-etapa", info)

  await folha.getByRole("button", { name: "Gerar pedido no Bling" }).click()
  const confirmar = page.getByRole("dialog", { name: "Gerar o pedido no Bling?" })
  await expect(confirmar).toContainText("Arvenne Pratas")
  await expect(confirmar).toContainText("3 em 2 linhas")
  await expect(confirmar).toContainText(/R\$\s*40,00/)
  await capturarTemas(page, "bling-confirmar", info)
  await confirmar.getByRole("button", { name: "Gerar agora" }).click()

  await expect.poll(async () => (await LR(id)).n).toBe("5001")
  expect((await LR(id)).em).not.toBeNull()
  expect(gerou()).toHaveLength(1)
  expect(gerou()[0]).toMatchObject({
    pedido_id: id, confirmar_repetido: false,
    itens: [{ sku: "AN-1", codigo: "ANEL-001", qtd: 2, valor: 10 }, { sku: "CO-3", codigo: "COLAR-3", qtd: 1, valor: 20 }],
    lembrar: [{ sku: "CO-3", codigo: "COLAR-3" }],
  })
  expect((await sim.one("select codigo_bling c from bling_codigos where sku='CO-3'")).c).toBe("COLAR-3")
  await expect(page.getByRole("dialog", { name: "Gerar pedido no Bling" })).toBeHidden()
  await expect(page.getByText("Pedido nº 5001 gerado no Bling")).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("etapa Nota fiscal: pedido que já tem um gerado só repete confirmando", async ({ page, context, baseURL }) => {
  const id = await preparar()
  await sim.banco.query("insert into bling_pedidos(pedido_id, bling_id, bling_numero, total, itens) values ($1, 1, '4000', 25, '[]')", [id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByText(/Gerado no Bling: nº 4000/)).toBeVisible()
  await page.getByRole("button", { name: "Gerar no Bling", exact: true }).click()
  const folha = page.getByRole("dialog", { name: "Gerar pedido no Bling" })
  await folha.getByLabel("Código no Bling da linha 2").fill("COLAR-3")
  await folha.getByRole("button", { name: "Conferir no Bling" }).click()
  await expect(folha.getByRole("alert", { name: "Pedido já gerado" })).toContainText("Nº 4000")
  await folha.getByRole("button", { name: "Gerar pedido no Bling" }).click()
  const confirmar = page.getByRole("dialog", { name: "Gerar o pedido no Bling?" })
  await expect(confirmar.getByRole("button", { name: "Gerar agora" })).toBeDisabled()
  await confirmar.getByLabel("Gerar mais um pedido mesmo assim").click()
  await confirmar.getByRole("button", { name: "Gerar agora" }).click()
  await expect.poll(async () => (await LR(id)).n).toBe("5001")
  expect(gerou()[0].confirmar_repetido).toBe(true)
  expect(sim.bloqueadas).toEqual([])
})

test("etapa Nota fiscal: erro do Bling aparece em português e nada é marcado como feito", async ({ page, context, baseURL }) => {
  const id = await preparar()
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await page.getByRole("button", { name: "Gerar no Bling", exact: true }).click()
  const folha = page.getByRole("dialog", { name: "Gerar pedido no Bling" })
  await folha.getByLabel("Código no Bling da linha 2").fill("COLAR-3")
  await folha.getByRole("button", { name: "Conferir no Bling" }).click()
  await expect(folha.getByLabel("Total no Bling")).toBeVisible()
  sim.bling.erro = { status: 502, mensagem: "O Bling pediu para esperar um pouco (muitas chamadas seguidas). Tente de novo em instantes." }
  await folha.getByRole("button", { name: "Gerar pedido no Bling" }).click()
  await page.getByRole("dialog", { name: "Gerar o pedido no Bling?" }).getByRole("button", { name: "Gerar agora" }).click()
  await expect(page.getByText(/pediu para esperar um pouco/)).toBeVisible()
  expect((await LR(id)).n).toBeNull()
  expect((await sim.one("select count(*)::int n from bling_pedidos")).n).toBe(0)
  // A janela continua aberta para tentar de novo.
  await expect(page.getByRole("dialog", { name: "Gerar o pedido no Bling?" })).toBeVisible()
})

test("etapa Nota fiscal: sem Bling conectado só avisa (o gestor ganha o link) e o fluxo manual segue", async ({ page, context, baseURL }, info) => {
  const id = await preparar({ conectado: false })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByText("Bling não conectado.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Gerar no Bling", exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Abrir PDV LR" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Copiar SKUs" })).toBeVisible()
  await capturarTemas(page, "bling-etapa-desconectado", info)
})

test("funcionária da etapa gera no Bling pelo pedido, mas não vê o menu nem a página PDV LR", async ({ page, context, baseURL }) => {
  const id = await preparar({ papel: "funcionaria" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${id}`)
  await expect(page.getByRole("button", { name: "Gerar no Bling", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Abrir PDV LR" })).toHaveCount(0)
  await page.getByRole("button", { name: "Gerar no Bling", exact: true }).click()
  const folha = page.getByRole("dialog", { name: "Gerar pedido no Bling" })
  await folha.getByLabel("Código no Bling da linha 2").fill("COLAR-3")
  await folha.getByRole("button", { name: "Conferir no Bling" }).click()
  await folha.getByRole("button", { name: "Gerar pedido no Bling" }).click()
  await page.getByRole("dialog", { name: "Gerar o pedido no Bling?" }).getByRole("button", { name: "Gerar agora" }).click()
  await expect.poll(async () => (await LR(id)).n).toBe("5001")
  await page.goto("/pdv-lr")
  await expect(page).toHaveURL(/\/$/)
})

test("página PDV LR: conectar (volta com code e state), escolher a Arvenne, colar lista, conferir e gerar", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  sim.bling.produtos = { "ANEL-001": { nome: "Anel Liso", preco: 12.5 }, "BR-2": { nome: "Brinco Argola", preco: 8 }, "CO-9": { nome: "Colar Nove", preco: 30 } }
  sim.bling.contatos = [{ id: 77, nome: "Arvenne Pratas", documento: "12.345.678/0001-90" }, { id: 78, nome: "Arvenne Outra", documento: "" }]
  await sim.banco.query("insert into bling_codigos(sku, codigo_bling) values ('AN-1','ANEL-001')")
  await sim.instalar(context, baseURL)
  await page.goto("/pdv-lr")
  await expect(page.getByText("Não conectado", { exact: true })).toBeVisible()
  await expect(page.getByText("Conecte o Bling e escolha o cliente para gerar pedidos.")).toBeVisible()
  await semRolagemLateral(page)
  await capturarTemas(page, "pdv-lr-desconectado", info, { fullPage: true })

  // O Bling devolve para cá com ?code&state; a página troca por tokens (de mentira) e já oferece a escolha do cliente.
  await page.goto("/pdv-lr?code=codigo-do-bling&state=estado-123")
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/pdv-lr$/)
  expect(sim.bling.chamadas.find((c) => c.acao === "conectar_fim")).toMatchObject({ code: "codigo-do-bling", state: "estado-123" })
  await page.getByLabel("Buscar cliente no Bling").fill("Arvenne")
  await page.getByRole("button", { name: "Buscar", exact: true }).click()
  await page.getByRole("button", { name: "Escolher Arvenne Pratas" }).click()
  await expect(page.getByText("Cliente dos pedidos:")).toContainText("Arvenne Pratas")

  // Cola uma lista (formatos misturados, repetido soma), confere e gera.
  await page.getByRole("button", { name: "Colar lista" }).click()
  await page.getByLabel("Lista de peças").fill("AN-1 x2\nBR-2 3\n2 CO-9\nan-1 x1")
  await page.getByRole("button", { name: "Adicionar à lista" }).click()
  await expect(page.getByLabel("Código no Bling da linha 1")).toHaveValue("AN-1")
  await expect(page.getByLabel("Quantidade da linha 1")).toHaveValue("3")
  await page.getByRole("button", { name: "Conferir no Bling" }).click()
  await expect(page.getByLabel("Código no Bling da linha 1")).toHaveValue("ANEL-001")
  await expect(page.getByLabel("Total no Bling")).toContainText(/R\$\s*121,50/) // 3 x 12,50 + 3 x 8 + 2 x 30
  await semRolagemLateral(page)
  await capturarTemas(page, "pdv-lr-montado", info, { fullPage: true })
  await page.getByRole("button", { name: "Gerar pedido no Bling" }).click()
  await page.getByRole("dialog", { name: "Gerar o pedido no Bling?" }).getByRole("button", { name: "Gerar agora" }).click()
  await expect(page.getByRole("alert", { name: "Pedido gerado no Bling" })).toContainText("nº 5001")
  expect(gerou()[0].pedido_id).toBeUndefined()
  expect(gerou()[0].itens.map((i) => [i.codigo, i.qtd, i.valor])).toEqual([["ANEL-001", 3, 12.5], ["BR-2", 3, 8], ["CO-9", 2, 30]])
  // Pedido da aba não mexe em nenhum pedido da esteira.
  expect((await sim.one("select pedido_fornecedor_em em from pedidos where id=$1", [sim.pedido.id])).em).toBeNull()

  await page.getByRole("button", { name: "Montar outro pedido" }).click()
  await expect(page.getByRole("list", { name: "Pedidos gerados no Bling" })).toContainText("Nº 5001")
  await expect(page.getByRole("list", { name: "Pedidos gerados no Bling" })).toContainText("ANEL-001 ×3, BR-2 ×3, CO-9 ×2")
  await capturarTemas(page, "pdv-lr-gerado", info, { fullPage: true })

  // Códigos lembrados: ver, trocar e apagar.
  const lista = page.getByRole("list", { name: "Códigos lembrados" })
  await expect(lista).toContainText("AN-1")
  await page.getByRole("button", { name: "Trocar o código de AN-1" }).click()
  await page.getByLabel("Código no Bling de AN-1").fill("ANEL-002")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect.poll(async () => (await sim.one("select codigo_bling c from bling_codigos where sku='AN-1'")).c).toBe("ANEL-002")
  // O aviso verde de "Código atualizado" fica por cima do botão no celular: clica sem esperar ele sumir.
  await page.getByRole("button", { name: "Apagar o código lembrado de AN-1" }).dispatchEvent("click")
  await expect.poll(async () => (await sim.one("select count(*)::int n from bling_codigos")).n).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

test("página PDV LR: o botão Conectar pede a URL de autorização à função (sem segredo na tela)", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo", papel: "gestor" })
  await sim.instalar(context, baseURL)
  await page.goto("/pdv-lr")
  await page.getByRole("button", { name: "Conectar ao Bling" }).click()
  await expect.poll(() => sim.bling.chamadas.some((c) => c.acao === "conectar_inicio")).toBe(true)
  // A ida ao Bling é a única saída bloqueada pela barreira (nenhuma chamada real).
  await expect.poll(() => sim.bloqueadas.length).toBeGreaterThan(0)
  expect(sim.bloqueadas.every((u) => u.startsWith("https://www.bling.com.br/Api/v3/oauth/authorize"))).toBe(true)
})
