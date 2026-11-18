import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Na janela da troca, sem peça para trocar: "Reembolso ou crédito" fica à vista (antes só "Dar crédito" no painel
// de opções, recolhido no celular) e a confirmação já pergunta o destino: reembolsar ou guardar.
for (const [botao, situacao] of [["Reembolsar", "reembolso_pendente"], ["Guardar para o próximo pedido", "credito_guardado"]]) {
  test(`troca: reembolso ou crédito direto na janela (${botao})`, async ({ page, context, baseURL }) => {
    sim = await criarSimulacao({ troca: true })
    // Outra peça segue no pedido (só o anel vira crédito).
    await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status,ordem) values ($1,'avulso','Colar','CO-9',1,10,'pendente',5)", [sim.pedido.id])
    await sim.instalar(context, baseURL, { logado: true })
    await page.goto(`/pedidos/${sim.pedido.id}`)
    await page.getByRole("button", { name: /Editar troca|Continuar troca/ }).first().click()
    const janela = page.getByRole("dialog", { name: "Troca de peças em falta" })
    await janela.getByRole("button", { name: "Reembolso ou crédito" }).first().click()
    const conf = page.getByRole("dialog", { name: "Reembolso ou crédito?" })
    await conf.getByRole("button", { name: botao, exact: true }).click()
    await expect(conf).toBeHidden()
    await expect.poll(async () => (await sim.one("select situacao from v_creditos_cliente where pedido_id=$1", [sim.pedido.id]))?.situacao).toBe(situacao)
    expect((await sim.one("select acerto_status from trocas where id=$1", [sim.troca.id])).acerto_status).toBe("credito_registrado")
    // A janela da troca tenta atualizar o catálogo sozinha (função Edge): no simulador ela é barrada, como deve.
    expect(sim.bloqueadas.filter((u) => !u.endsWith("/functions/v1/catalogo-sync"))).toEqual([])
  })
}

// Direto no cartão "Avise a cliente", antes de montar ou enviar a troca: "Reembolso ou crédito" na peça em falta.
test("avisar cliente: reembolso direto no cartão da peça, sem montar a troca", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status,ordem) values ($1,'avulso','Colar','CO-9',1,10,'pendente',5)", [sim.pedido.id])
  await sim.banco.exec("set session_replication_role = replica")
  await sim.banco.query("update pedido_itens set status='falta' where id=$1", [sim.item.id])
  await sim.banco.query("update pedidos set status='avisar_cliente', etapa_antes_desvio='separacao' where id=$1", [sim.pedido.id])
  await sim.banco.exec("set session_replication_role = origin")
  await sim.instalar(context, baseURL, { logado: true })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  expect(await sim.one("select count(*)::int n from trocas where pedido_id=$1", [sim.pedido.id])).toEqual({ n: 0 })
  const cartao = page.getByText("Avise a cliente").locator("xpath=ancestor::*[@data-slot='card'][1]")
  await expect(cartao.getByRole("button", { name: "Reembolso ou crédito" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `capturas/avisar-reembolso-${info.project.name}.png`, fullPage: true, animations: "disabled" })
  await cartao.getByRole("button", { name: "Reembolso ou crédito" }).click()
  const conf = page.getByRole("dialog", { name: "Reembolso ou crédito?" })
  await expect(conf).toContainText("AN-1")
  await conf.getByRole("button", { name: "Reembolsar", exact: true }).click()
  await expect(conf).toBeHidden()
  await expect.poll(async () => (await sim.one("select status from pedido_itens where id=$1", [sim.item.id])).status).toBe("removido")
  const t = await sim.one("select escolha_tipo, escolhida_por from troca_pecas where item_id=$1", [sim.item.id])
  expect(t).toEqual({ escolha_tipo: "credito", escolhida_por: "equipe" })
  await expect.poll(async () => (await sim.one("select situacao from v_creditos_cliente where pedido_id=$1", [sim.pedido.id]))?.situacao).toBe("reembolso_pendente")
  await expect(page.getByText("Avise a cliente")).toHaveCount(0)
  expect(sim.bloqueadas).toEqual([])
})

test("avisar cliente: troca já enviada sem resposta também aceita crédito direto no cartão", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ troca: true })
  await sim.banco.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status,ordem) values ($1,'avulso','Colar','CO-9',1,10,'pendente',5)", [sim.pedido.id])
  await sim.instalar(context, baseURL, { logado: true })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Reembolso ou crédito" }).first().click()
  const conf = page.getByRole("dialog", { name: "Reembolso ou crédito?" })
  await conf.getByRole("button", { name: "Guardar para o próximo pedido", exact: true }).click()
  await expect(conf).toBeHidden()
  await expect.poll(async () => (await sim.one("select situacao from v_creditos_cliente where pedido_id=$1", [sim.pedido.id]))?.situacao).toBe("credito_guardado")
  expect((await sim.one("select acerto_status from trocas where id=$1", [sim.troca.id])).acerto_status).toBe("credito_registrado")
  expect(sim.bloqueadas).toEqual([])
})
