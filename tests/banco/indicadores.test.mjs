import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Fase 4 (20261126140000): indicadores do gestor. Cada número abaixo foi conferido à mão (as contas estão nos comentários).
// Cada pedido tem 2 linhas de 20 peças (40 peças). Semana de teste: segunda 05/10/2026 a sexta 09/10/2026 (sem feriado); as horas úteis entre dois instantes são as horas corridas
// dos dias úteis, então as passagens abaixo têm duração exata.

const UG = '33333333-3333-4333-8333-333333333333'
const UA = '11111111-1111-4111-8111-111111111111'
const UB = '22222222-2222-4222-8222-222222222222'
const DE = '2026-10-05T00:00:00-03:00'
const ATE = '2026-10-10T00:00:00-03:00'
const em = (dia, hora) => `2026-10-${dia} ${hora}:00-03`

const membro = async (nome, papel, user_id, email) =>
  (await one('insert into equipe (nome, papel, user_id, email) values ($1,$2,$3,$4) returning id', [nome, papel, user_id, email])).id
const como = async (sub) => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub })}',true)`)
  await db.exec('set local role authenticated')
}
const resumo = async () => (await one('select indicadores_resumo($1,$2) r', [DE, ATE])).r
const pessoas = async () => (await db.query('select * from indicadores_pessoas($1,$2)', [DE, ATE])).rows
const pontos = async () => (await db.query("select * from pontuacao_mes('2026-10-15')")).rows
const n = (v) => (v === null || v === undefined ? v : Number(v))

// Um pedido já na Postagem/Enviar rastreio, com a linha do tempo de etapas escrita à mão (substitui os eventos automáticos).
async function pedido({ pago, postado, sep, linha, responsaveis = {}, bipado }) {
  const p = await pedidoWhats('enviar_rastreio')
  await db.query('update pedidos set pago_em=$2, postado_em=$3, responsaveis=$4::jsonb where id=$1', [p.id, pago, postado, JSON.stringify(responsaveis)])
  await db.query('update pedido_itens set separado_por=$2, conferido_por=$3, bipado_por=$4 where pedido_id=$1', [p.id, sep, bipado?.conferente ?? null, bipado?.por ?? null])
  await db.query('update pedido_itens set qtd=20, qtd_bipada=20 where pedido_id=$1', [p.id]) // 2 linhas de 20 peças: 40 peças por pedido
  await db.query('delete from pedido_eventos where pedido_id=$1', [p.id])
  for (const [para, quando, email] of linha)
    await db.query("insert into pedido_eventos (pedido_id, tipo, para, usuario_email, created_at) values ($1,'status',$2,$3,$4)", [p.id, para, email ?? null, quando])
  return p
}

