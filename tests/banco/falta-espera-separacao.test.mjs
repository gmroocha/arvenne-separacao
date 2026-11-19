import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats } from './fixtures.mjs'

// V114: peça em falta na Separação só leva o pedido para "Avisar cliente" quando a separadora termina as outras peças
// (todas encontradas, em falta ou retiradas). Enquanto houver peça pendente, o pedido fica na Separação.
async function montar(status = 'novo', pecas = 3) {
  const p = await one("insert into pedidos(origem,status,cliente_nome) values('whatsapp',$1,'Cliente') returning id", [status])
  const itens = []
  for (let n = 0; n < pecas; n++) {
    itens.push((await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem) values($1,'avulso',$2,$3,1,10,$4) returning id",
      [p.id, `Peça ${n}`, `P${n}`, n])).id)
  }
  await db.exec('set local role authenticated')
  return { p, itens }
}
const status = async (id) => (await one('select status from pedidos where id=$1', [id])).status
const achar = (pedido, ids) => one('select marcar_pecas($1,$2::jsonb)',
  [pedido, JSON.stringify(ids.map((item) => ({ item, campo: 'status', valor: 'encontrado' })))])

test('V114: a primeira peça em falta não leva para Avisar cliente; só depois de achar as outras', async () => {
  const { p, itens: [a, b, c] } = await montar('novo')
  await one('select marcar_falta($1,1)', [a])
  expect(await status(p.id)).toBe('separacao')
  await achar(p.id, [b])
  expect(await status(p.id), 'ainda falta separar uma peça').toBe('separacao')
  await achar(p.id, [c])
  expect(await one('select status,etapa_antes_desvio from pedidos where id=$1', [p.id]))
    .toEqual({ status: 'avisar_cliente', etapa_antes_desvio: 'separacao' })
})

test('V114: falta pelo menu (alterar_item) também espera as outras peças', async () => {
  const { p, itens: [a, b] } = await montar('separacao', 2)
  await one('select alterar_item($1,$2::jsonb)', [a, JSON.stringify({ status: 'falta' })])
  expect(await status(p.id)).toBe('separacao')
  await one('select alterar_item($1,$2::jsonb)', [b, JSON.stringify({ status: 'encontrado' })])
  expect(await status(p.id)).toBe('avisar_cliente')
})

test('V114: a última peça pendente marcada como falta leva para Avisar cliente na hora', async () => {
  const { p, itens: [a, b] } = await montar('separacao', 2)
  await achar(p.id, [a])
  await one("select marcar_falta($1,1,'defeito')", [b])
  expect(await status(p.id)).toBe('avisar_cliente')
})

test('V114: falta parcial com o resto da linha ainda por separar fica na Separação', async () => {
  const p = await one("insert into pedidos(origem,status,cliente_nome) values('whatsapp','separacao','Cliente') returning id")
  const i = await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values($1,'avulso','Peça','P1',2,10) returning id", [p.id])
  await db.exec('set local role authenticated')
  await one('select marcar_falta($1,1)', [i.id])
  expect(await status(p.id)).toBe('separacao')
  await achar(p.id, [i.id])
  expect(await status(p.id)).toBe('avisar_cliente')
})

test('V114: retirar a última peça pendente com outra em falta leva para Avisar cliente', async () => {
  const { p, itens: [a, b] } = await montar('separacao', 2)
  await one('select marcar_falta($1,1)', [a])
  await one('select alterar_item($1,$2::jsonb)', [b, JSON.stringify({ status: 'removido' })])
  expect(await status(p.id)).toBe('avisar_cliente')
})

test('V114: na Conferência (todas as peças já achadas) a falta continua abrindo o aviso na hora', async () => {
  const { p, itens: [a, b] } = await montar('separacao', 2)
  await achar(p.id, [a, b])
  expect(await status(p.id)).toBe('conferencia')
  await one('select alterar_item($1,$2::jsonb)', [a, JSON.stringify({ status: 'falta' })])
  expect(await one('select status,etapa_antes_desvio from pedidos where id=$1', [p.id]))
    .toEqual({ status: 'avisar_cliente', etapa_antes_desvio: 'conferencia' })
})

test('V114: sair do aviso vindo da Postagem sem embalagem volta para Embalagem e frete (não para a antiga etapa Frete)', async () => {
  const p = await pedidoWhats('pronto_envio')
  const a = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  expect(await one('select status,etapa_antes_desvio from pedidos where id=$1', [p.id]))
    .toEqual({ status: 'avisar_cliente', etapa_antes_desvio: 'pronto_envio' })
  await db.query('update pedidos set embalado_em = null where id = $1', [p.id])
  await db.query("update pedido_itens set status = 'encontrado' where id = $1", [a.id])
  await db.exec('set local role authenticated')
  expect((await one('select sair_do_desvio($1) s', [p.id])).s).toBe('embalagem')
})
