import assert from 'node:assert/strict'
import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, escolher, concluir, publica, recusa, zero, preco, cobrir, carrinho } from './fixtures.mjs'

test('cliente sem login pode escolher, mas não concluir nem ler dados internos', async () => {
  const f = await fixture()
  await escolher(f)
  await db.exec('set local role anon')
  await recusa(() => concluir(f), /permission denied/)
  await recusa(() => one('select * from pedidos'), /permission denied/)
  const dados = await publica(f)
  assert.deepEqual(Object.keys(dados).sort(), ['cliente', 'numero', 'pecas', 'resumo', 'status'])
  assert.equal(dados.cliente, 'Cliente')
})

test('funções de ação: anon não executa', async () => {
  await db.exec('set local role anon')
  await recusa(() => one('select bipar($1, null, $2)', ['00000000-0000-0000-0000-000000000000', 'x']), /permission denied/)
})

test('funções novas da troca v2: anon não executa', async () => {
  const f = await fixture()
  await db.exec('set local role anon')
  const zero = '00000000-0000-0000-0000-000000000000'
  await recusa(() => one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito']), /permission denied/)
  await recusa(() => one('select troca_acerto($1, $2)', [f.troca.id, 'recebido']), /permission denied/)
  await recusa(() => one("select * from sugerir_troca($1, 'variantes', null, 0.2, null, true)", [zero]), /permission denied/)
  await recusa(() => one("select * from sugerir_troca($1, 'variantes', null, 0.2, null, false, true)", [zero]), /permission denied/)
  await recusa(() => one('select fator_pedido($1)', [zero]), /permission denied/)
  await recusa(() => one('select * from v_pedido_acerto'), /permission denied/)
  await recusa(() => one('select troca_concluir_peca($1, $2, $3, null, $3)', [f.troca.id, f.pecas[0].id, 'credito']), /permission denied/)
  // A página pública continua aberta.
  assert.equal((await publica(f)).status, 'enviada')
})

test('funções da vistoria: anon não executa nem lê as views', async () => {
  await db.exec('set local role anon')
  await recusa(() => one('select marcar_devolvido($1)', [zero]), /permission denied/)
  await recusa(() => one('select bipar_ajustar($1, 1)', [zero]), /permission denied/)
  await recusa(() => one('select reiniciar_pedido($1, $2, false)', [zero, 'novo']), /permission denied/)
  await recusa(() => one('select prazo_envio(now())'), /permission denied/)
  await recusa(() => one('select importar_pedido_shopify($1::jsonb)', ['{}']), /permission denied/)
  await recusa(() => one('select * from v_pedidos'), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => one('select importar_pedido_shopify($1::jsonb)', ['{}']), /permission denied/)
})

test('cobertura: troca cancelada não cobre; trava em troca concluída; anon não lê', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 60)
  await cobrir(f, 10)
  await escolher(f)
  await concluir(f)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  await recusa(() => cobrir(f, 5), /não pode mudar numa troca concluída/)
  await recusa(() => one("update trocas set cobrir_ate = -1 where id = $1", [f.troca.id]), /check|não pode/)
  const g = await fixture({ desconto: 20 })
  await db.query("update trocas set status = 'cancelada' where id = $1", [g.troca.id])
  await recusa(() => cobrir(g, 5), /cancelada/)
  await db.exec('set local role anon')
  await recusa(() => one('select * from v_troca_resumo'), /permission denied/)
  await recusa(() => one('select * from v_pedido_acerto'), /permission denied/)
  await db.exec('set local role authenticated')
})

test('carrinho: anon só usa troca_carrinho, troca_escolher e troca_publica', async () => {
  const f = await fixture()
  await carrinho(f, 0, f.opcoes[0].id, 1)
  await db.exec('set local role anon')
  await one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[0].id, 'opcao', f.opcoes[0].id])
  assert.ok((await publica(f)).pecas[0].carrinho)
  await recusa(() => one('select * from troca_escolhas'), /permission denied/)
  await recusa(() => one('select * from v_troca_carrinho'), /permission denied/)
  await recusa(() => one('select troca_carrinho_definir($1, $2)', [f.pecas[0].id, f.opcoes[0].id]), /permission denied/)
  await recusa(() => one('select troca_aprovar_carrinho($1, $2)', [f.troca.id, f.pecas[0].id]), /permission denied/)
  await recusa(() => one('select troca_recalcular_escolha($1)', [f.pecas[0].id]), /permission denied/)
  await recusa(() => db.query('delete from troca_escolhas'), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => db.query('delete from troca_escolhas'), /permission denied/)
  await recusa(() => db.query('insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values ($1, $2, 1)', [f.pecas[0].id, f.opcoes[0].id]), /permission denied/)
})

test('conferência somente leitura executa as funções da v_pedidos; anon continua sem acesso', async () => {
  for (const f of ['public.prazo_envio(timestamptz)','public.horas_uteis(timestamptz,timestamptz)','public.regras_etapas(jsonb)','public.saldo_financeiro(uuid)']) {
    const r=await one('select has_function_privilege($1,$2,$3) leitura, has_function_privilege($4,$2,$3) anon',['supabase_read_only_user',f,'execute','anon'])
    expect([f,r.leitura,r.anon]).toEqual([f,true,false])
  }
})
