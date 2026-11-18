import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

const membro = async (nome = 'Ana', email = null, ativo = true, papel = 'funcionaria') =>
  (await one('insert into equipe (nome, email, ativo, papel) values ($1, $2, $3, $4) returning id', [nome, email, ativo, papel])).id
const responsaveis = async (id) => (await one('select responsaveis r from pedidos where id = $1', [id])).r
const designados = async (id) => Number((await one("select count(*) n from pedido_eventos where pedido_id = $1 and tipo = 'designado'", [id])).n)

test('designar: grava, troca e tira o responsável de uma etapa, com evento e leitura pela v_pedidos', async () => {
  const p = await pedidoWhats('separacao')
  const ana = await membro('Ana', 'ana@arvenne.test')
  const bia = await membro('Bia')
  await db.exec('set local role authenticated')
  assert.deepEqual(await responsaveis(p.id), {})
  await one("select designar($1, 'separacao', $2)", [p.id, ana])
  await one("select designar($1, 'frete', $2)", [p.id, bia])
  assert.deepEqual(await responsaveis(p.id), { separacao: ana, frete: bia })
  assert.deepEqual((await one('select responsaveis r from v_pedidos where id = $1', [p.id])).r, { separacao: ana, frete: bia })
  await one("select designar($1, 'separacao', $2)", [p.id, bia])
  assert.deepEqual(await responsaveis(p.id), { separacao: bia, frete: bia })
  await one("select designar($1, 'separacao', null)", [p.id])
  assert.deepEqual(await responsaveis(p.id), { frete: bia })
  await db.exec('reset role')
  const eventos = (await db.query("select para, texto from pedido_eventos where pedido_id = $1 and tipo = 'designado' order by id", [p.id])).rows
  assert.deepEqual(eventos, [
    { para: 'separacao', texto: 'Ana' }, { para: 'frete', texto: 'Bia' },
    { para: 'separacao', texto: 'Bia' }, { para: 'separacao', texto: 'ninguém' },
  ])
})

test('designar: sem mudança não grava nada nem repete o evento', async () => {
  const p = await pedidoWhats('novo')
  const ana = await membro()
  await db.exec('set local role authenticated')
  await one("select designar($1, 'conferencia', $2)", [p.id, ana])
  await one("select designar($1, 'conferencia', $2)", [p.id, ana])
  await one("select designar($1, 'bipagem', null)", [p.id])
  assert.equal(await designados(p.id), 1)
})

test('designar: recusa etapa inválida, pessoa inativa ou inexistente, pedido arquivado ou excluído', async () => {
  const p = await pedidoWhats('separacao')
  const ana = await membro()
  const inativa = await membro('Cris', null, false)
  await db.exec('set local role authenticated')
  for (const etapa of ['enviado', 'novo', 'inventada', null]) {
    await recusa(() => one('select designar($1, $2, $3)', [p.id, etapa, ana]), /Etapa inválida/)
  }
  await recusa(() => one("select designar($1, 'separacao', $2)", [p.id, inativa]), /inativa/)
  await recusa(() => one("select designar($1, 'separacao', gen_random_uuid())", [p.id]), /inativa|não encontrada/)
  await recusa(() => one("select designar(gen_random_uuid(), 'separacao', $1)", [ana]), /Pedido não encontrado/)
  // Quem já estava designado e foi desativada continua no pedido (e pode ser tirada).
  await db.exec('reset role')
  await db.query("update pedidos set responsaveis = jsonb_build_object('separacao', $2::text) where id = $1", [p.id, inativa])
  await db.exec('set local role authenticated')
  await one("select designar($1, 'separacao', null)", [p.id])
  assert.deepEqual(await responsaveis(p.id), {})
  // Pedido arquivado ou excluído não recebe responsável.
  await db.exec('reset role')
  const enviado = await pedidoWhats('enviado')
  await db.exec('set local role authenticated')
  await recusa(() => one("select designar($1, 'separacao', $2)", [enviado.id, ana]), /esteira/)
  await db.exec('reset role')
  const venda = await pedidoWhats('em_aberto')
  await db.exec('set local role authenticated')
  await one('select excluir_pedido($1)', [venda.id])
  await recusa(() => one("select designar($1, 'separacao', $2)", [venda.id, ana]), /Pedido não encontrado/)
})

