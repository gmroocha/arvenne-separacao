import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

const itemDe = async (pedidoId) => one('select id from pedido_itens where pedido_id = $1 order by ordem limit 1', [pedidoId])

test('nota da peça: grava, troca e apaga, com cada mudança no histórico', async () => {
  const p = await pedidoWhats('separacao')
  const i = await itemDe(p.id)
  await db.exec('set local role authenticated')
  await one('select anotar_item($1, $2)', [i.id, '  Peça de montagem: temos, falta montar  '])
  assert.equal((await one('select nota from pedido_itens where id = $1', [i.id])).nota, 'Peça de montagem: temos, falta montar')
  await one('select anotar_item($1, $2)', [i.id, 'Montada'])
  await one('select anotar_item($1, $2)', [i.id, 'Montada']) // igual: não registra de novo
  await one('select anotar_item($1, $2)', [i.id, '   '])
  assert.equal((await one('select nota from pedido_itens where id = $1', [i.id])).nota, null)
  const ev = (await db.query("select de, para, texto from pedido_eventos where item_id = $1 and tipo = 'nota' order by id", [i.id])).rows
  assert.deepEqual(ev.map((e) => e.texto), ['Nota da peça: Peça de montagem: temos, falta montar', 'Nota da peça: Montada', 'Nota da peça apagada'])
  assert.equal(ev[2].de, 'Montada')
})

test('nota da peça: vale em qualquer etapa e não muda status nem etapa', async () => {
  const p = await pedidoWhats('bipagem')
  const i = await itemDe(p.id)
  await db.exec('set local role authenticated')
  await one('select anotar_item($1, $2)', [i.id, 'Embalar separado'])
  const r = await one('select i.status, i.conferido_em is not null conferida, p.status etapa from pedido_itens i join pedidos p on p.id = i.pedido_id where i.id = $1', [i.id])
  assert.deepEqual([r.status, r.conferida, r.etapa], ['encontrado', true, 'bipagem'])
})

test('nota da peça: limite de 500 caracteres; anon não anota', async () => {
  const p = await pedidoWhats('separacao')
  const i = await itemDe(p.id)
  await db.exec('set local role authenticated')
  await recusa(() => one('select anotar_item($1, $2)', [i.id, 'x'.repeat(501)]), /check/)
  await db.exec('set local role anon')
  await recusa(() => one('select anotar_item($1, $2)', [i.id, 'oi']), /permission denied/)
})
