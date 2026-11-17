import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

const membro = async (nome = 'Ana', email = null, ativo = true) =>
  (await one('insert into equipe (nome, email, ativo) values ($1, $2, $3) returning id', [nome, email, ativo])).id
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
  await db.exec('set local role authenticated')
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
