import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Dados do pedido: "Editar" muda cliente, endereço e frete (tipo e custo real). O que a cliente pagou não muda;
// a diferença do frete fica com a Arvenne (calculada no banco) e a troca do frete vai para o histórico.
test("editar dados do pedido: trocar o frete e a Arvenne paga a diferença", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=qtd,bipado_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set nf_emitida_em=now(), pedido_fornecedor_em=now(), embalado_em=now(), status='frete', frete_pago_por='cliente', frete_cobrado=22.08 where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Editar", exact: true }).first().click()
  const janela = page.getByRole("dialog", { name: "Editar dados do pedido" })
  await janela.getByLabel("Telefone").fill("(61) 99964-7974")
  await janela.getByRole("radio", { name: "SEDEX" }).click()
  await janela.getByLabel("Custo real do frete").fill("40")
  await janela.getByRole("button", { name: "Salvar" }).click()
  await expect(janela).toBeHidden()
  const p = await sim.one("select frete_tipo, frete_custo, frete_cobrado, cliente_telefone from pedidos where id=$1", [sim.pedido.id])
  expect([p.frete_tipo, Number(p.frete_custo), Number(p.frete_cobrado), p.cliente_telefone]).toEqual(["SEDEX", 40, 22.08, "61999647974"])
  expect((await sim.one("select texto from pedido_eventos where pedido_id=$1 and tipo='nota' order by id desc limit 1", [sim.pedido.id])).texto)
    .toMatch(/^Frete alterado: PAC → SEDEX · custo R\$\s40,00$/)
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Mostrar ou esconder" }).click()
  await expect(page.getByText("Arvenne paga a diferença do frete")).toBeVisible()
  await expect(page.getByText("R$ 17,92").first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})
