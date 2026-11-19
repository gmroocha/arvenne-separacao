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
  await one("select designar($1, 'embalagem', $2)", [p.id, bia])
  assert.deepEqual(await responsaveis(p.id), { separacao: ana, embalagem: bia })
  assert.deepEqual((await one('select responsaveis r from v_pedidos where id = $1', [p.id])).r, { separacao: ana, embalagem: bia })
  await one("select designar($1, 'separacao', $2)", [p.id, bia])
  assert.deepEqual(await responsaveis(p.id), { separacao: bia, embalagem: bia })
  await one("select designar($1, 'separacao', null)", [p.id])
  assert.deepEqual(await responsaveis(p.id), { embalagem: bia })
  await db.exec('reset role')
  const eventos = (await db.query("select para, texto from pedido_eventos where pedido_id = $1 and tipo = 'designado' order by id", [p.id])).rows
  assert.deepEqual(eventos, [
    { para: 'separacao', texto: 'Ana' }, { para: 'embalagem', texto: 'Bia' },
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
  await db.exec("select set_config('request.jwt.claims','{\"email\":\"Gestora@Arvenne.test\",\"role\":\"authenticated\"}',true); set local role authenticated")
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

// V109: papéis. Só o gestor (pessoa ativa da equipe com o e-mail do login) adiciona, edita, desativa e exclui pessoas e
// troca o papel; a funcionária lê tudo. O time nunca fica sem gestor ativo.
const entrarComo = (email) => db.exec(`select set_config('request.jwt.claims','{"email":"${email}","role":"authenticated"}',true); set local role authenticated`)

test('V109: sou_gestor vale só para pessoa ativa, com papel de gestor e o e-mail do login (sem diferença de caixa)', async () => {
  await membro('Gestor', 'Gestor@Arvenne.test', true, 'gestor')
  await membro('Funcionária', 'func@arvenne.test')
  await membro('Gestor inativo', 'inativo@arvenne.test', false, 'gestor')
  const quem = async (email) => { await db.exec('reset role'); await entrarComo(email); return (await one('select sou_gestor() s')).s }
  assert.equal(await quem('gestor@arvenne.test'), true)
  assert.equal(await quem('FUNC@arvenne.test'), false)
  assert.equal(await quem('inativo@arvenne.test'), false)
  assert.equal(await quem('ninguem@arvenne.test'), false)
  // Sem JWT de pessoa (cron, gatilhos, service_role) vale como sistema e passa.
  await db.exec("reset role; select set_config('request.jwt.claims','',true); set local role authenticated")
  assert.equal((await one('select sou_gestor() s')).s, true, 'sem login de pessoa ("sistema")')
  await db.exec(`reset role; select set_config('request.jwt.claims','{"role":"authenticated"}',true); set local role authenticated`)
  assert.equal((await one('select sou_gestor() s')).s, false, 'login de pessoa sem e-mail nem user_id')
})

test('V109: a funcionária lê a lista, mas não cria, edita, desativa nem exclui ninguém; o gestor faz tudo', async () => {
  const ger = await membro('Gestor', 'gestor@arvenne.test', true, 'gestor')
  const func = await membro('Funcionária', 'func@arvenne.test')
  const outra = await membro('Outra')
  await entrarComo('func@arvenne.test')
  assert.equal((await db.query('select * from equipe')).rows.length, 3, 'lê o time inteiro')
  await recusa(() => one("insert into equipe (nome) values ('Nova')"), /row-level security|policy/)
  // Sem política de UPDATE para a funcionária, a atualização não encontra linha (nada muda).
  await db.query("update equipe set ativo=false, papel='gestor' where id=$1", [outra])
  await db.query("update equipe set papel='gestor' where id=$1", [func])
  assert.deepEqual((await one('select ativo, papel from equipe where id=$1', [outra])), { ativo: true, papel: 'funcionaria' })
  assert.equal((await one('select papel from equipe where id=$1', [func])).papel, 'funcionaria', 'ninguém se promove sozinha')
  await recusa(() => one('select excluir_membro($1)', [outra]), /Só o gestor/)
  await db.exec('reset role')
  await entrarComo('gestor@arvenne.test')
  await one("insert into equipe (nome, email) values ('Nova', 'nova@arvenne.test')")
  await db.query("update equipe set papel='gestor' where id=$1", [func]) // o gestor promove a segunda pessoa
  assert.equal((await one('select papel from equipe where id=$1', [func])).papel, 'gestor')
  await db.query("update equipe set ativo=false where id=$1", [outra])
  await one('select excluir_membro($1)', [outra])
  assert.equal((await one('select count(*)::int n from equipe where id=$1', [outra])).n, 0)
  assert.ok(ger)
})

test('V109: o último gestor ativo não sai (nem excluindo, nem desativando, nem passando para funcionária)', async () => {
  const ger = await membro('Gestor', 'gestor@arvenne.test', true, 'gestor')
  await entrarComo('gestor@arvenne.test')
  await recusa(() => db.query("update equipe set papel='funcionaria' where id=$1", [ger]), /pelo menos um gestor/)
  await recusa(() => db.query("update equipe set ativo=false where id=$1", [ger]), /pelo menos um gestor/)
  await recusa(() => one('select excluir_membro($1)', [ger]), /pelo menos um gestor/)
  // Com um segundo gestor, o primeiro pode sair; o segundo vira o último.
  const seg = await membro('Segunda', 'segunda@arvenne.test', true, 'gestor')
  await db.query("update equipe set papel='funcionaria' where id=$1", [ger])
  await db.exec('reset role')
  await entrarComo('segunda@arvenne.test')
  await recusa(() => db.query("update equipe set papel='funcionaria' where id=$1", [seg]), /pelo menos um gestor/)
})

test('V109: permissões novas: sou_gestor não é público, equipe continua sem DELETE e a migration não traz e-mail', async () => {
  const priv = await one(`select has_function_privilege('authenticated','public.sou_gestor()','execute') as auth,
    has_function_privilege('anon','public.sou_gestor()','execute') as anon,
    has_table_privilege('authenticated','public.equipe','delete') as apaga`)
  assert.deepEqual(priv, { auth: true, anon: false, apaga: false })
  const { readFileSync } = await import('node:fs')
  for (const arq of ['20261123090000_rodada3', '20261126090000_acesso_e_papeis', '20261126100000_visibilidade_pedidos']) {
    const sql = readFileSync(`supabase/migrations/${arq}.sql`, 'utf8')
    assert.equal(/@/.test(sql), false, `a migration ${arq} não pode ter e-mail`)
  }
})