async function cenario() {
  const g = await membro('Gestora', 'gestor', UG, 'gestora@x.test')
  const ana = await membro('Ana', 'funcionaria', UA, 'ana@x.test')
  const bia = await membro('Bia', 'funcionaria', UB, 'bia@x.test')
  const R = ['enviar_rastreio']
  // P1: pago seg 10h (prazo qua 10h), postado ter 16h: NO prazo. Separação 1,0 / conferência 0,5 / bipagem 1,5 / faturamento 0,5 / embalagem 1,0 / postagem 25,0 h.
  const p1 = await pedido({ pago: em('05', '10:00'), postado: em('06', '16:00'), sep: ana, responsaveis: { faturamento: ana }, bipado: { conferente: bia, por: ana },
    linha: [['separacao', em('05', '10:30')], ['conferencia', em('05', '11:30')], ['bipagem', em('05', '12:00')], ['faturamento', em('05', '13:30')],
      ['embalagem', em('05', '14:00')], ['pronto_envio', em('05', '15:00'), 'bia@x.test'], [...R, em('06', '16:00'), 'gestora@x.test']] })
  // P2: pago seg 10h, postado qua 12h: FORA do prazo. Separação 4,0 / conf 1,0 / bip 0,5 / fat 17,0 / emb 1,0 / postagem 26,0 h.
  const p2 = await pedido({ pago: em('05', '10:00'), postado: em('07', '12:00'), sep: ana, responsaveis: { faturamento: ana }, bipado: { conferente: bia },
    linha: [['separacao', em('05', '10:30')], ['conferencia', em('05', '14:30')], ['bipagem', em('05', '15:30')], ['faturamento', em('05', '16:00'), 'ana@x.test'],
      ['embalagem', em('06', '09:00')], ['pronto_envio', em('06', '10:00'), 'bia@x.test'], [...R, em('07', '12:00'), 'gestora@x.test']] })
  // P3: pago seg 9h, postado ter 9h: NO prazo. Separação 1,0 / conf 0,5 / bip 0,5 / fat 0,5 / emb 1,0 / postagem 20,0 h. Separada pela Bia.
  const p3 = await pedido({ pago: em('05', '09:00'), postado: em('06', '09:00'), sep: bia, responsaveis: { faturamento: ana }, bipado: { conferente: bia },
    linha: [['separacao', em('05', '09:30')], ['conferencia', em('05', '10:30')], ['bipagem', em('05', '11:00')], ['faturamento', em('05', '11:30'), 'bia@x.test'],
      ['embalagem', em('05', '12:00')], ['pronto_envio', em('05', '13:00'), 'bia@x.test'], [...R, em('06', '09:00'), 'gestora@x.test']] })
  // Enviado fora do período: não entra nos números da semana.
  const p4 = await pedido({ pago: em('05', '09:00'), postado: '2026-10-13 09:00:00-03', sep: ana, linha: [] })
  const oc = (tipo, motivo, resp, quando, anulada = null) => db.query(
    `insert into ocorrencias (pedido_id, tipo, motivo, etapa, responsavel_id, created_at, anulada_em) values ($1,$2,$3,'separacao',$4,$5,$6)`,
    [p1.id, tipo, motivo, resp, quando, anulada])
  await oc('erro_bipagem', 'peca_incorreta', ana, em('06', '10:00'))
  await oc('erro_bipagem', 'peca_suja', ana, em('07', '10:00'))
  await oc('falta_indevida', 'peca_encontrada', bia, em('06', '11:00'))
  await oc('problema_entrega', 'peca_errada', ana, em('08', '10:00'))
  await oc('erro_bipagem', 'peca_incorreta', bia, em('06', '12:00'), em('06', '13:00')) // anulada: não conta
  await oc('erro_bipagem', 'peca_incorreta', ana, '2026-11-03 10:00:00-03') // outro mês: não conta
  return { g, ana, bia, p1, p2, p3, p4 }
}

test('indicadores_resumo: prazo, enviados, erros por 100, pegos antes e gargalo pela razão com a meta (contas à mão)', async () => {
  await cenario()
  // Meta da Postagem alta: o gargalo deixa de ser a etapa mais demorada em horas e passa a ser a mais acima da meta.
  await db.query("update metas_etapa set meta_horas_uteis=100 where etapa='pronto_envio'")
  await como(UG)
  const r = await resumo()
  // 3 pedidos enviados na semana (o P4 foi dia 13), 40 peças cada; 2 dentro do prazo de 48 h úteis.
  assert.equal(r.enviados_pedidos, 3)
  assert.equal(r.enviados_pecas, 120)
  assert.equal(r.prazo_total, 3)
  assert.equal(r.prazo_dentro, 2)
  assert.equal(n(r.prazo_pct), 66.7)
  // Peças separadas na semana: 3 x 40. Erros: 2 erros de bipagem + 1 falta indevida (anulada e de outro mês não contam).
  assert.equal(r.pecas_separadas, 120)
  assert.equal(r.erros_bipagem, 2)
  assert.equal(r.faltas_indevidas, 1)
  assert.equal(r.erros_contados, 3)
  assert.equal(n(r.erros_por_100), 2.5) // 3 / 120 x 100
  assert.equal(r.problemas_cliente, 1)
  assert.equal(n(r.pegos_antes_pct), 66.7) // 2 / (2 + 1)
  assert.equal(r.sem_movimento, false)
  // Tempo médio por etapa (h úteis): sep (1+4+1)/3=2; conf (0,5+1+0,5)/3=0,67; bip (1,5+0,5+0,5)/3=0,83; fat (0,5+17+0,5)/3=6;
  // emb 1; postagem (25+26+20)/3=23,67.
  const t = Object.fromEntries(r.tempos.map((x) => [x.etapa, x]))
  assert.deepEqual(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, n(v.horas)])),
    { separacao: 2, conferencia: 0.67, bipagem: 0.83, faturamento: 6, embalagem: 1, pronto_envio: 23.67 })
  // Razão com a meta: sep 2/2=1; conf 0,67/1; bip 0,83/1; fat 6/2=3; emb 1/2=0,5; postagem 23,67/100=0,24 -> gargalo é a Nota fiscal.
  assert.deepEqual([n(t.separacao.razao), n(t.faturamento.razao), n(t.embalagem.razao), n(t.pronto_envio.razao)], [1, 3, 0.5, 0.24])
  assert.equal(r.gargalo.etapa, 'faturamento')
  assert.deepEqual([n(r.gargalo.horas), n(r.gargalo.meta), n(r.gargalo.razao)], [6, 2, 3])
  // Barra proporcional à maior média (23,67): postagem 100; nota fiscal 6/23,67 = 25,4.
  assert.deepEqual([n(t.pronto_envio.barra), n(t.faturamento.barra)], [100, 25.4])
  assert.equal(t.separacao.meta, 2)
})

