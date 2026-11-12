import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })
async function iniciar(context, baseURL, opcoes) {
  sim = await criarSimulacao(opcoes)
  await sim.instalar(context, baseURL, { logado: !opcoes?.troca && !opcoes?.somada })
  return sim
}
async function semQuebra(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
}

test("venda paga entra na expedição com o valor calculado pelo banco", async ({ page, context, baseURL }) => {
  await iniciar(context, baseURL, { status: "em_aberto" })
  await page.goto(`/vendas/${sim.pedido.id}`)
  await expect(page.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Cliente de teste")
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Resumo", exact: true }).click()
  await page.getByRole("button", { name: "Marcar como pago", exact: true }).filter({ visible: true }).click()
  const dialog = page.getByRole("dialog", { name: "Marcar como pago", exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Confirmar pagamento" }).click()
  await expect(page).toHaveURL(new RegExp(`/pedidos/${sim.pedido.id}$`))
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toBeVisible()
  const p = await sim.one("select status,valor_pago from pedidos where id=$1", [sim.pedido.id])
  expect(p.status).toBe("novo")
  expect(Number(p.valor_pago)).toBe(100)
  expect(sim.bloqueadas).toEqual([])
  await semQuebra(page)
})

test("separação, conferência, etiqueta e bipagem preservam as duas unidades", async ({ page, context, baseURL }) => {
  await iniciar(context, baseURL, { status: "novo" })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Achei", exact: true }).click()
  await page.getByRole("button", { name: "Ir para Conferência", exact: true }).click()
  await page.getByRole("button", { name: "Conferida", exact: true }).click()
  await page.getByRole("button", { name: "Ir para Etiquetagem", exact: true }).click()
  await page.getByRole("button", { name: "Etiquetada", exact: true }).click()
  await page.getByRole("button", { name: "Ir para Bipagem", exact: true }).click()
  const campo = page.getByRole("textbox", { name: "Código da peça" })
  await campo.fill("FORA-DO-PEDIDO"); await campo.press("Enter")
  await expect(page.getByText("SKU FORA-DO-PEDIDO não é deste pedido.")).toBeVisible()
  await campo.fill("AN-1"); await campo.press("Enter")
  await expect.poll(async () => Number((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada)).toBe(1)
  await campo.fill("AN-1"); await campo.press("Enter")
  await expect(page.getByRole("dialog").getByText("Bipagem concluída")).toBeVisible()
  await page.getByRole("button", { name: "Ir para Nota e frete" }).click()
  await expect(page.getByText("Nota fiscal", { exact: true })).toBeVisible()
  expect(Number((await sim.one("select qtd_bipada from pedido_itens where id=$1", [sim.item.id])).qtd_bipada)).toBe(2)
  expect(sim.bloqueadas).toEqual([])
  await semQuebra(page)
})

test("cliente escolhe troca, recupera falha e muda para crédito", async ({ page, context, baseURL }) => {
  await iniciar(context, baseURL, { troca: true })
  sim.falharProximaEscolha()
  await page.goto(`/t/${sim.troca.token}`)
  await page.getByRole("button", { name: "Quero esta", exact: true }).click()
  await expect(page.getByText("Falha simulada. Tente novamente.")).toBeVisible()
  await page.getByRole("button", { name: "Quero esta", exact: true }).click()
  await expect(page.getByText(/Você escolheu R\$\s*120,00 de R\$\s*80,00/)).toBeVisible()
  await page.getByRole("button", { name: "Diminuir NOVO-1" }).click()
  await expect(page.getByText(/Você escolheu R\$\s*60,00 de R\$\s*80,00/)).toBeVisible()
  await page.getByRole("button", { name: /Prefiro crédito/ }).click()
  await expect(page.getByRole("region", { name: "Resumo" }).getByText(/80,00/)).toBeVisible()
  expect((await sim.one("select escolha_tipo from troca_pecas where troca_id=$1", [sim.troca.id])).escolha_tipo).toBe("credito")
  expect(sim.bloqueadas).toEqual([])
  await semQuebra(page)
})

test("V06: atalho Trocar usa uma operação e cria a diferença a receber", async ({ page, context, baseURL }) => {
  await iniciar(context, baseURL)
  await sim.banco.query(`insert into catalogo_site(variant_id,produto_id,sku,produto,preco,status)
    select n,n,'CAT-'||n,case when n=1 then 'Nova de teste' else 'Outra peça '||n end,150,'ACTIVE'
    from generate_series(1,20) n`)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Mais opções", exact: true }).click()
  await page.getByText("Trocar", { exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Adicionar peça", exact: true })
  await dialog.getByPlaceholder("Buscar por nome ou código").fill("Nova de teste")
  await dialog.getByRole("button", { name: "Adicionar", exact: true }).click()
  await dialog.getByRole("button", { name: /^Salvar/ }).click()
  await expect.poll(async () => Number((await sim.one("select total from v_pedidos where id=$1", [sim.pedido.id])).total)).toBe(150)
  expect(Number((await sim.one("select saldo from v_pedido_acerto where pedido_id=$1", [sim.pedido.id])).saldo)).toBe(50)
  expect(sim.requisicoes.filter((r) => r.path.endsWith("/rpc/substituir_item"))).toHaveLength(1)
  expect(sim.requisicoes.some((r) => r.path.endsWith("/rpc/adicionar_itens"))).toBe(false)
  expect(sim.bloqueadas).toEqual([])
  await semQuebra(page)
})

test("V01: cliente continua vendo a compra no romaneio da venda somada", async ({ page, context, baseURL }, info) => {
  await iniciar(context, baseURL, { somada: true })
  await page.goto(`/r/${sim.vendaSomada.token_publico}`)
  await expect(page.getByText("Brinco somado", { exact: true })).toBeVisible()
  await expect(page.getByText("Colar somado", { exact: true })).toBeVisible()
  await expect(page.getByText(/Estas peças foram somadas ao pedido/)).toBeVisible()
  await expect(page.getByText(/60,00/, { exact: false })).toBeVisible()
  expect(Number((await sim.one("select total_geral from v_pedidos where id=$1", [sim.pedido.id])).total_geral)).toBe(160)
  expect(sim.bloqueadas).toEqual([])
  await semQuebra(page)
  mkdirSync("capturas", { recursive: true })
  await page.screenshot({ path: `capturas/romaneio-somada-${info.project.name}.png`, fullPage: true, animations: "disabled" })
})

test("vigia avisa sem alterar o pedido e mostra o detalhe", async ({ page, context, baseURL }, info) => {
  await iniciar(context, baseURL, { aviso: true })
  await page.goto("/")
  await expect(page.getByText(/aviso.*para conferir nos pedidos/)).toBeVisible()
  await page.getByRole("button", { name: "Ver avisos", exact: true }).click()
  await expect(page.getByRole("dialog").getByText("Há peças pendentes, em falta ou com trabalho incompleto nesta etapa.")).toBeVisible()
  expect((await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("faturamento")
  await expect(page.getByRole("dialog").getByText("A verificação só avisa. Nenhum pedido é alterado por ela.")).toBeInViewport({ ratio: 1 })
  mkdirSync("capturas", { recursive: true })
  await page.screenshot({ path: `capturas/vigia-${info.project.name}.png`, fullPage: true, animations: "disabled" })
  await semQuebra(page)
})

test("V31: Edge, Storage e RPC de escrita nunca chegam à rede real", async ({ page, context, baseURL }) => {
  await iniciar(context, baseURL)
  await page.goto("/")
  const paths = ["/functions/v1/catalogo-sync", "/storage/v1/object/fotos/arquivo.webp", "/rest/v1/rpc/funcao_nao_permitida"]
  const resultados = await page.evaluate(async ({ sb, paths }) => Promise.all(paths.map(async (path) => (await fetch(sb + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status)), { sb: SUPABASE_FICTICIO, paths })
  expect(resultados).toEqual([403, 403, 400]) // a RPC desconhecida é recusada pelo banco fictício
  expect(sim.bloqueadas).toHaveLength(2)
})
