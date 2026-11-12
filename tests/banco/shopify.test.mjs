import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { payload, importar, BACKFILL, pedidoShopifyAntigo, payloadV2, pedidoDe, eventos, prepararEtapa } from './fixtures.mjs'

test('importação: segunda chamada completa número, cidade e UF vazios', async () => {
  assert.equal(await importar(payload()), true)
  assert.equal(await importar(payload({ entrega_numero: '123', entrega_cidade: 'São Paulo', entrega_uf: 'SP' })), false)
  const p = await one("select entrega_numero, entrega_cidade, entrega_uf from pedidos where shopify_order_id = 777001")
  assert.deepEqual(p, { entrega_numero: '123', entrega_cidade: 'São Paulo', entrega_uf: 'SP' })
})

test('importação: mudança de quantidade na Shopify gera um único evento shopify_alterado', async () => {
  await importar(payload())
  await importar(payload())
  const conta = async () => (await one("select count(*)::int n from pedido_eventos e join pedidos p on p.id = e.pedido_id where p.shopify_order_id = 777001 and e.tipo = 'shopify_alterado'")).n
  assert.equal(await conta(), 0)
  await importar(payload({}, 1))
  assert.equal(await conta(), 1)
  await importar(payload({}, 1))
  assert.equal(await conta(), 1)
})

test('backfill da Shopify separa o frete grátis do desconto das peças', async () => {
  const { pedido, a, b } = await pedidoShopifyAntigo()
  await db.exec(BACKFILL)
  const p = await one('select * from pedidos where id = $1', [pedido.id])
  assert.equal(Number(p.frete_cobrado), 0)
  assert.equal(Number(p.frete_original), 36.07)
  assert.equal(Number(p.desconto_frete), 36.07)
  assert.equal(Number(p.desconto_valor), 37.5)
  assert.equal(p.frete_pago_por, 'arvenne')
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [a.id])).preco_pago), 75)
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [b.id])).preco_pago), 37.5)
  assert.equal(Number((await one('select fator_pedido($1) as f', [pedido.id])).f), 0.75)
})

test('importação: preco_pago e frete exatos da Shopify vencem o provisório do backfill', async () => {
  const { pedido, a } = await pedidoShopifyAntigo(777002)
  await db.exec(BACKFILL)
  const exato = {
    ...payload({ shopify_order_id: '777002', valor_total: '112.5', frete_original: '36.07', frete_cobrado: '0', desconto_valor: '37.5' }),
    itens: [{ shopify_variant_id: '11', sku: 'BRI-1', nome: 'Brinco', qtd: 1, preco: '100', preco_pago: '76.00' }],
  }
  assert.equal(await importar(exato), false)
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [a.id])).preco_pago), 76)
  const p = await one('select frete_cobrado, frete_original, desconto_frete, desconto_valor, frete_pago_por from pedidos where id = $1', [pedido.id])
  assert.deepEqual(
    [Number(p.frete_cobrado), Number(p.frete_original), Number(p.desconto_frete), Number(p.desconto_valor), p.frete_pago_por],
    [0, 36.07, 36.07, 37.5, 'arvenne'])
  // Pedido novo grava tudo de uma vez.
  assert.equal(await importar({ ...exato, shopify_order_id: '777003', numero: 'ARV-T3' }), true)
  const n = await one(`select i.preco_pago, p.frete_original, p.frete_cobrado from pedidos p
    join pedido_itens i on i.pedido_id = p.id where p.shopify_order_id = 777003`)
  assert.deepEqual([Number(n.preco_pago), Number(n.frete_original), Number(n.frete_cobrado)], [76, 36.07, 0])
})

test('reembolsado na Shopify cancela o pedido (uma vez só no histórico); novo reembolsado não entra', async () => {
  await importar(payload())
  const p0 = await pedidoDe(777001)
  await importar(payload({ reembolsado: true }))
  await importar(payload({ reembolsado: true }))
  assert.equal((await pedidoDe(777001)).status, 'cancelado')
  assert.equal(await eventos(p0.id, 'shopify_alerta'), 1)
  assert.equal(await importar(payload({ shopify_order_id: '777010', reembolsado: true })), false)
  assert.equal((await db.query('select 1 from pedidos where shopify_order_id = 777010')).rows.length, 0)
  // Já enviado: não volta atrás, só avisa.
  await importar(payload({ shopify_order_id: '777011' }))
  await prepararEtapa((await pedidoDe(777011)).id,'enviado')
  await importar(payload({ shopify_order_id: '777011', reembolsado: true }))
  assert.equal((await pedidoDe(777011)).status, 'enviado')
})

