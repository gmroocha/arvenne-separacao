import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from "vitest"
import { db, one } from './suporte.mjs'
import { recusa } from './fixtures.mjs'

// Shopify automática (20261122190000): de hora em hora o banco chama a função Edge shopify-sync, com o segredo lido do Vault.
// Limite honesto: o PGlite não tem pg_cron, pg_net nem Vault. Eles são simulados em suporte.mjs (agendamento = tabela
// cron.job, pg_net = net.chamadas, Vault = vault.decrypted_secrets vazio). Aqui se confere o SQL real da migration: o
// agendamento cadastrado, a ausência de segredo no arquivo e no comando, as permissões e o comportamento da função.
// Disparar de verdade no relógio do Supabase e chamar a função Edge dependem da migration aplicada e do segredo gravado.
const ARQUIVO = readFileSync('supabase/migrations/20261122190000_shopify_automatica.sql', 'utf8')
const SEGREDO_FICTICIO = 'segredo-ficticio-so-do-teste'

test('agendamento: um job só, toda hora cheia, apontando para a função (sem credencial no comando)', async () => {
  const jobs = (await db.query("select jobname, schedule, command from cron.job where command ilike '%shopify%' or jobname ilike '%shopify%'")).rows
  assert.deepEqual(jobs, [{ jobname: 'shopify-sync', schedule: '0 * * * *', command: 'select public.sincronizar_shopify_agendado();' }])
  // 00:00 já está incluído em "toda hora cheia": não existe um segundo agendamento só para a meia-noite.
  assert.equal(Number((await one("select count(*) n from cron.job where schedule ~ '^0 0 '")).n), 0)
  assert.doesNotMatch(jobs[0].command, /secret|segredo|x-cron/i)
})

test('o arquivo da migration não contém segredo: o valor sai do Vault', () => {
  assert.match(ARQUIVO, /vault\.decrypted_secrets/)
  assert.match(ARQUIVO, /name = 'cron_secret'/)
  assert.match(ARQUIVO, /'x-cron-secret', v_segredo/) // o cabeçalho recebe a variável, nunca um texto
  assert.doesNotMatch(ARQUIVO, /[A-Za-z0-9+/_=-]{32,}/, 'nenhum texto longo e aleatório no arquivo')
  assert.doesNotMatch(ARQUIVO, /eyJ[A-Za-z0-9_-]{10,}/, 'nenhuma chave JWT (anon ou service_role) no arquivo')
  assert.doesNotMatch(ARQUIVO, /service_role[_ ]key|sb_secret/i)
})

test('permissões: ninguém do app executa a função; anon e authenticated também não', async () => {
  const p = await one(`select has_function_privilege('anon','public.sincronizar_shopify_agendado()','execute') anon,
    has_function_privilege('authenticated','public.sincronizar_shopify_agendado()','execute') auth,
    has_function_privilege('service_role','public.sincronizar_shopify_agendado()','execute') servico`)
  assert.deepEqual(p, { anon: false, auth: false, servico: false })
  await db.exec('set local role authenticated')
  await recusa(() => one('select sincronizar_shopify_agendado()'), /permission denied/)
  await db.exec('set local role anon')
  await recusa(() => one('select sincronizar_shopify_agendado()'), /permission denied/)
})

test('sem o segredo no Vault a função não chama nada e não dá erro', async () => {
  assert.equal((await one('select sincronizar_shopify_agendado() r')).r, null)
  assert.equal(Number((await one('select count(*) n from net.chamadas')).n), 0)
  await db.query("insert into vault.decrypted_secrets(name, decrypted_secret) values ('cron_secret', '')")
  assert.equal((await one('select sincronizar_shopify_agendado() r')).r, null, 'segredo vazio vale como ausente')
  await db.query("insert into vault.decrypted_secrets(name, decrypted_secret) values ('outro_segredo', $1)", [SEGREDO_FICTICIO])
  await db.query("delete from vault.decrypted_secrets where name='cron_secret'")
  assert.equal((await one('select sincronizar_shopify_agendado() r')).r, null, 'outro nome no Vault não serve')
  assert.equal(Number((await one('select count(*) n from net.chamadas')).n), 0)
})

test('com o segredo no Vault chama a shopify-sync com o cabeçalho x-cron-secret, sem tocar no resto', async () => {
  await db.query("insert into vault.decrypted_secrets(name, decrypted_secret) values ('cron_secret', $1)", [SEGREDO_FICTICIO])
  const antes = Number((await one('select count(*) n from pedidos')).n)
  const r = (await one('select sincronizar_shopify_agendado() r')).r
  assert.ok(r != null, 'devolve o número da requisição')
  const chamadas = (await db.query('select url, headers, body, timeout_milliseconds from net.chamadas')).rows
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].url, 'https://fdcjpqnwkdzqipkikocl.supabase.co/functions/v1/shopify-sync')
  assert.equal(chamadas[0].headers['x-cron-secret'], SEGREDO_FICTICIO)
  assert.equal(chamadas[0].headers['Content-Type'], 'application/json')
  assert.deepEqual(chamadas[0].body, {})
  assert.equal(chamadas[0].timeout_milliseconds, 90000)
  assert.equal(Number((await one('select count(*) n from pedidos')).n), antes, 'a função só chama a Edge; quem importa é a Edge')
})