test('time: equipe lê, cria e edita; não apaga; anon não acessa; e-mail não repete (sem diferença de caixa)', async () => {
  // V109: criar e editar é do gestor (aqui, o login de teste é o de "Gestora").
  await membro('Gestora', 'gestora@arvenne.test', true, 'gestor')
  await db.exec("select set_config('request.jwt.claims','{\"email\":\"Gestora@Arvenne.test\"}',true); set local role authenticated")
  const ana = await membro('Ana', 'Ana@Arvenne.test')
  await recusa(() => membro('Outra', 'ana@arvenne.test'), /duplicate|unique|único/)
  await membro('Sem e-mail 1'); await membro('Sem e-mail 2') // e-mail é opcional e nulo pode repetir
  await recusa(() => membro(''), /check/)
  await recusa(() => membro('x'.repeat(61)), /check/)
  await db.query("update equipe set ativo = false where id = $1", [ana])
  assert.equal((await one('select ativo from equipe where id = $1', [ana])).ativo, false)
  await recusa(() => db.query('delete from equipe where id = $1', [ana]), /permission denied/)
  await db.exec('reset role; set local role anon')
  await recusa(() => one('select * from equipe'), /permission denied/)
  await recusa(() => one('insert into equipe (nome) values ($1)', ['Intrusa']), /permission denied/)
  await recusa(() => one("select designar(gen_random_uuid(), 'separacao', null)"), /permission denied/)
})

test('time: só designar() grava responsaveis válidos (objeto JSON) e as telas recebem aviso de mudança no time', async () => {
  const p = await pedidoWhats('separacao')
  await db.exec('set local role authenticated')
  await recusa(() => db.query("update pedidos set responsaveis = '[]'::jsonb where id = $1", [p.id]), /check/)
  await db.exec('reset role')
  await db.exec('delete from realtime.messages')
  await membro('Dani')
  const avisos = (await db.query("select payload from realtime.messages where topic = 'pedidos'")).rows.map((r) => r.payload)
  assert.ok(avisos.some((m) => m.t === 'equipe' && m.p.length === 0))
})

// Papéis suspensos (18/11/2026): todo mundo logado faz tudo no Time; papel fica guardado, mas não vale.
// (V109 voltará quando o Gustavo pedir os papéis de novo.)
const entrarComo = (email) => db.exec(`select set_config('request.jwt.claims','{"email":"${email}"}',true); set local role authenticated`)

test('papéis suspensos: qualquer login cria, edita, desativa, troca papel e exclui pessoas', async () => {
  await membro('Gestor', 'gestor@arvenne.test', true, 'gestor')
  const func = await membro('Funcionária', 'func@arvenne.test')
  const outra = await membro('Outra')
  for (const email of ['func@arvenne.test', 'ninguem@arvenne.test']) {
    await db.exec('reset role')
    await entrarComo(email)
    assert.equal((await one('select sou_gestor() s')).s, true)
  }
  await db.exec('reset role')
  await entrarComo('func@arvenne.test')
  await one("insert into equipe (nome) values ('Nova')")
  await db.query("update equipe set ativo=false, papel='gestor' where id=$1", [outra])
  assert.deepEqual(await one('select ativo, papel from equipe where id=$1', [outra]), { ativo: false, papel: 'gestor' })
  await db.query("update equipe set nome='Funcionária 2' where id=$1", [func])
  await one('select excluir_membro($1)', [outra])
  assert.equal((await one('select count(*)::int n from equipe where id=$1', [outra])).n, 0)
})

test('papéis suspensos: a única gestora pode ser desativada, rebaixada ou excluída', async () => {
  const ger = await membro('Gestor', 'gestor@arvenne.test', true, 'gestor')
  await entrarComo('gestor@arvenne.test')
  await db.query("update equipe set papel='funcionaria' where id=$1", [ger])
  await db.query("update equipe set ativo=false where id=$1", [ger])
  await one('select excluir_membro($1)', [ger])
  assert.equal((await one('select count(*)::int n from equipe')).n, 0)
})

test('V109: permissões novas: sou_gestor não é público, equipe continua sem DELETE e a migration não traz e-mail', async () => {
  const priv = await one(`select has_function_privilege('authenticated','public.sou_gestor()','execute') as auth,
    has_function_privilege('anon','public.sou_gestor()','execute') as anon,
    has_table_privilege('authenticated','public.equipe','delete') as apaga`)
  assert.deepEqual(priv, { auth: true, anon: false, apaga: false })
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync('supabase/migrations/20261123090000_rodada3.sql', 'utf8')
  assert.equal(/@/.test(sql), false, 'a migration não pode ter e-mail')
})
