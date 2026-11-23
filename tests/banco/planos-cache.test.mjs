import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { montarVolume, UA, UG } from './volume.mjs'

// Lentidão de 23/11/2026: 278 "statement timeout" numa manhã com 57 pedidos. O processador ia em PLANEJAR consultas:
// troca_painel (SQL puro) era replanejada a cada chamada. Migration 20261127090000_planos_em_cache.sql.
// As respostas iguais às de antes ficam garantidas pela comparação "painel"/"publica" de desempenho-v115.test.mjs.

const config = async (nome) => (await one(`select l.lanname, coalesce(p.proconfig, '{}') as cfg from pg_proc p join pg_language l on l.oid = p.prolang
  where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [nome]))

test('troca_painel guarda o plano (plpgsql) e as leituras públicas da troca e do romaneio usam plano genérico', async () => {
  const painel = await config('troca_painel')
  assert.equal(painel.lanname, 'plpgsql', 'troca_painel em SQL puro é replanejada a cada chamada')
  for (const nome of ['troca_painel', 'troca_publica', 'romaneio_publico']) {
    assert.ok((await config(nome)).cfg.includes('plan_cache_mode=force_generic_plan'), `${nome} sem plan_cache_mode`)
  }
})

async function como(sub) {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub })}',true)`)
  await db.exec('set local role authenticated')
}

test('troca_painel: sem troca ativa devolve nulo; a funcionária não vê troca de pedido que não é dela', async () => {
  await montarVolume(db)
  const ana = (await one("select id from equipe where nome = 'Ana'")).id
  const semTroca = (await one('select id from pedidos p where not exists (select 1 from trocas t where t.pedido_id = p.id) limit 1')).id
  const deOutra = (await one(`select t.pedido_id from trocas t join pedidos p on p.id = t.pedido_id
    where t.status = 'enviada' and coalesce(p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio), '') <> $1 limit 1`, [ana])).pedido_id
  const deAna = (await one(`select t.pedido_id from trocas t join pedidos p on p.id = t.pedido_id
    where t.status = 'enviada' and p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = $1 limit 1`, [ana])).pedido_id
  await como(UG)
  assert.equal((await one('select troca_painel($1) r', [semTroca])).r, null)
  assert.ok((await one('select troca_painel($1) r', [deOutra])).r?.pecas.length > 0)
  await como(UA)
  assert.equal((await one('select troca_painel($1) r', [deOutra])).r, null)
  assert.ok((await one('select troca_painel($1) r', [deAna])).r?.pecas.length > 0)
})
