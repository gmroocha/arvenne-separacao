import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { recusa, num, somaFixture } from './fixtures.mjs'

test('somar_venda: peças vão para o principal como adicionais, venda vira somada e o total do principal não muda', async () => {
  const { p, w, i1 } = await somaFixture()
  const antes = await one('select total, subtotal, desconto, total_geral, valor_somado from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(antes.total), num(antes.subtotal), num(antes.valor_somado), num(antes.total_geral)], [90, 100, 0, 90])
  await one("select somar_venda($1, 'Cartão', 40, '2026-11-11T14:32:00Z')", [w.id])
  const venda = await one('select status, forma_pagamento, valor_pago, somada_valor, somada_em, pago_em, fase from pedidos p join (select id, fase from v_pedidos) v using (id) where id = $1', [w.id])
  assert.deepEqual([venda.status, venda.forma_pagamento, num(venda.valor_pago), num(venda.somada_valor), venda.fase], ['somada', 'Cartão', 40, 45, 'arquivo'])
  assert.ok(venda.somada_em)
  assert.equal(new Date(venda.pago_em).toISOString(), '2026-11-11T14:32:00.000Z')
  const itens = (await db.query("select * from pedido_itens where pedido_id = $1 order by ordem", [p.id])).rows
  assert.equal(itens.length, 3)
  assert.deepEqual(itens.map(i => [i.sku, i.adicional, i.ordem]), [['AN', false, 1], ['BR', true, 2], ['CO', true, 3]])
  // preço com o desconto da venda: 45/50 = 0.9
  assert.deepEqual([num(itens[1].preco_pago), num(itens[2].preco_pago)], [27, 18])
  assert.equal(itens[1].venda_origem_id, w.id)
  // a peça removida fica na venda
  const sobra = (await db.query('select sku, status from pedido_itens where pedido_id = $1', [w.id])).rows
  assert.deepEqual(sobra.map(r => [r.sku, r.status]), [['PU', 'removido']])
  const dep = await one('select * from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(dep.total), num(dep.subtotal), num(dep.desconto), num(dep.valor_somado), num(dep.valor_pago_somado), num(dep.total_geral)], [90, 100, 10, 45, 40, 135])
  assert.equal(dep.qtd_pecas, 4)
  assert.equal(dep.qtd_adicionais, 2)
  assert.equal(dep.partes.length, 1)
  assert.deepEqual([dep.partes[0].numero, dep.partes[0].forma_pagamento, num(dep.partes[0].valor_pago), num(dep.partes[0].somada_valor), dep.partes[0].qtd_pecas], [venda.numero ?? w.numero, 'Cartão', 40, 45, 2])
  assert.equal(dep.partes[0].id, w.id)
  // total pago = pagamento do principal + o da venda; a venda sabe o número do principal
  assert.equal(num(dep.total_pago), num(Number(p.valor_pago ?? 0) + 40))
  assert.equal((await one('select somada_a_numero from v_pedidos where id = $1', [w.id])).somada_a_numero, p.numero)
  assert.equal(i1.id, itens[1].id)
  // eventos nos dois pedidos
  assert.equal((await one("select count(*)::int n from pedido_eventos where tipo = 'venda_somada' and pedido_id = any($1)", [[p.id, w.id]])).n, 2)
  // o principal já estava na separação: continua
  assert.equal(dep.status, 'separacao')
  // venda somada não pode ser somada de novo
  await recusa(() => one("select somar_venda($1, 'Pix', 1, now())", [w.id]), /já foi somada/)
})

test('somar_venda: principal na conferência ou depois volta para a separação', async () => {
  for (const st of ['conferencia', 'etiquetagem', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio']) {
    const { p, w } = await somaFixture({ principal: { status: st } })
    await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
    assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'separacao', st)
    await db.exec('reset role')
  }
  const { p, w } = await somaFixture({ principal: { status: 'novo' } })
  await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
  assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'novo')
})

test('somar_venda: recusas', async () => {
  const f = await somaFixture()
  await db.exec('reset role')
  await db.query('update pedidos set somar_em = null where id = $1', [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /Escolha o pedido/)
  await db.exec('reset role')
  await db.query('update pedidos set somar_em = $2 where id = $1', [f.w.id, f.p.id])
  for (const st of ['enviado', 'cancelado', 'perdida', 'somada', 'em_aberto']) {
    await db.query('update pedidos set status = $2 where id = $1', [f.p.id, st])
    await db.exec('set local role authenticated')
    await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /não aceita mais peças/)
    await db.exec('reset role')
  }
  await db.query("update pedidos set status = 'separacao' where id = $1", [f.p.id])
  await db.query("update pedidos set status = 'novo' where id = $1", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /não está aberta/)
  await db.exec('reset role')
  await db.query("update pedidos set status = 'em_aberto' where id = $1", [f.w.id])
  await db.query("update pedido_itens set preco = null where pedido_id = $1 and sku = 'BR'", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /sem preço/)
  await db.exec('reset role')
  await db.query("update pedido_itens set preco = 30 where pedido_id = $1 and sku = 'BR'", [f.w.id])
  await db.query("update pedido_itens set status = 'removido' where pedido_id = $1", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /nenhuma peça/)
  await recusa(() => one("select somar_venda($1, '', 40, now())", [f.w.id]), /forma de pagamento/)
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.p.id]), /não está aberta/)
  await db.exec('set local role anon')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => db.query('update pedidos set somar_em = id where id = $1', [f.w.id]), /pedidos_somar_em_outro/)
})

