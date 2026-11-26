import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Pedido de venda da LR no Bling (20261129090000): tokens só do service_role, códigos lembrados e pedidos gerados com a visão por pedido.
const UA = '11111111-1111-4111-8111-111111111111'
const UB = '22222222-2222-4222-8222-222222222222'
const UG = '33333333-3333-4333-8333-333333333333'

const membro = async (nome, papel, user_id) =>
  (await one('insert into equipe (nome, papel, user_id) values ($1,$2,$3) returning id', [nome, papel, user_id])).id
const como = async (sub) => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub })}',true)`)
  await db.exec('set local role authenticated')
}

// No Supabase de verdade o service_role ignora a RLS (BYPASSRLS); no banco de teste o papel é criado simples.
const comoServico = async () => {
  await db.exec('reset role')
  await db.exec('alter role service_role bypassrls')
  await db.exec('set local role service_role')
}

async function cenario() {
  const g = await membro('Gestora', 'gestor', UG)
  const ana = await membro('Ana', 'funcionaria', UA)
  const bia = await membro('Bia', 'funcionaria', UB)
  const p1 = await pedidoWhats('faturamento') // Ana
  const p2 = await pedidoWhats('faturamento') // Bia
  await db.query("update pedidos set responsaveis = jsonb_build_object('faturamento', $2::text) where id = $1", [p1.id, ana])
  await db.query("update pedidos set responsaveis = jsonb_build_object('faturamento', $2::text) where id = $1", [p2.id, bia])
  await db.query(`insert into bling_conexao(id, access_token, refresh_token, expira_em, contato_id, contato_nome)
    values (true, 'TOKEN-SECRETO', 'REFRESH-SECRETO', now() + interval '6 hours', 77, 'Arvenne')`)
  await db.query(`insert into bling_pedidos(pedido_id, bling_id, bling_numero, total) values ($1, 1, '100', 10), ($2, 2, '200', 20), (null, 3, '300', 30)`, [p1.id, p2.id])
  await db.query("insert into bling_codigos(sku, codigo_bling) values ('AN-1', 'ANEL-001')")
  return { g, ana, bia, p1, p2 }
}

test('as três tabelas têm RLS ligada', async () => {
  const r = (await db.query("select relname, relrowsecurity from pg_class where relname in ('bling_conexao','bling_codigos','bling_pedidos') order by 1")).rows
  expect(r).toEqual([
    { relname: 'bling_codigos', relrowsecurity: true },
    { relname: 'bling_conexao', relrowsecurity: true },
    { relname: 'bling_pedidos', relrowsecurity: true },
  ])
})

test('anon não lê nada nem executa bling_situacao', async () => {
  await cenario()
  await db.exec('set local role anon')
  await recusa(() => one('select * from bling_conexao'), /permission denied/)
  await recusa(() => one('select * from bling_codigos'), /permission denied/)
  await recusa(() => one('select * from bling_pedidos'), /permission denied/)
  await recusa(() => one('select * from bling_situacao()'), /permission denied/)
})

test('ninguém do app (gestor ou funcionária) lê ou grava a conexão: os tokens ficam só com o service_role', async () => {
  await cenario()
  for (const sub of [UG, UA]) {
    await como(sub)
    await recusa(() => one('select * from bling_conexao'), /permission denied/)
    await recusa(() => one('select access_token from bling_conexao'), /permission denied/)
    await recusa(() => one("update bling_conexao set contato_id = 1"), /permission denied/)
    await recusa(() => one("insert into bling_conexao(id) values (false)"), /permission denied|violates/)
  }
  await comoServico()
  expect((await one('select access_token from bling_conexao')).access_token).toBe('TOKEN-SECRETO')
})

