import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, recusa, pedidoWhats, zero, eventos, num, itemQtd4, prepararEtapa, escolher, concluir } from './fixtures.mjs'

test('venda sem peça ou com peça sem preço não entra na expedição', async () => {
  const v = await one("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'aguardando_pagamento', 'Cliente') returning *")
  await recusa(() => db.query("update pedidos set status = 'novo' where id = $1", [v.id]), /nenhuma peça/)
  const item = await one("insert into pedido_itens (pedido_id, origem, nome, qtd, ordem) values ($1, 'avulso', 'Colar', 1, 0) returning *", [v.id])
  await recusa(() => db.query("update pedidos set status = 'novo' where id = $1", [v.id]), /sem preço/)
  await db.query('update pedido_itens set preco = 30 where id = $1', [item.id])
  await db.query("update pedidos set status = 'novo' where id = $1", [v.id])
  assert.equal((await one('select status from pedidos where id = $1', [v.id])).status, 'novo')
  // Perder a venda continua possível, mesmo sem peça.
  const w = await one("insert into pedidos (origem, status) values ('whatsapp', 'em_aberto') returning *")
  await db.query("update pedidos set status = 'perdida' where id = $1", [w.id])
})

test('reiniciar do zero não ressuscita peça removida na venda e restaura a removida depois', async () => {
  const p = await pedidoWhats('em_aberto')
  const na = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  const co = await one("select id from pedido_itens where pedido_id = $1 and sku = 'C1'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'removida na venda' where id = $1", [na.id])
  await db.query("update pedidos set status = 'novo' where id = $1", [p.id])
  await db.query("update pedido_itens set status = 'removido' where id = $1", [co.id]) // removida na expedição
  await db.query("update pedidos set nf_emitida_em = now() where id = $1", [p.id])
  await db.exec('set local role authenticated')
  await one('select reiniciar_pedido($1, $2, true)', [p.id, 'bipagem'])
  assert.equal((await one('select status from pedido_itens where id = $1', [na.id])).status, 'removido')
  assert.equal((await one('select status from pedido_itens where id = $1', [co.id])).status, 'pendente')
  const ped = await one('select status, nf_emitida_em from pedidos where id = $1', [p.id])
  assert.equal(ped.status, 'novo')
  assert.equal(ped.nf_emitida_em, null)
  assert.equal((await one("select count(*)::int as n from pedido_eventos where pedido_id = $1 and tipo = 'reiniciado'", [p.id])).n, 1)
})

test('reiniciar só a bipagem zera as bipadas e mantém o resto', async () => {
  const p = await pedidoWhats('bipagem')
  await db.query("update pedido_itens set status = 'encontrado', conferido_em = now(), qtd_bipada = 1, bipado_em = now() where pedido_id = $1", [p.id])
  await db.exec('set local role authenticated')
  await one('select reiniciar_pedido($1, $2, false)', [p.id, 'bipagem'])
  const i = await one('select * from pedido_itens where pedido_id = $1 limit 1', [p.id])
  assert.equal(i.qtd_bipada, 0); assert.equal(i.bipado_em, null)
  assert.equal(i.status, 'encontrado'); assert.notEqual(i.conferido_em, null)
  assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'bipagem')
})

test('bipar é atômico: duas chamadas somam 2 e nunca passam da quantidade', async () => {
  const p = await pedidoWhats('bipagem')
  const i = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query('update pedido_itens set qtd = 2 where id = $1', [i.id])
  await db.exec('set local role authenticated')
  const r = await Promise.all([1, 2, 3].map(() => one('select bipar($1, $2, $3) as r', [p.id, i.id, 'A1'])))
  assert.deepEqual(r.map(x => x.r).sort(), ['excedente', 'ok', 'ok'])
  assert.equal((await one('select qtd_bipada from pedido_itens where id = $1', [i.id])).qtd_bipada, 2)
  assert.equal((await one('select bipar($1, null, $2) as r', [p.id, 'XX'])).r, 'fora_do_pedido')
  const { rows } = await db.query('select resultado from bipagens where pedido_id = $1 order by id', [p.id])
  assert.equal(rows.length, 4)
  await recusa(() => one('select bipar($1, $2, $3)', [p.id, '00000000-0000-0000-0000-000000000000', 'A1']), /não pertence/)
})

