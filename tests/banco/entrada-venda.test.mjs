import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { num } from './fixtures.mjs'

const peca = (entrada, qtd = 1, extra = {}) => ({
  origem: 'shopify', shopify_variant_id: 501, peca_clube_id: null, sku: 'TR2456-18', nome: 'Anel pérola',
  variante: 'N°18', foto_url: null, qtd, preco: 82.5, ...(entrada ? { entrada } : {}), ...extra,
})

// Venda: peças do carrinho colado e peças adicionadas à mão ficam em grupos separados na tela.
test('adicionar_itens grava a entrada; somar só junta na mesma entrada; total não muda', async () => {
  await db.exec('set local role authenticated')
  const w = await one(`insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'Cliente') returning id`)
  await one('select adicionar_itens($1, $2::jsonb, true)', [w.id, JSON.stringify([peca('carrinho')])])
  await one('select adicionar_itens($1, $2::jsonb, true)', [w.id, JSON.stringify([peca('carrinho')])])
  await one('select adicionar_itens($1, $2::jsonb, true)', [w.id, JSON.stringify([peca('manual', 2)])])
  // Sem entrada (como antes): linha à parte, não soma nas marcadas.
  await one('select adicionar_itens($1, $2::jsonb, true)', [w.id, JSON.stringify([peca(null)])])
  const linhas = (await db.query('select entrada, qtd from pedido_itens where pedido_id = $1 order by ordem', [w.id])).rows
  assert.deepEqual(linhas.map((l) => [l.entrada, l.qtd]), [['carrinho', 2], ['manual', 2], [null, 1]])
  const v = await one('select subtotal, total, qtd_pecas from v_pedidos where id = $1', [w.id])
  assert.deepEqual([num(v.subtotal), num(v.total), v.qtd_pecas], [412.5, 412.5, 5])
  await assert.rejects(() => db.query("update pedido_itens set entrada = 'outra' where pedido_id = $1", [w.id]), /check/)
})
