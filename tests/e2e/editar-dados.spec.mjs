import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function editarNaSeparacao(page) {
  await page.getByRole("button", { name: "Mais ações", exact: true }).click()
  await page.getByRole("menuitem", { name: "Ver dados do pedido", exact: true })
    .or(page.getByRole("button", { name: "Ver dados do pedido", exact: true })).click()
  await page.getByRole("dialog", { name: "Dados do pedido", exact: true }).getByRole("button", { name: "Editar", exact: true }).click()
}

test("V74: corrigir frete pago mantém saldo zerado e custo da Frenet separado", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await editarNaSeparacao(page)
  const janela = page.getByRole("dialog", { name: "Editar dados do pedido" })
  await janela.getByRole("radio", { name: "Cliente", exact: true }).click()
  await janela.getByLabel("Frete que a cliente pagou", { exact: true }).fill("22,08")
  await janela.getByLabel("Custo real do frete").fill("40")
  await janela.getByRole("button", { name: "Salvar", exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `capturas/editar-frete-pago-${info.project.name}.png` })
  await janela.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(janela).toBeHidden()
  const p = await sim.one("select frete_pago_por,frete_cobrado,frete_custo,total_pago,total_geral,saldo_financeiro(id) saldo from v_pedidos where id=$1", [sim.pedido.id])
  expect(p).toEqual({ frete_pago_por: "cliente", frete_cobrado: "22.08", frete_custo: "40.00", total_pago: "122.08", total_geral: "122.08", saldo: "0.00" })
  expect((await sim.one("select texto from pedido_eventos where pedido_id=$1 and texto like 'Frete corrigido:%'", [sim.pedido.id])).texto).toMatch(/valor pago R\$ 100,00 → R\$ 122,08/)
  await expect(page.getByText("Arvenne paga a diferença do frete")).toBeVisible()
  await expect(page.getByText("R$ 17,92").first()).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("V74: correção recusada não grava os outros dados pela metade", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedidos set valor_pago=null where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await editarNaSeparacao(page)
  const janela = page.getByRole("dialog", { name: "Editar dados do pedido" })
  await janela.getByLabel("Nome", { exact: true }).fill("Não deve salvar")
  await janela.getByRole("radio", { name: "Cliente", exact: true }).click()
  await janela.getByLabel("Frete que a cliente pagou", { exact: true }).fill("22,08")
  await janela.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(page.getByText(/Este pedido não tem valor pago registrado/)).toBeVisible()
  await expect(janela).toBeVisible()
  expect(await sim.one("select cliente_nome,frete_pago_por,valor_pago from pedidos where id=$1", [sim.pedido.id]))
    .toEqual({ cliente_nome: "Cliente de teste", frete_pago_por: "arvenne", valor_pago: null })
  expect(sim.bloqueadas).toEqual([])
})

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

// Data do pagamento editável no "Editar": grava no horário de São Paulo, recalcula o prazo no banco,
// tira a marca de estimada (a Shopify não sobrescreve) e registra a mudança no histórico. Futuro é recusado.
test("editar dados do pedido: corrigir a data do pagamento", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "novo" })
  await sim.banco.query("update pedidos set pago_em='2026-01-06T13:00:00Z', pago_em_estimado=true where id=$1", [sim.pedido.id])
  const antes = await sim.one("select prazo from v_pedidos where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await editarNaSeparacao(page)
  const janela = page.getByRole("dialog", { name: "Editar dados do pedido" })
  const campo = janela.getByLabel("Data e hora do pagamento")
  await expect(campo).toHaveValue("2026-01-06T10:00")
  await campo.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `capturas/editar-pago-em-${info.project.name}.png` })

  await campo.fill("2099-01-01T10:00")
  await janela.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(page.getByText("A data do pagamento não pode ser no futuro")).toBeVisible()
  await expect(janela).toBeVisible()

  await campo.fill("2026-01-05T09:15")
  await janela.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(janela).toBeHidden()
  const p = await sim.one("select pago_em, pago_em_estimado from pedidos where id=$1", [sim.pedido.id])
  expect([new Date(p.pago_em).toISOString(), p.pago_em_estimado]).toEqual(["2026-01-05T12:15:00.000Z", false])
  const depois = await sim.one("select prazo from v_pedidos where id=$1", [sim.pedido.id])
  expect(new Date(depois.prazo).getTime()).toBeLessThan(new Date(antes.prazo).getTime())
  expect((await sim.one("select texto from pedido_eventos where pedido_id=$1 and tipo='nota' order by id desc limit 1", [sim.pedido.id])).texto)
    .toBe("Data do pagamento alterada: 06/01/2026, 10:00 → 05/01/2026, 09:15")
  expect(sim.bloqueadas).toEqual([])
})
