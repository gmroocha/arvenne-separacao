import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Fase 2 (20261126090000 e 20261126100000): login por usuário, papéis e "cada uma vê os seus".
// Gestor vê tudo; funcionária vê só o pedido cuja ETAPA ATUAL tem ela como responsável (responsaveis ->> etapa = membro_atual()).

const UA = '11111111-1111-4111-8111-111111111111'
const UB = '22222222-2222-4222-8222-222222222222'
const UG = '33333333-3333-4333-8333-333333333333'

const membro = async (nome, papel, extra = {}) =>
  (await one('insert into equipe (nome, papel, email, user_id, ativo) values ($1,$2,$3,$4,$5) returning id',
    [nome, papel, extra.email ?? null, extra.user_id ?? null, extra.ativo ?? true])).id

// Entra como alguém: JWT de pessoa (role authenticated), com sub e/ou e-mail. Sem argumentos: sem JWT de pessoa (sistema).
const como = async (claims) => {
  await db.exec('reset role')
  if (claims) await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', ...claims })}',true)`)
  await db.exec('set local role authenticated')
}
const sistema = async () => { await db.exec('reset role'); await db.exec("select set_config('request.jwt.claims','',true)"); await db.exec('set local role authenticated') }
const verPedidos = async () => (await db.query('select id from pedidos')).rows.map((r) => r.id).sort()
const ordenar = (...ids) => ids.sort()
const responsaveis = async (id) => (await one('select responsaveis r from pedidos where id=$1', [id])).r

async function cenario() {
  const g = await membro('Gestora', 'gestor', { user_id: UG })
  const ana = await membro('Ana', 'funcionaria', { user_id: UA })
  const bia = await membro('Bia', 'funcionaria', { user_id: UB })
  const p1 = await pedidoWhats('separacao') // Ana
  const p2 = await pedidoWhats('separacao') // Bia
  const p3 = await pedidoWhats('separacao') // ninguém
  await db.query("update pedidos set responsaveis = jsonb_build_object('separacao', $2::text) where id = $1", [p1.id, ana])
  await db.query("update pedidos set responsaveis = jsonb_build_object('separacao', $2::text) where id = $1", [p2.id, bia])
  return { g, ana, bia, p1, p2, p3 }
}

test('cada uma vê só os pedidos da etapa em que é responsável; gestor e sistema veem tudo; sem responsável só o gestor vê', async () => {
  const { p1, p2, p3 } = await cenario()
  await como({ sub: UA })
  assert.deepEqual(await verPedidos(), [p1.id])
  assert.deepEqual((await db.query('select id from v_pedidos')).rows.map((r) => r.id), [p1.id])
  assert.deepEqual((await db.query('select id from v_pedidos_operacao')).rows.map((r) => r.id), [p1.id])
  assert.deepEqual([...new Set((await db.query('select pedido_id from pedido_itens')).rows.map((r) => r.pedido_id))], [p1.id])
  assert.deepEqual([...new Set((await db.query('select pedido_id from pedido_eventos')).rows.map((r) => r.pedido_id))], [p1.id])
  await como({ sub: UB })
  assert.deepEqual(await verPedidos(), [p2.id])
  assert.deepEqual([...new Set((await db.query('select pedido_id from pedido_itens')).rows.map((r) => r.pedido_id))], [p2.id])
  await como({ sub: UG })
  assert.deepEqual(await verPedidos(), ordenar(p1.id, p2.id, p3.id))
  assert.equal((await db.query('select 1 from pedido_itens')).rows.length, 6)
  await sistema()
  assert.deepEqual(await verPedidos(), ordenar(p1.id, p2.id, p3.id))
})

test('a lista conta só o que a funcionária vê (contagens_pedidos)', async () => {
  await cenario()
  await db.query("update pedidos set pago_em = now() - interval '30 days'") // os três atrasados
  await como({ sub: UA })
  assert.equal((await one('select contagens_pedidos() c')).c.atrasados, 1)
  await como({ sub: UG })
  assert.equal((await one('select contagens_pedidos() c')).c.atrasados, 3)
})

test('o pedido troca de dona ao mudar de etapa: some para quem fez e aparece para a responsável da etapa nova', async () => {
  const { ana, bia, p1 } = await cenario()
  await db.query("update pedidos set responsaveis = responsaveis || jsonb_build_object('conferencia', $2::text) where id = $1", [p1.id, bia])
  await como({ sub: UA })
  const itens = (await db.query('select id from pedido_itens where pedido_id = $1', [p1.id])).rows
  const r = (await one('select marcar_pecas($1,$2::jsonb) r', [p1.id, JSON.stringify(itens.map((i) => ({ item: i.id, campo: 'status', valor: 'encontrado' })))])).r
  // A resposta continua completa mesmo com o pedido já fora da vista dela.
  assert.equal(r.pedido.status, 'conferencia')
  assert.equal(r.itens.length, 2)
  assert.deepEqual(await verPedidos(), [])
  assert.equal((await db.query('select 1 from pedido_itens')).rows.length, 0)
  await como({ sub: UB })
  assert.ok((await verPedidos()).includes(p1.id), 'Bia (conferência) agora vê o pedido')
  assert.deepEqual(await responsaveis(p1.id), { separacao: ana, conferencia: bia })
})

test('desvio (avisar cliente) continua com quem estava na etapa de origem', async () => {
  const { p1, p2 } = await cenario()
  await db.query("update pedido_itens set status = 'falta' where pedido_id = $1", [p1.id])
  await db.query("update pedidos set status = 'avisar_cliente' where id = $1", [p1.id])
  assert.equal((await one('select status from pedidos where id=$1', [p1.id])).status, 'avisar_cliente')
  await como({ sub: UA })
  assert.deepEqual(await verPedidos(), [p1.id])
  await como({ sub: UB })
  assert.deepEqual(await verPedidos(), [p2.id], 'Bia só vê o dela')
})

test('funcionária não mexe em pedido que não vê: mover_etapa, marcar_pecas, designar, excluir e editar direto são recusados', async () => {
  const { ana, p1, p2 } = await cenario()
  await como({ sub: UA })
  const item = (await db.query('select id from pedido_itens where pedido_id=$1', [p2.id])).rows
  assert.deepEqual(item, [], 'nem enxerga as peças')
  await recusa(() => one("select mover_etapa($1,'conferencia')", [p2.id]), /não está com você/)
  await recusa(() => one("select marcar_pecas($1,'[]'::jsonb)", [p2.id]), /não está com você/)
  await recusa(() => one("select sair_do_desvio($1)", [p2.id]), /não está com você/)
  await recusa(() => one("select marcar_devolvido($1)", [p2.id]), /não está com você/)
  await recusa(() => one("select designar($1,'separacao',$2)", [p1.id, ana]), /Só o gestor/)
  await recusa(() => one('select excluir_pedido($1)', [p1.id]), /Só o gestor/)
  await recusa(() => one("select somar_venda($1,'Pix',10)", [p1.id]), /Só o gestor/)
  await recusa(() => one('select preencher_responsaveis_padrao()'), /Só o gestor/)
  await recusa(() => one("insert into pedidos (origem, status) values ('whatsapp','em_aberto')"), /row-level security|policy/)
  assert.equal((await db.query("update pedidos set cliente_nome='Invasora' where id=$1", [p2.id])).affectedRows, 0)
  assert.equal((await one('select cliente_nome from pedidos where id=$1', [p2.id]).catch(() => null)), undefined)
  await db.exec('reset role')
  assert.equal((await one('select cliente_nome from pedidos where id=$1', [p2.id])).cliente_nome, 'Cliente')
  assert.equal((await one('select status from pedidos where id=$1', [p2.id])).status, 'separacao')
  // No pedido dela, mover_etapa funciona.
  await como({ sub: UA })
  assert.equal((await one("select mover_etapa($1,'conferencia') s", [p1.id])).s, 'conferencia')
})

test('funcionária tampouco mexe em dados do Time nem nas metas', async () => {
  const { ana } = await cenario()
  await como({ sub: UA })
  assert.equal((await db.query('select 1 from equipe')).rows.length, 3, 'lê a lista do time')
  assert.equal((await db.query("update equipe set papel='gestor' where id=$1", [ana])).affectedRows, 0)
  assert.equal((await db.query("update metas_etapa set meta_horas_uteis = 9 where etapa='separacao'")).affectedRows, 0)
  assert.equal((await db.query("update responsavel_padrao set membro_id = $1 where etapa='separacao'", [ana])).affectedRows, 0)
  await recusa(() => one('select excluir_membro($1)', [ana]), /Só o gestor/)
})

test('responsável padrão: o pedido que entra numa etapa sem responsável fica com a pessoa padrão; quem já tinha responsável não muda', async () => {
  const { ana, bia, p1, p2 } = await cenario()
  await como({ sub: UG })
  await db.query("update responsavel_padrao set membro_id = $1 where etapa = 'conferencia'", [bia])
  await db.query("update responsavel_padrao set membro_id = $1 where etapa = 'bipagem'", [ana])
  await db.query("update responsavel_padrao set membro_id = $1 where etapa = 'separacao'", [ana])
  // p1 sem responsável de conferência: recebe a Bia. p2 já tinha a Ana na conferência: continua.
  await db.exec('reset role')
  await db.query("update pedidos set responsaveis = responsaveis || jsonb_build_object('conferencia', $2::text) where id = $1", [p2.id, ana])
  await como({ sub: UG })
  for (const p of [p1, p2]) {
    const itens = (await db.query('select id from pedido_itens where pedido_id = $1', [p.id])).rows
    await one('select marcar_pecas($1,$2::jsonb)', [p.id, JSON.stringify(itens.map((i) => ({ item: i.id, campo: 'status', valor: 'encontrado' })))])
  }
  assert.equal((await responsaveis(p1.id)).conferencia, bia)
  assert.equal((await responsaveis(p2.id)).conferencia, ana)
  // Entrada na separação (venda paga): recebe o padrão da separação.
  await db.exec('reset role')
  const nova = await pedidoWhats('em_aberto')
  await db.query("update pedidos set status = 'novo', forma_pagamento = 'Pix', valor_pago = 80, pago_em = now() where id = $1", [nova.id])
  assert.deepEqual(await responsaveis(nova.id), { separacao: ana })
})

test('responsável padrão: pessoa inativa não recebe, "Ninguém" deixa vazio, e o gestor aplica aos pedidos que já estão na esteira', async () => {
  const { ana, bia, p1, p3 } = await cenario()
  await db.query("update responsavel_padrao set membro_id = $1 where etapa = 'separacao'", [bia])
  await db.query('update equipe set ativo = false where id = $1', [bia])
  await db.exec('reset role')
  await como({ sub: UG })
  assert.equal((await one('select preencher_responsaveis_padrao() n')).n, 0, 'padrão inativo não vale')
  await db.query("update equipe set ativo = true where id = $1", [bia])
  assert.equal((await one('select preencher_responsaveis_padrao() n')).n, 1, 'só o p3 estava sem ninguém')
  assert.deepEqual(await responsaveis(p3.id), { separacao: bia })
  assert.equal((await responsaveis(p1.id)).separacao, ana, 'quem já tinha responsável não muda')
  await db.query("update responsavel_padrao set membro_id = null where etapa = 'separacao'")
  assert.equal((await one('select responsavel_padrao_de($1) r', ['separacao'])).r, null)
})

test('sou_gestor e membro_atual: por user_id (login por usuário) e por e-mail (quem entra com e-mail); inativa e desconhecida não são gestoras', async () => {
  const gu = await membro('Por usuário', 'gestor', { user_id: UG })
  const ge = await membro('Por e-mail', 'gestor', { email: 'Dono@Arvenne.test' })
  const fa = await membro('Funcionária', 'funcionaria', { user_id: UA, email: 'func@arvenne.test' })
  const fi = await membro('Inativa', 'gestor', { user_id: UB, ativo: false })
  const quem = async (claims) => { await como(claims); return (await one('select membro_atual() m, sou_gestor() g')) }
  assert.deepEqual(await quem({ sub: UG }), { m: gu, g: true })
  assert.deepEqual(await quem({ sub: 'zzz', email: ' dono@arvenne.test ' }), { m: ge, g: true })
  assert.deepEqual(await quem({ sub: UA }), { m: fa, g: false })
  assert.deepEqual(await quem({ email: 'FUNC@arvenne.test' }), { m: fa, g: false })
  assert.deepEqual(await quem({ sub: UB }), { m: null, g: false })
  assert.deepEqual(await quem({ sub: '99999999-9999-4999-8999-999999999999', email: 'ninguem@arvenne.test' }), { m: null, g: false })
  assert.ok(fi)
  // O e-mail interno do login por usuário nunca precisa estar no cadastro: vale o user_id.
  assert.deepEqual(await quem({ sub: UA, email: 'ana@equipe.arvenne.invalid' }), { m: fa, g: false })
  await sistema()
  assert.equal((await one('select sou_gestor() g')).g, true, 'sem JWT de pessoa vale como sistema')
  await como({ role: 'service_role' })
  assert.equal((await one('select sou_gestor() g')).g, true)
})

test('o último gestor ativo não sai, e login por usuário (user_id e usuario) é único e no formato certo', async () => {
  const g = await membro('Gestora', 'gestor', { user_id: UG })
  await recusa(() => db.query("update equipe set papel='funcionaria' where id=$1", [g]), /pelo menos um gestor/)
  await recusa(() => db.query("update equipe set ativo=false where id=$1", [g]), /pelo menos um gestor/)
  await recusa(() => db.query('delete from equipe where id=$1', [g]), /pelo menos um gestor/)
  await db.query("update equipe set usuario='ana' where id=$1", [g])
  const outra = await membro('Outra', 'funcionaria')
  await recusa(() => db.query("update equipe set usuario='ana' where id=$1", [outra]), /duplicate|unique/)
  await recusa(() => db.query("update equipe set usuario='Ana Paula' where id=$1", [outra]), /check/)
  await recusa(() => db.query('update equipe set user_id=$2 where id=$1', [outra, UG]), /duplicate|unique/)
})

test('trocas seguem o pedido: cada uma vê só as trocas dos pedidos dela', async () => {
  const { p1, p2 } = await cenario()
  await db.query('insert into trocas (pedido_id) values ($1), ($2)', [p1.id, p2.id])
  await como({ sub: UA })
  assert.deepEqual((await db.query('select pedido_id from trocas')).rows.map((r) => r.pedido_id), [p1.id])
  await como({ sub: UG })
  assert.equal((await db.query('select 1 from trocas')).rows.length, 2)
})

test('páginas públicas continuam abertas e dados internos continuam fechados para quem não entrou', async () => {
  await cenario()
  await db.exec('reset role; set local role anon')
  await recusa(() => one('select * from pedidos'), /permission denied/)
  await recusa(() => one('select pode_ver_pedido(gen_random_uuid())'), /permission denied/)
  await recusa(() => one('select membro_atual()'), /permission denied/)
  await recusa(() => one('select * from responsavel_padrao'), /permission denied/)
  await one("select romaneio_publico(gen_random_uuid())") // continua executável para a cliente
})