test('somar_venda: Pix da venda entra no valor somado e o principal da Shopify mantém o total', async () => {
  const { p, w } = await somaFixture({ principal: { origem: 'shopify' } })
  await db.exec('reset role')
  await db.query("update pedidos set valor_total = 90, shopify_order_id = 9300 where id = $1", [p.id])
  await db.query("update pedido_itens set preco_pago = 45, origem = 'shopify' where pedido_id = $1", [p.id])
  await db.exec('set local role authenticated')
  const antes = await one('select total, desconto from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(antes.total), num(antes.desconto)], [90, 10])
  await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
  // Pix: 10% de 50 = 5 somado ao desconto de 5 => 40
  assert.equal(num((await one('select somada_valor from pedidos where id = $1', [w.id])).somada_valor), 40)
  const dep = await one('select total, subtotal, desconto, valor_somado, total_geral, valor_pecas_com_desconto from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(dep.total), num(dep.subtotal), num(dep.desconto), num(dep.valor_somado), num(dep.total_geral), num(dep.valor_pecas_com_desconto)], [90, 100, 10, 40, 130, 90])
  // O importador da Shopify ignora as adicionais (preço pago e checagem de alteração).
  await db.exec('reset role')
  await db.query("update pedido_itens set origem = 'shopify' where pedido_id = $1 and adicional", [p.id])
  await db.query("update pedido_itens set shopify_variant_id = 5, shopify_line_id = 'L1' where pedido_id = $1 and not adicional", [p.id])
  await one(`select importar_pedido_shopify($1::jsonb)`, [JSON.stringify({
    shopify_order_id: 9300, numero: '#9300', valor_total: 90,
    itens: [{ shopify_variant_id: 5, shopify_line_id: 'L1', sku: 'AN', nome: 'Anel', qtd: 2, preco: 50, preco_pago: 45 }] })])
  assert.equal((await one("select count(*)::int n from pedido_eventos where pedido_id = $1 and tipo = 'shopify_alterado'", [p.id])).n, 0)
  assert.deepEqual((await db.query('select round(preco_pago,2) num_pago from pedido_itens where pedido_id = $1 order by ordem', [p.id])).rows.map(r => num(r.num_pago)), [45, 24, 16])
})

test('romaneio_publico: venda somada aponta o principal e o principal lista as adicionais à parte', async () => {
  const { p, w } = await somaFixture()
  await one("select somar_venda($1, 'Cartão', 45, now())", [w.id])
  const rp = (await one('select romaneio_publico($1) d', [(await one('select token_publico from pedidos where id = $1', [p.id])).token_publico])).d
  assert.equal(rp.itens.length, 1)
  assert.equal(rp.adicionais.length, 2)
  assert.deepEqual([num(rp.total), num(rp.valor_somado), num(rp.total_geral)], [90, 45, 135])
  const rw = (await one('select romaneio_publico($1) d', [(await one('select token_publico from pedidos where id = $1', [w.id])).token_publico])).d
  assert.deepEqual([rw.somada_a, rw.status, rw.itens.length], ['ARV-1', 'somada', 0])
})


test.each([['Cartão', 'falta'], ['Pix', 'defeito']])('V02: falta parcial adicional conserva dinheiro e origem (%s, %s)', async (forma, status) => {
  const { p, w, i1 } = await somaFixture()
  await db.query("update pedido_itens set qtd=3 where id=$1", [i1.id])
  await one("select somar_venda($1,$2,105)", [w.id, forma])
  const antes = await one("select total,total_geral,valor_somado,total_pago from v_pedidos where id=$1", [p.id])
  const original = await one("select preco_pago,venda_origem_id from pedido_itens where id=$1", [i1.id])
  const n = await one("select marcar_falta($1,1,$2) as id", [i1.id, status])
  const linha = await one("select adicional,venda_origem_id,preco_pago,status from pedido_itens where id=$1", [n.id])
  assert.deepEqual(linha, { adicional: true, venda_origem_id: w.id, preco_pago: original.preco_pago, status })
  assert.deepEqual(await one("select total,total_geral,valor_somado,total_pago from v_pedidos where id=$1", [p.id]), antes)
  assert.equal((await one("select sum(qtd)::int n from pedido_itens where id=any($1)", [[i1.id,n.id]])).n, 3)
})