test('indicadores_resumo: sem dados no período devolve vazios, sem dividir por zero', async () => {
  await membro('Gestora', 'gestor', UG, 'gestora@x.test')
  await como(UG)
  const r = await resumo()
  assert.equal(r.enviados_pedidos, 0)
  assert.equal(r.prazo_pct, null)
  assert.equal(r.erros_por_100, null)
  assert.equal(r.pegos_antes_pct, null)
  assert.equal(r.gargalo, null)
  assert.equal(r.sem_movimento, true)
  assert.equal(r.erros_contados, 0)
  assert.deepEqual(r.tempos, [])
  await recusa(() => db.query('select indicadores_resumo($1,$2)', [ATE, DE]), /Período inválido/)
})

test('indicadores_pessoas: peças por etapa, tempo por peça na separação e ocorrências por pessoa', async () => {
  await cenario()
  await como(UG)
  const l = Object.fromEntries((await pessoas()).map((x) => [x.nome, x]))
  assert.deepEqual(Object.keys(l).sort(), ['Ana', 'Bia', 'Gestora'])
  // Ana: separou P1 e P2 (80 peças), bipou P1 (autor) e P2 (saída da bipagem pelo e-mail dela), fatura os 3 (responsável = 120 peças).
  assert.deepEqual([l.Ana.separacao, l.Ana.conferencia, l.Ana.bipagem, l.Ana.faturamento, l.Ana.embalagem, l.Ana.pronto_envio], [80, 0, 80, 120, 0, 0])
  assert.equal(n(l.Ana.minutos_por_peca_separacao), 3.8) // (1,0 + 4,0 h) x 60 / 80 peças = 3,75
  assert.deepEqual([l.Ana.erros_pegos_bipagem, l.Ana.faltas_indevidas, l.Ana.problemas_cliente], [2, 0, 1])
  // Bia: separou P3 (40), conferiu os 3 (120), bipagem de P3 (40), embalagem dos 3 (saída pelo e-mail, 120).
  assert.deepEqual([l.Bia.separacao, l.Bia.conferencia, l.Bia.bipagem, l.Bia.faturamento, l.Bia.embalagem, l.Bia.pronto_envio], [40, 120, 40, 0, 120, 0])
  assert.equal(n(l.Bia.minutos_por_peca_separacao), 1.5) // 1,0 h x 60 / 40
  assert.deepEqual([l.Bia.erros_pegos_bipagem, l.Bia.faltas_indevidas, l.Bia.problemas_cliente], [0, 1, 0]) // a anulada não conta
  // Gestora fez a saída da Postagem dos 3 pedidos (120 peças) e nenhuma separação.
  assert.deepEqual([l.Gestora.pronto_envio, l.Gestora.separacao, l.Gestora.minutos_por_peca_separacao], [120, 0, null])
  assert.deepEqual([l.Gestora.erros_pegos_bipagem, l.Gestora.faltas_indevidas, l.Gestora.problemas_cliente], [0, 0, 0])
})

