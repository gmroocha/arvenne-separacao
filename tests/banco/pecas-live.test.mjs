import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa, entrarComo } from './fixtures.mjs'

// Peças da Live: pecas_clube/clube_modelos com catalogo 'live' e data da live (live_em).
const salvar = async (p) => (await one('select salvar_modelo_clube($1::jsonb) as r', [JSON.stringify(p)])).r
const entrar = () => entrarComo('ana@arvenne.test')
const lives = async () => (await db.query('select live_em::text as d, pecas from lives()')).rows

test('Live: peça simples e produto com variantes gravam catálogo e data; as variantes herdam do pai', async () => {
  await entrar()
  const [a, b] = await salvar([
    { codigo: 'LV-1', nome: 'Brinco Live', preco: 30, catalogo: 'live', live_em: '2026-11-24' },
    { codigo: 'LV-AN', nome: 'Anel Live', preco: 50, catalogo: 'live', live_em: '2026-11-24', variantes: [{ codigo: 'LV-AN-14', variante: 'N°14' }, { codigo: 'LV-AN-16', variante: 'N°16' }] },
  ])
  expect(a.pecas[0]).toMatchObject({ catalogo: 'live', live_em: '2026-11-24' })
  const modelo = await one('select catalogo, live_em::text as live_em from clube_modelos where id=$1', [b.modelo_id])
  expect(modelo).toEqual({ catalogo: 'live', live_em: '2026-11-24' })
  for (const p of b.pecas) expect(p).toMatchObject({ catalogo: 'live', live_em: '2026-11-24', modelo_id: b.modelo_id })
  // Editar o produto muda a data de todas as variantes.
  await salvar({ id: b.modelo_id, codigo: 'LV-AN', nome: 'Anel Live', catalogo: 'live', live_em: '2026-11-25', variantes: [] })
  const datas = (await db.query('select live_em::text as d from pecas_clube where modelo_id=$1', [b.modelo_id])).rows
  expect(datas.every((x) => x.d === '2026-11-25')).toBe(true)
})

test('Live: sem catálogo a peça continua do Clube; live exige data e catálogo inválido é recusado', async () => {
  await entrar()
  const [r] = await salvar({ codigo: 'CL-1', nome: 'Peça Clube' })
  expect(r.pecas[0]).toMatchObject({ catalogo: 'clube', live_em: null })
  await recusa(() => salvar({ codigo: 'X', nome: 'X', catalogo: 'live' }), /informe a data da live/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', catalogo: 'outro' }), /catálogo inválido/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', catalogo: 'live', live_em: 'ontem' }), /data da live inválida/)
  // Check direto na tabela: live <=> data.
  await recusa(() => one("insert into pecas_clube(codigo,nome,catalogo) values ('Y','Y','live')"), /pecas_clube_live_data/)
  await recusa(() => one("insert into pecas_clube(codigo,nome,live_em) values ('Y','Y','2026-11-24')"), /pecas_clube_live_data/)
})

test('Live: lives() conta só as peças ativas, a mais recente primeiro, e o Clube não aparece', async () => {
  await entrar()
  await salvar([
    { codigo: 'A-1', nome: 'A', catalogo: 'live', live_em: '2026-11-20' },
    { codigo: 'A-2', nome: 'B', catalogo: 'live', live_em: '2026-11-24' },
    { codigo: 'A-3', nome: 'C', catalogo: 'live', live_em: '2026-11-24' },
    { codigo: 'A-4', nome: 'D', catalogo: 'live', live_em: '2026-11-24', ativo: false },
    { codigo: 'CL-9', nome: 'Clube' },
  ])
  expect(await lives()).toEqual([{ d: '2026-11-24', pecas: 2 }, { d: '2026-11-20', pecas: 1 }])
  const clube = (await db.query("select codigo from pecas_clube where catalogo='clube'")).rows.map((x) => x.codigo)
  expect(clube).toEqual(['CL-9'])
})

test('Live: permissões: lives() só para quem tem login', async () => {
  const priv = await one(`select has_function_privilege('authenticated','public.lives()','execute') as auth,
    has_function_privilege('anon','public.lives()','execute') as anon`)
  expect(priv).toEqual({ auth: true, anon: false })
  await db.exec('set local role anon')
  await recusa(() => one('select * from lives()'), /permission denied/)
  await db.exec('reset role')
})

test('Live: a peça da live entra no pedido como origem clube e o dinheiro não muda', async () => {
  await db.exec('reset role')
  const p = await pedidoWhats('em_aberto')
  await entrar()
  const [r] = await salvar({ codigo: 'LV-9', nome: 'Colar Live', preco: 70, catalogo: 'live', live_em: '2026-11-24' })
  await db.exec('reset role')
  const v = r.pecas[0]
  const item = await one(`insert into pedido_itens(pedido_id,origem,peca_clube_id,sku,nome,qtd,preco,ordem)
    values ($1,'clube',$2,$3,$4,1,$5,9) returning *`, [p.id, v.id, v.codigo, v.nome, v.preco])
  expect(item.peca_clube_id).toBe(v.id)
  expect(Number((await one('select subtotal from v_pedidos where id=$1', [p.id])).subtotal)).toBe(50 + 30 + 70)
})
