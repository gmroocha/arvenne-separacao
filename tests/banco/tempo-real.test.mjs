import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats } from './fixtures.mjs'

const avisos = async () => (await db.query("select payload from realtime.messages where topic = 'pedidos' and event = 'mudou' order by inserted_at")).rows.map((r) => r.payload)

test('tempo real leve: um aviso por comando, com a tabela e os pedidos afetados', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.exec('delete from realtime.messages')
  await db.exec('set local role authenticated')
  await db.query("update pedido_itens set qtd = qtd + 1 where pedido_id = $1", [p.id]) // 2 peças, 1 comando
  await db.exec('reset role')
  const a = await avisos()
  const itens = a.filter((m) => m.t === 'pedido_itens')
  assert.equal(itens.length, 1)
  assert.deepEqual(itens[0].p, [p.id])
  // Nenhum dado do pedido vai na mensagem: só tabela e ids.
  assert.deepEqual(Object.keys(itens[0]).filter((k) => k !== 'id').sort(), ['p', 't'])
})

test('tempo real leve: comando que não muda nada não avisa; troca avisa sem pedido', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.exec('delete from realtime.messages')
  await db.query("update pedido_itens set qtd = 1 where pedido_id = $1 and false", [p.id])
  assert.equal((await avisos()).length, 0)
  await db.query("update pedidos set observacoes = 'x' where id = $1", [p.id])
  const a = await avisos()
  assert.ok(a.some((m) => m.t === 'pedidos' && m.p[0] === p.id))
})

test('tempo real leve: só a equipe logada lê o canal pedidos', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.query("update pedidos set observacoes = 'y' where id = $1", [p.id])
  await db.exec("set local role authenticated; set local realtime.topic = 'pedidos'")
  assert.ok(Number((await one("select count(*) n from realtime.messages")).n) > 0)
  await db.exec("reset role; set local role anon")
  assert.equal(Number((await one("select count(*) n from realtime.messages")).n), 0)
  await db.exec("reset role; set local role authenticated; set local realtime.topic = 'outro'")
  assert.equal(Number((await one("select count(*) n from realtime.messages")).n), 0)
})

test('contagem de repetidas confere com a lista completa', async () => {
  const a = await pedidoWhats('separacao')
  const b = await pedidoWhats('separacao')
  await db.query("update pedido_itens set status = 'pendente' where pedido_id in ($1, $2)", [a.id, b.id])
  await db.exec('set local role authenticated')
  const lista = Number((await one('select count(*) n from v_pecas_em_varios_pedidos')).n)
  assert.ok(lista >= 2)
  assert.equal((await one('select contagem_repetidas() n')).n, lista)
})