test('pontuacao_mes: peças únicas, 50% qualidade, 30% produção, 20% prazo; gestor fora do ranking (contas à mão)', async () => {
  await cenario()
  await como(UG)
  const l = await pontos()
  // A Gestora fez etapas, mas fica fora do ranking, do bônus e da média do time.
  assert.deepEqual(l.map((x) => [x.posicao, x.nome]), [[1, 'Bia'], [2, 'Ana']])
  const por = Object.fromEntries(l.map((x) => [x.nome, x]))
  // Peças únicas: Ana mexeu em separação, bipagem e nota dos mesmos 3 pedidos (e Bia em quatro etapas): cada linha conta uma vez = 3 x 40.
  assert.deepEqual([por.Ana.pecas, por.Bia.pecas], [120, 120])
  // Ocorrências do mês (a anulada e a de novembro não contam): Ana 3 (2 erros + 1 problema), Bia 1.
  assert.deepEqual([por.Ana.ocorrencias, por.Bia.ocorrencias], [3, 1])
  assert.deepEqual([por.Ana.problemas_cliente, por.Bia.problemas_cliente], [1, 0])
  assert.deepEqual([n(por.Ana.ocorrencias_por_100), n(por.Bia.ocorrencias_por_100)], [2.5, 0.83]) // 3/120 e 1/120
  // Qualidade = 100 - 10 por ocorrência a cada 100 peças: Ana 100 - 25 = 75; Bia 100 - 8,33 = 91,7.
  assert.deepEqual([n(por.Ana.qualidade), n(por.Bia.qualidade)], [75, 91.7])
  // Produção = volume sobre a média do time (só as duas funcionárias, 120): as duas 100.
  assert.deepEqual([n(por.Ana.producao), n(por.Bia.producao)], [100, 100])
  // Prazo = % das passagens dentro da meta: Ana 4 de 7 (a bipagem do P1 levou 1,5 h para meta de 1); Bia 8 de 8.
  assert.deepEqual([n(por.Ana.prazo), n(por.Bia.prazo)], [57.1, 100])
  // Total: Ana 0,5 x 75 + 0,3 x 100 + 0,2 x 57,1 = 78,9; Bia 0,5 x 91,7 + 30 + 20 = 95,9 (95,85).
  assert.deepEqual([n(por.Ana.pontuacao), n(por.Bia.pontuacao)], [78.9, 95.9])
  assert.deepEqual([n(por.Ana.barra), n(por.Bia.barra)], [78.9, 95.9])
  // Bônus: 85 pontos ou mais e zero problema na cliente (Bia sim; Ana tem problema e não chega a 85).
  assert.deepEqual([por.Bia.bonus, por.Ana.bonus], [true, false])
})

test('pontuacao_mes: um problema na cliente tira o bônus mesmo com 85 pontos ou mais', async () => {
  const { bia, p1 } = await cenario()
  await db.query(`insert into ocorrencias (pedido_id, tipo, motivo, etapa, responsavel_id, created_at) values ($1,'problema_entrega','peca_errada','bipagem',$2,$3)`, [p1.id, bia, em('08', '10:00')])
  await como(UG)
  const b = (await pontos()).find((x) => x.nome === 'Bia')
  // 2 ocorrências em 120 peças = 1,67 por 100: qualidade 83,3; total 0,5 x 83,3 + 50 = 91,7 (ainda acima de 85).
  assert.deepEqual([b.problemas_cliente, n(b.qualidade), n(b.pontuacao)], [1, 83.3, 91.7])
  assert.equal(b.bonus, false)
})

test('pontuacao_componentes: fórmula numa função só; componente sem dado fica de fora e os pesos se redistribuem', async () => {
  const f = (...a) => one('select * from pontuacao_componentes($1::int,$2::int,$3::numeric,$4::numeric)', a)
  const v = (x) => [n(x.qualidade), n(x.producao), n(x.prazo), n(x.total)]
  assert.deepEqual(v(await f(0, 50, 50, 100)), [100, 100, 100, 100])
  // 1 ocorrência a cada 100 peças: qualidade 90; 100 peças contra média de 200: produção 50; prazo 50 -> 45 + 15 + 10.
  assert.deepEqual(v(await f(1, 100, 200, 50)), [90, 50, 50, 70])
  // Produção acima da média é limitada a 100.
  assert.equal(n((await f(0, 300, 100, 100)).producao), 100)
  // Sem etapa com meta: prazo fora; os pesos 50 e 30 viram 62,5% e 37,5%: (50 x 90 + 30 x 50) / 80 = 75.
  assert.deepEqual(v(await f(1, 100, 200, null)), [90, 50, null, 75])
  // Sem média do time (produção sem dado): qualidade 90 (peso 50) e prazo 60 (peso 20): (45 + 12) / 0,7 = 81,4.
  assert.deepEqual(v(await f(1, 100, null, 60)), [90, null, 60, 81.4])
  // Sem peças e sem ocorrência: só o prazo conta.
  assert.deepEqual(v(await f(0, 0, 100, 80)), [null, null, 80, 80])
  // Sem nenhum dado: sem nota. Ocorrência sem peça: qualidade 0.
  assert.deepEqual(v(await f(0, 0, null, null)), [null, null, null, null])
  assert.deepEqual(v(await f(1, 0, null, null)), [0, null, null, 0])
})

