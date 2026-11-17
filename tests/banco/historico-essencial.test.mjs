import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one, criarBanco } from './suporte.mjs'
import { pedidoWhats, somaFixture } from './fixtures.mjs'

const eventos = async (pedidoId, tipos = ['qtd', 'preco', 'item']) =>
  (await db.query('select tipo, de, para from pedido_eventos where pedido_id = $1 and tipo = any($2) order by id', [pedidoId, tipos])).rows

test('montando a venda: quantidade, preço e retirada não entram no histórico; depois de paga, entram', async () => {
  const p = await pedidoWhats('em_aberto')
  const item = await one('select id from pedido_itens where pedido_id = $1 order by ordem limit 1', [p.id])
  await db.exec('set local role authenticated')
  await db.query('update pedido_itens set qtd = 3 where id = $1', [item.id])
  await db.query('update pedido_itens set qtd = 2, preco = 45 where id = $1', [item.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'removida na venda' where id = $1", [item.id])
  await db.query("update pedido_itens set status = 'pendente', observacao = null where id = $1", [item.id])
  await db.query("update pedidos set status = 'aguardando_pagamento' where id = $1", [p.id])
  await db.query('update pedido_itens set qtd = 4 where id = $1', [item.id])
  assert.deepEqual(await eventos(p.id), [])
  // Etapa e status continuam registrados (servem para medir tempos).
  assert.ok((await eventos(p.id, ['criado', 'status'])).length >= 2)
  await db.query("update pedidos set forma_pagamento = 'Pix', valor_pago = 180, pago_em = now(), status = 'novo' where id = $1", [p.id])
  await db.query('update pedido_itens set qtd = 3 where id = $1', [item.id])
  assert.deepEqual(await eventos(p.id), [{ tipo: 'qtd', de: '4', para: '3' }])
})

test('Peças trocadas e removidas: ajuste feito montando a venda somada não aparece no pedido principal', async () => {
  const { p, w, i1 } = await somaFixture()
  await db.exec('reset role')
  // Histórico antigo (antes desta regra): quantidade 3 → 2 registrada enquanto a venda era montada.
  await db.query("insert into pedido_eventos (pedido_id, item_id, tipo, de, para, created_at) values ($1, $2, 'qtd', '3', '2', now() - interval '1 hour')", [w.id, i1.id])
  await db.exec('set local role authenticated')
  await one("select somar_venda($1, 'Pix', 40, now() - interval '2 days')", [w.id]) // pago informado 2 dias antes
  assert.equal((await db.query("select 1 from v_pedido_alteracoes where pedido_id = $1 and tipo = 'quantidade'", [p.id])).rows.length, 0)
  // Redução de verdade, depois de pago, continua aparecendo.
  await db.exec('reset role')
  await db.query("insert into pedido_eventos (pedido_id, item_id, tipo, de, para, created_at) values ($1, $2, 'qtd', '2', '1', now() + interval '1 minute')", [w.id, i1.id])
  await db.exec('set local role authenticated')
  assert.equal((await db.query("select 1 from v_pedido_alteracoes where pedido_id = $1 and tipo = 'quantidade'", [p.id])).rows.length, 1)
})

test('limpeza: some só o ruído da montagem de vendas; etapas, pagamento e pedidos antigos ficam', async () => {
  let ids
  const b = await criarBanco({
    antesDe: '20261122130000',
    prepararAntes: async (banco) => {
      const q = async (sql, args) => (await banco.query(sql, args)).rows[0]
      const venda = await q("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'A') returning id")
      const it = await q("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Anel', 'A1', 1, 50, 1) returning id", [venda.id])
      await banco.query("insert into pedido_eventos (pedido_id, item_id, tipo, de, para, created_at) values ($1, $2, 'qtd', '1', '2', now() - interval '2 hours'), ($1, $2, 'preco', '50', '40', now() - interval '2 hours')", [venda.id, it.id])
      // Marcar como pago gera o evento "pago" (gatilho); depois disso, a separação.
      await banco.query("update pedidos set forma_pagamento = 'Pix', valor_pago = 50, pago_em = now() - interval '1 day', status = 'novo' where id = $1", [venda.id])
      await banco.query("insert into pedido_eventos (pedido_id, item_id, tipo, de, para, created_at) values ($1, $2, 'item', 'pendente', 'encontrado', now() + interval '1 minute')", [venda.id, it.id])
      // Venda antiga criada já na esteira (sem evento "pago"): o histórico dela fica inteiro.
      const antigo = await q("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'novo', 'B') returning id")
      const it2 = await q("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Colar', 'C1', 1, 30, 1) returning id", [antigo.id])
      await banco.query("insert into pedido_eventos (pedido_id, item_id, tipo, de, para) values ($1, $2, 'item', 'pendente', 'encontrado')", [antigo.id, it2.id])
      ids = { venda: venda.id, antigo: antigo.id }
    },
  })
  try {
    const tipos = async (id) => (await b.query("select tipo from pedido_eventos where pedido_id = $1 and tipo in ('qtd','preco','item','pago') order by created_at, id", [id])).rows.map((r) => r.tipo)
    assert.deepEqual(await tipos(ids.venda), ['pago', 'item'])
    assert.deepEqual(await tipos(ids.antigo), ['item'])
  } finally {
    await b.close()
  }
})
