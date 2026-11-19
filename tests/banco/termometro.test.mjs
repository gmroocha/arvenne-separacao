import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Metas de tempo por etapa (horas úteis) e termômetro: verde até a meta, amarelo até o dobro, vermelho acima.
// A conta fica no banco (função termometro_etapa e colunas da v_pedidos_operacao); a tela só exibe.
const termo = async (status, horas) => (await one('select termometro_etapa($1,$2::numeric) t', [status, horas])).t

test('metas_etapa: padrões do Gustavo em horas úteis, uma por etapa da esteira', async () => {
  const metas = Object.fromEntries((await db.query('select etapa, meta_horas_uteis::float m from metas_etapa')).rows.map((r) => [r.etapa, r.m]))
  assert.deepEqual(metas, { separacao: 2, conferencia: 1, bipagem: 1, faturamento: 2, embalagem: 2, pronto_envio: 4, enviar_rastreio: 2 })
})

test('termometro_etapa: faixas com tempos fixos (limites incluídos na faixa de baixo)', async () => {
  // Conferência: meta de 1 h útil.
  assert.equal(await termo('conferencia', 0), 'verde')
  assert.equal(await termo('conferencia', 1), 'verde')
  assert.equal(await termo('conferencia', 1.1), 'amarelo')
  assert.equal(await termo('conferencia', 2), 'amarelo')
  assert.equal(await termo('conferencia', 2.1), 'vermelho')
  // Postagem: meta de 4 h úteis.
  assert.equal(await termo('pronto_envio', 4), 'verde')
  assert.equal(await termo('pronto_envio', 8), 'amarelo')
  assert.equal(await termo('pronto_envio', 8.5), 'vermelho')
  // "novo" (fila) conta como separação (meta de 2 h); embalagem e frete é a etapa 'embalagem'.
  assert.equal(await termo('novo', 2), 'verde')
  assert.equal(await termo('novo', 4.5), 'vermelho')
  assert.equal(await termo('embalagem', 3), 'amarelo')
  // Fora da esteira ou sem tempo: sem termômetro.
  for (const s of ['avisar_cliente', 'aguardando_cliente', 'enviado', 'em_aberto', 'frete']) assert.equal(await termo(s, 1), null, s)
  assert.equal(await termo('bipagem', null), null)
})

test('termometro_etapa: a meta editada muda as faixas (a conta usa metas_etapa, não números fixos)', async () => {
  await db.query("update metas_etapa set meta_horas_uteis=10 where etapa='bipagem'")
  assert.equal(await termo('bipagem', 10), 'verde')
  assert.equal(await termo('bipagem', 20), 'amarelo')
  assert.equal(await termo('bipagem', 20.5), 'vermelho')
})

test('v_pedidos_operacao: horas_na_etapa e termometro em todas as etapas da esteira; nulos fora dela', async () => {
  const ler = async (id) => one('select horas_na_etapa::float h, termometro t from v_pedidos_operacao where id=$1', [id])
  for (const etapa of ['novo', 'separacao', 'conferencia', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio']) {
    const p = await pedidoWhats(etapa)
    const agora = await ler(p.id)
    assert.equal(agora.t, 'verde', `${etapa}: acabou de entrar`)
    assert.ok(agora.h >= 0 && agora.h < 1, etapa)
    // 90 dias atrás (muito mais que o dobro de qualquer meta, mesmo com fins de semana e feriados): vermelho.
    await db.query("update pedidos set status_desde = now() - interval '90 days' where id=$1", [p.id])
    const velho = await ler(p.id)
    assert.equal(velho.t, 'vermelho', etapa)
    assert.ok(velho.h > 100, `${etapa}: ${velho.h} h úteis`)
  }
  const fora = await pedidoWhats('enviado')
  assert.deepEqual(await ler(fora.id), { h: null, t: null })
  const venda = await pedidoWhats('em_aberto')
  assert.deepEqual(await ler(venda.id), { h: null, t: null })
})

test('v_pedidos_operacao: pedido em "Avisar cliente" não tem termômetro (quem espera é a cliente)', async () => {
  const p = await pedidoWhats('separacao')
  await db.exec("set local session_replication_role = replica")
  await db.query("update pedidos set status='avisar_cliente', status_desde = now() - interval '90 days' where id=$1", [p.id])
  await db.exec("set local session_replication_role = origin")
  assert.equal((await one('select termometro t from v_pedidos_operacao where id=$1', [p.id])).t, null)
})

test('metas_etapa: authenticated lê e edita (sem apagar nem zerar); anon nada; meta tem de ser maior que zero', async () => {
  await db.exec('set local role authenticated')
  assert.equal((await one('select count(*)::int n from metas_etapa')).n, 7)
  await db.query("update metas_etapa set meta_horas_uteis=3.5 where etapa='separacao'")
  assert.equal((await one("select meta_horas_uteis::float m from metas_etapa where etapa='separacao'")).m, 3.5)
  for (const ruim of [0, -1]) await recusa(() => db.query("update metas_etapa set meta_horas_uteis=$1 where etapa='bipagem'", [ruim]), /check/)
  await recusa(() => db.query("delete from metas_etapa where etapa='bipagem'"), /permission denied/)
  await recusa(() => db.query("insert into metas_etapa(etapa,meta_horas_uteis) values ('frete',1)"), /check|duplicate|violates/)
  await db.exec('reset role; set local role anon')
  await recusa(() => one('select * from metas_etapa'), /permission denied/)
  await recusa(() => db.query("update metas_etapa set meta_horas_uteis=1 where etapa='bipagem'"), /permission denied/)
})