test('reembolso parcial: valor atual é regravado, desconto da carga vale e subtotal - desconto + frete = total', async () => {
  await importar(payloadV2())
  const p0 = await pedidoDe(888001)
  const v = await one('select * from v_pedidos where id = $1', [p0.id])
  assert.deepEqual([Number(v.subtotal), Number(v.desconto), Number(v.frete_na_conta), Number(v.total)], [150, 30, 20, 140])
  // Reembolso parcial da linha B: valor atual 100 (peça B 40 + frete 20 saíram? aqui só B), desconto da carga igual.
  await importar(payloadV2({ valor_total: '100', valor_pago: '100',
    itens: [payloadV2().itens[0]] }))
  const p1 = await pedidoDe(888001)
  assert.deepEqual([Number(p1.valor_total), Number(p1.valor_pago), Number(p1.desconto_valor)], [100, 100, 30])
  assert.equal(await eventos(p0.id, 'shopify_alterado'), 1)
})

test('preco_pago casa por linha da Shopify, mesmo com a mesma variante repetida', async () => {
  const itens = [
    { shopify_line_id: 'R1', shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '40' },
    { shopify_line_id: 'R2', shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '50' }]
  await importar(payloadV2({ shopify_order_id: '888002', itens }))
  const pega = async () => (await db.query(`select i.shopify_line_id l, i.preco_pago::float pp from pedido_itens i
    join pedidos p on p.id = i.pedido_id where p.shopify_order_id = 888002 order by i.ordem`)).rows
  assert.deepEqual(await pega(), [{ l: 'R1', pp: 40 }, { l: 'R2', pp: 50 }])
  itens[0].preco_pago = '45'
  await importar(payloadV2({ shopify_order_id: '888002', itens }))
  assert.deepEqual(await pega(), [{ l: 'R1', pp: 45 }, { l: 'R2', pp: 50 }])
  // Linhas antigas sem id: variante repetida não casa (ficam como estão); variante única casa e ganha o id.
  const ped = await one(`insert into pedidos (origem, status, valor_total, shopify_order_id) values ('shopify', 'novo', 100, 888003) returning id`)
  for (const [n, v] of [[1, 55], [2, 55], [3, 66]])
    await db.query(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, nome, qtd, preco, ordem) values ($1, 'shopify', $2, 'X', 1, 50, $3)`, [ped.id, v, n])
  await importar(payloadV2({ shopify_order_id: '888003', itens: [
    ...itens, { shopify_line_id: 'R3', shopify_variant_id: '66', sku: 'B', nome: 'B', qtd: 1, preco: '50', preco_pago: '30' }] }))
  const l = (await db.query('select shopify_variant_id::int v, shopify_line_id l, preco_pago::float pp from pedido_itens where pedido_id = $1 order by ordem', [ped.id])).rows
  assert.deepEqual(l, [{ v: 55, l: null, pp: null }, { v: 55, l: null, pp: null }, { v: 66, l: 'R3', pp: 30 }])
})

test('importação: frete_pago_por da equipe fica, retirada vem antes de pac, pago_em estimado é corrigido', async () => {
  await importar(payloadV2({ pago_em_estimado: true, pago_em: '2020-01-01T10:00:00Z', frete_titulo: 'Retirada na loja (sem PAC)' }))
  let p = await pedidoDe(888001)
  assert.deepEqual([p.frete_tipo, p.frete_pago_por, p.pago_em_estimado], ['retirada', 'cliente', true])
  await db.query("update pedidos set frete_pago_por = 'arvenne' where id = $1", [p.id])
  await importar(payloadV2({ pago_em: '2020-01-01T12:00:00Z' }))
  p = await pedidoDe(888001)
  assert.equal(p.frete_pago_por, 'arvenne')
  assert.equal(p.pago_em_estimado, false)
  assert.equal(new Date(p.pago_em).toISOString(), '2020-01-01T12:00:00.000Z')
  // Estimativa nova não sobrescreve nada; "Pacote" não é PAC.
  await importar(payloadV2({ pago_em: '2020-02-02T12:00:00Z', pago_em_estimado: true }))
  assert.equal(new Date((await pedidoDe(888001)).pago_em).toISOString(), '2020-01-01T12:00:00.000Z')
  await importar(payloadV2({ shopify_order_id: '888004', frete_titulo: 'Pacote econômico' }))
  assert.equal((await pedidoDe(888004)).frete_tipo, 'outro')
  await importar(payloadV2({ shopify_order_id: '888005', frete_titulo: 'PAC Mini' }))
  assert.equal((await pedidoDe(888005)).frete_tipo, 'PAC')
})

test('Shopify despachada antes da embalagem só avisa (uma vez), sem mover o pedido', async () => {
  await importar(payloadV2())
  await importar(payloadV2({ despachado: true }))
  await importar(payloadV2({ despachado: true }))
  const p = await pedidoDe(888001)
  assert.equal(p.status, 'novo')
  assert.equal(await eventos(p.id, 'shopify_alerta'), 1)
})
