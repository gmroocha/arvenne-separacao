import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, pedidoWhats, prepararEtapa, recusa, somaFixture } from './fixtures.mjs'

const visivel = async (id) => !!(await one('select 1 as ok from v_pedidos where id = $1', [id]))
const existe = async (id) => {
  await db.exec('reset role')
  const r = await one('select excluido_em from pedidos where id = $1', [id])
  await db.exec('set local role authenticated')
  return r
}

test('excluir venda não paga: some de listas, link e buscas, mas os dados ficam guardados', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.exec('set local role authenticated')
  assert.equal(await visivel(p.id), true)
  await one('select excluir_pedido($1)', [p.id])
  assert.equal(await visivel(p.id), false)
  assert.equal(await one('select 1 as ok from pedidos where id = $1', [p.id]), undefined)
  assert.equal((await one('select romaneio_publico($1) as r', [p.token_publico])).r, null)
  // Nada apagado: o pedido, as peças e o registro continuam no banco.
  assert.ok((await existe(p.id)).excluido_em)
  await db.exec('reset role')
  assert.equal(Number((await one('select count(*) n from pedido_itens where pedido_id = $1', [p.id])).n), 2)
  assert.equal((await one("select texto from pedido_eventos where pedido_id = $1 and tipo = 'nota'", [p.id])).texto, 'Pedido excluído')
})

test('excluir: a equipe não marca excluido_em direto nem mexe em pedido excluído', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.exec('set local role authenticated')
  await recusa(() => one('update pedidos set excluido_em = now() where id = $1', [p.id]), /row-level security/)
  await one('select excluir_pedido($1)', [p.id])
  const r = await db.query("update pedidos set observacoes = 'x' where id = $1", [p.id])
  assert.equal(r.affectedRows ?? 0, 0)
  await recusa(() => one('select excluir_pedido($1)', [p.id]), /não encontrado/)
})

test('excluir: pedido do Arquivo sim; pedido na esteira não', async () => {
  const cancelado = await pedidoWhats('separacao')
  await db.query("update pedidos set status = 'cancelado' where id = $1", [cancelado.id])
  const esteira = await pedidoWhats('separacao')
  await db.exec('set local role authenticated')
  await one('select excluir_pedido($1)', [cancelado.id])
  assert.equal(await visivel(cancelado.id), false)
  await recusa(() => one('select excluir_pedido($1)', [esteira.id]), /Só dá para excluir venda ainda não paga ou pedido do Arquivo/)
  assert.equal(await visivel(esteira.id), true)
})

test('excluir: venda somada não sai sozinha; excluir o principal leva as somadas juntas', async () => {
  const { p, w } = await somaFixture()
  await one("select somar_venda($1, 'Cartão', 40, now())", [w.id])
  await recusa(() => one('select excluir_pedido($1)', [p.id]), /Só dá para excluir/)
  await db.exec('reset role')
  await prepararEtapa(p.id, 'enviado')
  await db.exec('set local role authenticated')
  await recusa(() => one('select excluir_pedido($1)', [w.id]), /somada ao pedido ARV-1/)
  await one('select excluir_pedido($1)', [p.id])
  assert.equal(await visivel(p.id), false)
  assert.equal(await visivel(w.id), false)
})

test('excluir: pedido com troca não pode (dinheiro não some da conta)', async () => {
  const f = await fixture()
  await db.exec('reset role')
  await prepararEtapa(f.pedido.id, 'enviado')
  await db.exec('set local role authenticated')
  await recusa(() => one('select excluir_pedido($1)', [f.pedido.id]), /troca registrada/)
})

test('duplicar venda: mesma cliente e peças vivas, nova venda em aberto, sem pagamento', async () => {
  const { w } = await somaFixture({ venda: { somar: true } })
  await db.query(`update pedidos set cliente_telefone = '11999990000', entrega_cep = '01001000', frete_tipo = 'PAC',
    frete_pago_por = 'cliente', frete_cobrado = 15, status = 'aguardando_pagamento' where id = $1`, [w.id])
  const nova = await one('select * from duplicar_venda($1)', [w.id])
  assert.notEqual(nova.id, w.id)
  assert.match(nova.numero, /^W\d{4}$/)
  const d = await one('select * from v_pedidos where id = $1', [nova.id])
  assert.equal(d.status, 'em_aberto')
  assert.equal(d.origem, 'whatsapp')
  assert.equal(d.cliente_nome, 'Nathália')
  assert.equal(d.cliente_telefone, '11999990000')
  assert.equal(d.entrega_cep, '01001000')
  assert.equal(Number(d.frete_cobrado), 15)
  assert.equal(d.pago_em, null)
  assert.equal(d.valor_pago, null)
  const itens = (await db.query('select sku, qtd, ordem, status from pedido_itens where pedido_id = $1 order by ordem', [nova.id])).rows
  assert.deepEqual(itens.map((i) => [i.sku, i.qtd, i.ordem, i.status]), [['BR', 1, 1, 'pendente'], ['CO', 1, 2, 'pendente']])
  // A original continua igual.
  assert.equal((await one('select status from pedidos where id = $1', [w.id])).status, 'aguardando_pagamento')
})

test('duplicar: só venda do WhatsApp e não duplica pedido excluído', async () => {
  const f = await fixture({ shopify: true })
  await recusa(() => one('select * from duplicar_venda($1)', [f.pedido.id]), /Só dá para duplicar venda do WhatsApp/)
  const p = await pedidoWhats('em_aberto')
  await db.exec('set local role authenticated')
  await one('select excluir_pedido($1)', [p.id])
  await recusa(() => one('select * from duplicar_venda($1)', [p.id]), /não encontrado/)
})

test('excluir e duplicar: anon não chama', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.exec('set local role anon')
  await recusa(() => one('select excluir_pedido($1)', [p.id]), /permission denied/)
  await recusa(() => one('select * from duplicar_venda($1)', [p.id]), /permission denied/)
})