test('adicionar_itens: ordem no banco e soma de quantidade na venda', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.query("update pedido_itens set shopify_variant_id = 77, origem = 'shopify' where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.exec('set local role authenticated')
  const novos = [
    { origem: 'shopify', shopify_variant_id: 77, sku: 'A1', nome: 'Anel', qtd: 2, preco: 50 },
    { origem: 'shopify', shopify_variant_id: 88, sku: 'B1', nome: 'Brinco', qtd: 1, preco: 20 },
    { origem: 'shopify', shopify_variant_id: 88, sku: 'B1', nome: 'Brinco', qtd: 1, preco: 20 },
  ]
  await one('select adicionar_itens($1, $2::jsonb, true)', [p.id, JSON.stringify(novos)])
  const { rows } = await db.query('select sku, qtd, ordem from pedido_itens where pedido_id = $1 order by ordem', [p.id])
  assert.deepEqual(rows.map(r => [r.sku, r.qtd, r.ordem]), [['A1', 3, 0], ['C1', 1, 1], ['B1', 2, 2]])
  await one('select adicionar_itens($1, $2::jsonb, false)', [p.id, JSON.stringify(novos.slice(0, 1))])
  assert.equal((await one("select count(*)::int as n from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])).n, 2)
})

test('reiniciar do zero é recusado se já houve troca concluída (a etapa sozinha continua valendo)', async () => {
  const f = await fixture({ desconto: 20 })
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito'])
  await recusa(() => one('select reiniciar_pedido($1, $2, true)', [f.pedido.id, 'novo']), /troca concluída/)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  await one('select reiniciar_pedido($1, $2, false)', [f.pedido.id, 'bipagem'])
})

test('prazo de envio: fim de semana e feriado contam do 1º dia útil 00h; dia útil mantém a hora', async () => {
  const prazo = async ts => (await one(
    `select to_char(prazo_envio($1::timestamptz) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as d`, [ts])).d
  assert.equal(await prazo('2026-11-14 10:00-03'), '2026-11-18 00:00') // sábado -> quarta 00h
  assert.equal(await prazo('2026-11-15 22:00-03'), '2026-11-18 00:00') // domingo (e feriado)
  assert.equal(await prazo('2026-11-06 15:00-03'), '2026-11-10 15:00') // sexta 15h -> terça 15h
  assert.equal(await prazo('2026-09-07 10:00-03'), '2026-09-10 00:00') // feriado (segunda) -> terça 00h + 2 úteis
  assert.equal(await prazo('2026-11-19 15:00-03'), '2026-11-24 15:00') // quinta; sexta 20/11 é feriado
})

test('feriados de 2028: Páscoa em 16/04, Carnaval, Sexta Santa e Corpus Christi nos dias certos', async () => {
  const dia = async nome => (await db.query("select data::text d, extract(isodow from data)::int dow from feriados where data between '2028-01-01' and '2028-12-31' and nome like $1 order by data", [nome])).rows
  assert.deepEqual(await dia('Carnaval%'), [{ d: '2028-02-28', dow: 1 }, { d: '2028-02-29', dow: 2 }])
  assert.deepEqual(await dia('Sexta-feira Santa'), [{ d: '2028-04-14', dow: 5 }])
  assert.deepEqual(await dia('Corpus Christi%'), [{ d: '2028-06-15', dow: 4 }])
  assert.equal((await one("select count(*)::int n from feriados where data between '2028-01-01' and '2028-12-31'")).n, 13)
})

test('bipar_ajustar soma e tira no banco, sem passar de 0 nem da quantidade', async () => {
  const p = await pedidoWhats('bipagem')
  const i = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query('update pedido_itens set qtd = 2 where id = $1', [i.id])
  await db.exec('set local role authenticated')
  const aj = async d => (await one('select bipar_ajustar($1, $2) as v', [i.id, d])).v
  assert.equal(await aj(1), 1)
  assert.equal(await aj(5), 2)
  assert.equal(await aj(-1), 1)
  assert.equal(await aj(-9), 0)
  assert.equal((await one('select bipado_em from pedido_itens where id = $1', [i.id])).bipado_em, null)
  assert.ok(await eventos(p.id, 'bipada') >= 3)
  await recusa(() => one('select bipar_ajustar($1, 1)', [zero]), /não encontrada/)
})

test('falta parcial: 4 viram 3 + 1 em falta, copiando preço pago e linha da Shopify, com evento e bipagem limitada', async () => {
  const { p, i } = await itemQtd4()
  const novoId = await one('select marcar_falta($1, 1) as id', [i.id]).then(r => r.id)
  assert.notEqual(novoId, i.id)
  const nova = await one('select * from pedido_itens where id = $1', [novoId])
  assert.deepEqual([nova.status, nova.qtd, num(nova.preco_pago), num(nova.preco), nova.shopify_line_id, nova.ordem, nova.sku, nova.variante, nova.foto_url, Number(nova.shopify_variant_id)],
    ['falta', 1, 40, 50, 'L1', 3, 'AN-4', '18', 'http://foto', 55])
  assert.equal(nova.observacao, null); assert.equal(nova.conferido_em, null); assert.equal(nova.qtd_bipada, 0)
  const velha = await one('select * from pedido_itens where id = $1', [i.id])
  assert.deepEqual([velha.status, velha.qtd, velha.qtd_bipada], ['encontrado', 3, 3])
  const ev = await db.query("select * from pedido_eventos where item_id = $1 and tipo = 'item'", [novoId])
  assert.equal(ev.rows.length, 1)
  assert.equal(ev.rows[0].para, 'falta')
  assert.equal(ev.rows[0].pedido_id, p.id)
  // Defeito de 2: nova linha em defeito.
  const d = await one("select marcar_falta($1, 2, 'defeito') as id", [i.id]).then(r => r.id)
  assert.deepEqual(Object.values(await one('select status, qtd from pedido_itens where id = $1', [d])), ['defeito', 2])
  assert.equal((await one('select qtd from pedido_itens where id = $1', [i.id])).qtd, 1)
})

test('falta parcial: quantidade igual ou maior marca a linha inteira e zera as etapas; recusas', async () => {
  const { p, i } = await itemQtd4()
  assert.equal((await one('select marcar_falta($1, 9) as id', [i.id])).id, i.id)
  const r = await one('select * from pedido_itens where id = $1', [i.id])
  assert.deepEqual([r.status, r.qtd, r.qtd_bipada, r.conferido_em, r.etiquetado_em, r.etiqueta_previa, r.bipado_em], ['falta', 4, 0, null, null, false, null])
  assert.equal((await one('select count(*)::int n from pedido_itens where pedido_id = $1', [p.id])).n, 1)
  await recusa(() => one("select marcar_falta($1, 1, 'x')", [i.id]), /Status inválido/)
  await recusa(() => one('select marcar_falta($1, 0)', [i.id]), /quantas/)
  await db.query("update pedido_itens set status = 'removido' where id = $1", [i.id])
  await recusa(() => one('select marcar_falta($1, 1)', [i.id]), /removida/)
  const g = await itemQtd4()
  await db.query("update pedidos set status = 'cancelado' where id = $1", [g.p.id])
  await recusa(() => one('select marcar_falta($1, 1)', [g.i.id]), /não aceita/)
  await db.exec('set local role anon')
  await recusa(() => one('select marcar_falta($1, 1)', [g.i.id]), /permission denied/)
})

test('V17: reiniciar e restaurar não recolocam uma peça já devolvida como paga', async () => {
  const p=await pedidoWhats('novo')
  await db.query("update pedidos set valor_pago=80,pago_em=now()-interval '1 day' where id=$1",[p.id])
  const i=await one("select id from pedido_itens where pedido_id=$1 and sku='C1'",[p.id])
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where id=$1",[i.id])
  await db.exec('set local role authenticated')
  await one('select marcar_devolvido($1)',[p.id])
  const antes=await one('select status,removido_em,devolvido_em from pedido_itens where id=$1',[i.id])
  await recusa(() => one("select reiniciar_pedido($1,'separacao',true)",[p.id]), /devolução|devolvida/)
  await recusa(() => db.query("update pedido_itens set status='pendente' where id=$1",[i.id]), /devolução|devolvida/)
  await one("select reiniciar_pedido($1,'conferencia',false)",[p.id])
  assert.deepEqual(await one('select status,removido_em,devolvido_em from pedido_itens where id=$1',[i.id]),antes)
  assert.equal((await one("select count(*)::int n from pedido_eventos where pedido_id=$1 and tipo='devolvido'",[p.id])).n,1)
})


test('V14: cada destino exige o trabalho das etapas anteriores, inclusive nota e postagem', async () => {
  const p=await pedidoWhats('novo')
  await db.exec('set local role authenticated')
  assert.match((await one('select etapas_permitidas from v_pedidos where id=$1',[p.id])).etapas_permitidas.enviado,/pendente/)
  await recusa(() => db.query("update pedidos set status='enviado' where id=$1",[p.id]),/pendente/)
  await db.query("update pedido_itens set status='encontrado' where pedido_id=$1",[p.id])
  await db.query("update pedidos set status='conferencia' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='etiquetagem' where id=$1",[p.id]),/Confira/)
  await db.query('update pedido_itens set conferido_em=now() where pedido_id=$1',[p.id])
  await db.query("update pedidos set status='etiquetagem' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='bipagem' where id=$1",[p.id]),/Etiquete/)
  await db.query('update pedido_itens set etiquetado_em=now() where pedido_id=$1',[p.id])
  await db.query("update pedidos set status='bipagem' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='faturamento' where id=$1",[p.id]),/Bipe/)
  await db.query('update pedido_itens set qtd_bipada=qtd,bipado_em=now() where pedido_id=$1',[p.id])
  await db.query("update pedidos set status='faturamento' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='embalagem' where id=$1",[p.id]),/nota fiscal/)
  // O gatilho considera as datas NOVAS desta mesma gravação.
  await db.query("update pedidos set nf_emitida_em=now(),frete_gerado_em=now(),pedido_fornecedor_em=now(),status='embalagem' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='pronto_envio' where id=$1",[p.id]),/embalagem/)
  await db.query("update pedidos set embalado_em=now(),status='pronto_envio' where id=$1",[p.id])
  await recusa(() => db.query("update pedidos set status='enviado' where id=$1",[p.id]),/postagem/)
  await db.query("update pedidos set postado_em=now(),status='enviado' where id=$1",[p.id])
  assert.equal((await one('select status from pedidos where id=$1',[p.id])).status,'enviado')
  await recusa(() => db.query("update pedidos set status='separacao' where id=$1",[p.id]),/arquivado/)
})

test('V14: acerto pendente bloqueia embalagem mesmo com peças e documentos prontos', async () => {
  const f=await fixture({desconto:0})
  await escolher(f); await concluir(f)
  await recusa(() => prepararEtapa(f.pedido.id,'embalagem'),/acertos/)
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  await prepararEtapa(f.pedido.id,'embalagem')
  assert.equal((await one('select status from pedidos where id=$1',[f.pedido.id])).status,'embalagem')
})

test('V14: inserir diretamente na etapa avançada não contorna os pré-requisitos', async () => {
  await db.exec('set local role authenticated')
  await recusa(() => one("insert into pedidos(origem,status) values ('whatsapp','enviado') returning id"),/peças para expedir/)
})

