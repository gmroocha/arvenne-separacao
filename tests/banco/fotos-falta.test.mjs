import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats } from './fixtures.mjs'

// Cartão da Expedição: as fotos das peças em falta vêm primeiro (no "Avisar cliente" a equipe vê o que falta).
test('fotos do cartão: peça em falta vem na frente, depois a ordem do pedido, no máximo 3', async () => {
  const p = await pedidoWhats('separacao')
  await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem)
    values ($1, 'avulso', 'Brinco', 'B1', 1, 20, 2), ($1, 'avulso', 'Pulseira', 'P1', 1, 20, 3)`, [p.id])
  await db.query("update pedido_itens set foto_url = 'https://fotos.test/' || sku || '.jpg' where pedido_id = $1", [p.id])
  const fotos = async () => (await one('select fotos from v_pedidos_operacao where id = $1', [p.id])).fotos
  assert.deepEqual(await fotos(), ['A1', 'C1', 'B1'].map((s) => `https://fotos.test/${s}.jpg`))
  await db.exec("set local session_replication_role = replica")
  await db.query("update pedido_itens set status = 'falta' where pedido_id = $1 and sku = 'P1'", [p.id])
  await db.query("update pedido_itens set status = 'defeito' where pedido_id = $1 and sku = 'B1'", [p.id])
  await db.exec("set local session_replication_role = origin")
  assert.deepEqual(await fotos(), ['B1', 'P1', 'A1'].map((s) => `https://fotos.test/${s}.jpg`))
})
