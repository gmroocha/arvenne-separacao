import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Chave de acesso da NF-e: 44 dígitos, opcional. A tela limpa espaços e pontos; o banco só aceita os 44 números.
const CHAVE = '35240112345678000190550010000001231000001230'

test('nf_chave: opcional, aceita exatamente 44 dígitos e sai pela v_pedidos e pela v_pedidos_operacao', async () => {
  const p = await pedidoWhats('faturamento')
  assert.equal((await one('select nf_chave from pedidos where id=$1', [p.id])).nf_chave, null, 'o pedido anda sem chave')
  await db.exec('set local role authenticated')
  await db.query('update pedidos set nf_chave=$2 where id=$1', [p.id, CHAVE])
  assert.equal((await one('select nf_chave from v_pedidos where id=$1', [p.id])).nf_chave, CHAVE)
  assert.equal((await one('select nf_chave from v_pedidos_operacao where id=$1', [p.id])).nf_chave, CHAVE)
  await db.query('update pedidos set nf_chave=null where id=$1', [p.id])
  assert.equal((await one('select nf_chave from pedidos where id=$1', [p.id])).nf_chave, null, 'dá para apagar')
})

test('nf_chave: recusa tamanho errado, letras, espaços e pontos', async () => {
  const p = await pedidoWhats('faturamento')
  await db.exec('set local role authenticated')
  for (const ruim of [CHAVE.slice(1), CHAVE + '1', '', '3524 0112 3456 7800 0190 5500 1000 0001 2310 0000 1230', CHAVE.replace(/^./, 'A'), CHAVE.replace(/^(\d{4})/, '$1.')]) {
    await recusa(() => db.query('update pedidos set nf_chave=$2 where id=$1', [p.id, ruim]), /check/)
  }
})

test('nf_chave: anon não lê nem grava; a chave não muda a etapa do pedido', async () => {
  const p = await pedidoWhats('faturamento')
  await db.exec('set local role authenticated')
  await db.query('update pedidos set nf_chave=$2 where id=$1', [p.id, CHAVE])
  assert.equal((await one('select status from pedidos where id=$1', [p.id])).status, 'faturamento')
  await db.exec('reset role; set local role anon')
  await recusa(() => one('select nf_chave from v_pedidos where id=$1', [p.id]), /permission denied/)
  await recusa(() => db.query('update pedidos set nf_chave=$2 where id=$1', [p.id, CHAVE]), /permission denied/)
})
