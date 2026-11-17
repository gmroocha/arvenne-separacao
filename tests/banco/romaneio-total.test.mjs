import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { num, somaFixture } from './fixtures.mjs'

// O visualizador de peças da página da cliente mostra o total de cada linha: vem do banco, não da tela.
test('romaneio_publico traz o total de cada peça (qtd × preço)', async () => {
  const p = await one(`insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'Ana Souza') returning id, token_publico`)
  await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values
    ($1, 'avulso', 'Anel', 'AN-1', 3, 33.33, 1), ($1, 'avulso', 'Brinco', 'BR-1', 1, null, 2)`, [p.id])
  await db.exec('set local role anon')
  const r = (await one('select romaneio_publico($1) as r', [p.token_publico])).r
  assert.deepEqual(r.itens.map((i) => [i.sku, i.qtd, i.total == null ? null : num(i.total)]), [['AN-1', 3, 99.99], ['BR-1', 1, null]])
  assert.equal(r.cliente, 'Ana')
})

test('venda somada: retrato das peças também traz o total de cada linha', async () => {
  const { w } = await somaFixture()
  await one("select somar_venda($1, 'Cartão', 40, '2026-11-11T14:32:00Z')", [w.id])
  const token = (await one('select token_publico from pedidos where id = $1', [w.id])).token_publico
  const r = (await one('select romaneio_publico($1) as r', [token])).r
  assert.ok(r.itens.length > 0)
  for (const i of r.itens) assert.equal(num(i.total), num(Number(i.qtd) * Number(i.preco)))
})
