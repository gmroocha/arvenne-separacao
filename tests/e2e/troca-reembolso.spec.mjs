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