test('bling_situacao diz se está conectado sem devolver token; sem conexão devolve "não conectado"', async () => {
  await cenario()
  await como(UA)
  const s = await one('select * from bling_situacao()')
  expect(Object.keys(s).sort()).toEqual(['conectado', 'contato_definido', 'contato_nome', 'expira_em'])
  expect(s).toMatchObject({ conectado: true, contato_definido: true, contato_nome: 'Arvenne' })
  expect(JSON.stringify(s)).not.toMatch(/SECRETO/)
  await db.exec('reset role')
  await db.query('update bling_conexao set refresh_token = null, contato_id = null')
  await como(UA)
  expect(await one('select conectado, contato_definido from bling_situacao()')).toEqual({ conectado: false, contato_definido: false })
  await db.exec('reset role')
  await db.query('delete from bling_conexao')
  await como(UA)
  expect(await one('select conectado, contato_definido, contato_nome from bling_situacao()')).toEqual({ conectado: false, contato_definido: false, contato_nome: null })
})

test('códigos lembrados: quem tem login lê; ninguém grava pelo app (só a função Edge)', async () => {
  await cenario()
  await como(UA)
  expect((await db.query('select sku, codigo_bling from bling_codigos')).rows).toEqual([{ sku: 'AN-1', codigo_bling: 'ANEL-001' }])
  await recusa(() => one("insert into bling_codigos(sku, codigo_bling) values ('X','Y')"), /permission denied/)
  await recusa(() => one("update bling_codigos set codigo_bling = 'Z'"), /permission denied/)
  await recusa(() => one('delete from bling_codigos'), /permission denied/)
  await comoServico()
  await one("insert into bling_codigos(sku, codigo_bling) values ('BR-2','BRINCO-2')")
  await recusa(() => one("insert into bling_codigos(sku, codigo_bling) values ('V','  ')"), /check/)
})

test('pedidos gerados: a funcionária vê só os do pedido que vê; o gestor vê todos, inclusive os da página PDV LR', async () => {
  const { p1, p2 } = await cenario()
  await como(UA)
  expect((await db.query('select bling_numero from bling_pedidos order by 1')).rows.map((r) => r.bling_numero)).toEqual(['100'])
  expect((await db.query('select bling_numero from bling_pedidos where pedido_id = $1', [p2.id])).rows).toEqual([])
  await como(UB)
  expect((await db.query('select bling_numero from bling_pedidos')).rows.map((r) => r.bling_numero)).toEqual(['200'])
  await como(UG)
  expect((await db.query('select bling_numero from bling_pedidos order by 1')).rows.map((r) => r.bling_numero)).toEqual(['100', '200', '300'])
  // Quando o pedido muda de etapa e sai da vista dela, o registro sai junto.
  await db.exec('reset role')
  await db.query("update pedidos set responsaveis = jsonb_build_object('faturamento', $2::text) where id = $1", [p1.id, (await one("select id from equipe where nome='Bia'")).id])
  await como(UA)
  expect((await db.query('select 1 from bling_pedidos')).rows).toEqual([])
})

test('pedidos gerados: ninguém do app grava nem apaga; o service_role grava mas não apaga', async () => {
  const { p1 } = await cenario()
  for (const sub of [UG, UA]) {
    await como(sub)
    await recusa(() => one("insert into bling_pedidos(pedido_id, bling_id) values ($1, 9)", [p1.id]), /permission denied/)
    await recusa(() => one("update bling_pedidos set total = 0"), /permission denied/)
    await recusa(() => one('delete from bling_pedidos'), /permission denied/)
  }
  await comoServico()
  await one("insert into bling_pedidos(pedido_id, bling_id, total) values ($1, 9, 5)", [p1.id])
  await recusa(() => one('delete from bling_pedidos'), /permission denied/)
})

test('o pedido da etapa continua sem DELETE e o registro do Bling não deixa apagar pedido com histórico', async () => {
  const { p1 } = await cenario()
  await db.exec('reset role')
  await recusa(() => one('delete from pedidos where id = $1', [p1.id]), /foreign key|violates/)
})

test('o bypass do service_role é só do teste: o rollback do teste anterior desfaz', async () => {
  expect((await one("select rolbypassrls from pg_roles where rolname = 'service_role'")).rolbypassrls).toBe(false)
})
