import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { concluir, escolher, fixture, recusa } from './fixtures.mjs'

// "Cliente decidiu" (19/11/2026): pedido em Avisar/Aguardando cliente cuja troca ativa (enviada/respondida) já tem peça
// escolhida e ainda não concluída. Não é status: a conta vem de v_pedidos_operacao (a Expedição só exibe).
const lista = (id) => one('select status, cliente_decidiu, troca_decididas, troca_pecas_abertas from v_pedidos_operacao where id = $1', [id])

test('cliente decidiu: peça escolhida e não concluída marca o pedido, com X de Y certos', async () => {
  const f = await fixture({ quantidade: 2 })
  assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: false, troca_decididas: 0, troca_pecas_abertas: 2 })
  await escolher(f, 0, 'credito')
  assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: true, troca_decididas: 1, troca_pecas_abertas: 2 })
  // WhatsApp também é decisão.
  await escolher(f, 1, 'whatsapp')
  assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: true, troca_decididas: 2, troca_pecas_abertas: 2 })
})

test('cliente decidiu: opção do catálogo conta, e a mesma regra vale em Avisar cliente', async () => {
  const f = await fixture()
  await escolher(f, 0, 'opcao')
  assert.equal((await lista(f.pedido.id)).cliente_decidiu, true)
  await db.exec('reset role')
  await db.query("update pedidos set status = 'avisar_cliente' where id = $1", [f.pedido.id])
  await db.exec('set local role authenticated')
  assert.deepEqual(await lista(f.pedido.id), { status: 'avisar_cliente', cliente_decidiu: true, troca_decididas: 1, troca_pecas_abertas: 1 })
})

test('cliente decidiu: sem escolha da cliente fica falso', async () => {
  const f = await fixture({ quantidade: 2 })
  const r = await lista(f.pedido.id)
  assert.equal(r.cliente_decidiu, false)
  assert.equal(r.troca_decididas, 0)
})

test('cliente decidiu: peça concluída não conta; some quando a equipe conclui tudo', async () => {
  const f = await fixture({ quantidade: 2 })
  await escolher(f, 0, 'credito')
  await escolher(f, 1, 'credito')
  await concluir(f, 0, 'credito')
  // Sobra a peça 1: decidiu 1 de 1 (a concluída não entra nem em X nem em Y).
  assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: true, troca_decididas: 1, troca_pecas_abertas: 1 })
  await concluir(f, 1, 'credito')
  const r = await lista(f.pedido.id)
  assert.equal(r.cliente_decidiu, false)
  assert.equal(r.troca_decididas, 0)
  assert.equal(r.troca_pecas_abertas, 0)
})

test('cliente decidiu: peça concluída e outra sem escolha não deixa o pedido decidido', async () => {
  const f = await fixture({ quantidade: 2 })
  await escolher(f, 0, 'credito')
  await concluir(f, 0, 'credito')
  assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: false, troca_decididas: 0, troca_pecas_abertas: 1 })
})

test('cliente decidiu: troca em rascunho ou cancelada não conta', async () => {
  const f = await fixture()
  await escolher(f, 0, 'credito')
  assert.equal((await lista(f.pedido.id)).cliente_decidiu, true)
  await db.exec('reset role')
  for (const status of ['rascunho', 'cancelada']) {
    await db.query('update trocas set status = $1 where id = $2', [status, f.troca.id])
    await db.exec('set local role authenticated')
    assert.deepEqual(await lista(f.pedido.id), { status: 'aguardando_cliente', cliente_decidiu: false, troca_decididas: 0, troca_pecas_abertas: 0 }, status)
    await db.exec('reset role')
  }
  await db.exec('set local role authenticated')
})

test('cliente decidiu: pedido que não está em Avisar/Aguardando nunca é "decidiu"', async () => {
  const f = await fixture()
  await escolher(f, 0, 'credito')
  await db.exec('reset role')
  await db.query("update pedido_itens set status = 'encontrado' where pedido_id = $1", [f.pedido.id])
  await db.query("update pedidos set status = 'conferencia' where id = $1", [f.pedido.id])
  await db.exec('set local role authenticated')
  const r = await lista(f.pedido.id)
  assert.equal(r.status, 'conferencia')
  assert.equal(r.cliente_decidiu, false)
  assert.equal(r.troca_decididas, 0)
})

test('cliente decidiu: a função é fechada para anon', async () => {
  await db.exec('set local role anon')
  await recusa(() => one("select decisao_troca(gen_random_uuid(), 'aguardando_cliente')"), /permission denied/)
})