test('indicadores_fila: quantidade por etapa, cor do termômetro, mais antigo e proporções prontas', async () => {
  await membro('Gestora', 'gestor', UG, 'gestora@x.test')
  const nova = async (status, desde) => {
    const p = await pedidoWhats(status)
    await db.query("update pedidos set status_desde = now() - $2::interval where id=$1", [p.id, desde])
    return p
  }
  const velho = await nova('conferencia', '20 days') // vermelho
  const medio = await nova('conferencia', '5 days') // amarelo
  const novo = await nova('conferencia', '0 days') // verde
  const apagado = await nova('conferencia', '40 days')
  await db.query('update pedidos set excluido_em=now() where id=$1', [apagado.id])
  await nova('enviado', '3 days') // concluído: fora da fila
  await nova('novo', '1 day')
  const espera = await nova('separacao', '2 days')
  await db.exec('alter table pedidos disable trigger pedidos_antes; alter table pedidos disable trigger pedidos_depois')
  await db.query("update pedidos set status='aguardando_cliente' where id=$1", [espera.id])
  await db.exec('alter table pedidos enable trigger pedidos_antes; alter table pedidos enable trigger pedidos_depois')
  // Meta de conferência = horas do pedido de 5 dias / 1,5: ele fica a 1,5 x a meta (amarelo); o de 20 dias passa do dobro.
  const h = Number((await one('select horas_uteis(status_desde, now()) h from pedidos where id=$1', [medio.id])).h)
  await db.query("update metas_etapa set meta_horas_uteis=$1 where etapa='conferencia'", [h / 1.5])
  await como(UG)
  const f = (await one('select indicadores_fila() f')).f
  assert.deepEqual(f.map((x) => x.etapa), ['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio'])
  const conf = f.find((x) => x.etapa === 'conferencia')
  assert.deepEqual([conf.total, conf.verde, conf.amarelo, conf.vermelho, conf.sem_cor], [3, 1, 1, 1, 0])
  assert.deepEqual([n(conf.largura), n(conf.pct_verde), n(conf.pct_amarelo), n(conf.pct_vermelho), n(conf.pct_sem_cor)], [100, 33.3, 33.3, 33.3, 0])
  assert.equal(conf.mais_antigo.id, velho.id)
  assert.equal(conf.mais_antigo.numero, (await one('select numero from pedidos where id=$1', [velho.id])).numero)
  assert.ok(Number(conf.mais_antigo.horas) > h)
  assert.ok(novo.id)
  // A Fila e o Aguardando cliente não têm termômetro: contam, mas sem cor (tudo "sem cor"). A largura é relativa à maior fila (3).
  const fila = f.find((x) => x.etapa === 'novo')
  assert.deepEqual([fila.total, fila.verde, fila.amarelo, fila.vermelho, fila.sem_cor, n(fila.largura), n(fila.pct_sem_cor)], [1, 0, 0, 0, 1, 33.3, 100])
  const aguarda = f.find((x) => x.etapa === 'aguardando_cliente')
  assert.deepEqual([aguarda.total, aguarda.sem_cor, aguarda.mais_antigo.id], [1, 1, espera.id])
  // Etapa vazia: zeros e sem pedido mais antigo.
  const bip = f.find((x) => x.etapa === 'bipagem')
  assert.deepEqual([bip.total, bip.mais_antigo, n(bip.largura)], [0, null, 0])
})

test('só o gestor chama os indicadores; funcionária e anon são recusados', async () => {
  await membro('Gestora', 'gestor', UG, 'gestora@x.test')
  await membro('Ana', 'funcionaria', UA, 'ana@x.test')
  const chamadas = [
    ['select indicadores_resumo($1,$2)', [DE, ATE]], ['select indicadores_fila()', []],
    ['select * from indicadores_pessoas($1,$2)', [DE, ATE]], ["select * from pontuacao_mes('2026-10-15')", []]]
  await como(UA)
  for (const [sql, args] of chamadas) await recusa(() => db.query(sql, args), /Só o gestor/)
  await db.exec('reset role')
  await db.exec("select set_config('request.jwt.claims','',true)")
  await db.exec('set local role anon')
  for (const [sql, args] of chamadas) await recusa(() => db.query(sql, args), /permission denied/)
  // As internas não são chamáveis por ninguém logado.
  await como(UG)
  await recusa(() => db.query('select * from indicadores_passagens($1,$2)', [DE, ATE]), /permission denied/)
  await db.exec('select indicadores_fila()')
})
