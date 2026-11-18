import { expect, test } from "vitest"
import { db, one } from "./suporte.mjs"
import { fixture, escolher, concluir, pedidoWhats, prepararEtapa, recusa, importar, payloadV2, pedidoDe } from "./fixtures.mjs"

async function conferir(id) {
  const leve = await one("select * from v_pedidos_operacao where id=$1", [id])
  const completo = await one("select * from v_pedidos where id=$1", [id])
  expect(leve).toBeDefined()
  for (const [campo, valor] of Object.entries(leve)) expect(valor, campo).toEqual(completo[campo])
}

test("V79: lista operacional preserva progresso, prazos e regras em todas as etapas", async () => {
  const p = await pedidoWhats()
  for (const etapa of ['novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado']) {
    await prepararEtapa(p.id, etapa)
    await conferir(p.id)
  }
})

test.each([false, true])("V79: lista operacional preserva acerto de troca e crédito (Shopify=%s)", async shopify => {
  const f = await fixture({ shopify })
  await conferir(f.pedido.id)
  await escolher(f, 0, 'credito')
  await concluir(f, 0, 'credito')
  await conferir(f.pedido.id)
})

test("V79: contadores equivalem à consulta completa e respeitam pedidos excluídos", async () => {
  await pedidoWhats('em_aberto')
  const p = await pedidoWhats()
  await db.query("update pedidos set pago_em=now()-interval '20 days' where id=$1", [p.id])
  await db.exec("set local role authenticated")
  const completo = await one(`select count(*) filter(where status='em_aberto')::int as "emAberto",
    count(*) filter(where fase='expedicao' and prazo<now())::int as atrasados from v_pedidos`)
  expect((await one("select contagens_pedidos() as v")).v).toEqual(completo)
  await db.exec("reset role")
  await db.query("update pedidos set excluido_em=now() where id=$1", [p.id])
  await db.exec("set local role authenticated")
  expect((await one("select contagens_pedidos() as v")).v.atrasados).toBe(0)
  expect(await one("select * from v_pedidos_operacao where id=$1", [p.id])).toBeUndefined()
  await db.exec("set local role anon")
  await recusa(() => one("select contagens_pedidos()"), /permission denied/)
  await recusa(() => one("select * from v_pedidos_operacao"), /permission denied/)
})

test("V79: pedido comum não executa a consulta financeira para montar o cartão", async () => {
  const p = await pedidoWhats()
  // O plano da lista não deve expandir a árvore financeira nem suas tabelas.
  const plano = JSON.stringify((await db.query("explain (format json) select * from v_pedidos_operacao where id=$1", [p.id])).rows)
  expect(plano).not.toMatch(/movimentos_financeiros|troca_pecas|v_item_liquido/)
  await conferir(p.id)
  await db.exec("revoke select on v_pedidos from authenticated; set local role authenticated")
  expect((await one("select * from v_pedidos_operacao where id=$1", [p.id])).id).toBe(p.id)
})


test("V79: retirada depois do pagamento preserva devolução, quitação e desfazer", async () => {
  await importar(payloadV2())
  const p = await pedidoDe(888001)
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where pedido_id=$1 and shopify_line_id='L2'", [p.id])
  await conferir(p.id)
  expect(Number((await one("select a_devolver from v_pedidos_operacao where id=$1", [p.id])).a_devolver)).toBe(40)
  await db.exec("set local role authenticated")
  await one("select marcar_devolvido($1)", [p.id])
  await conferir(p.id)
  await one("select marcar_devolvido($1,true)", [p.id])
  await conferir(p.id)
})
