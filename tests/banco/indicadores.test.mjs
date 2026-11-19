import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Fase 4 (20261126140000): indicadores do gestor. Cada número abaixo foi conferido à mão (as contas estão nos comentários).
// Semana de teste: segunda 05/10/2026 a sexta 09/10/2026 (sem feriado); as horas úteis entre dois instantes são as horas corridas
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

test('indicadores_resumo: prazo, enviados, erros por 100, pegos antes e gargalo (contas à mão)', async () => {
  await cenario()
  await como(UG)
  const r = await resumo()
  // 3 pedidos enviados na semana (o P4 foi dia 13), 2 peças cada; 2 dentro do prazo de 48 h úteis.
  assert.equal(r.enviados_pedidos, 3)
  assert.equal(r.enviados_pecas, 6)
  assert.equal(r.prazo_total, 3)
  assert.equal(r.prazo_dentro, 2)
  assert.equal(n(r.prazo_pct), 66.7)
  // Peças separadas na semana: 3 pedidos x 2 peças. Erros: 2 erros de bipagem + 1 falta indevida (anulada e de outro mês não contam).
  assert.equal(r.pecas_separadas, 6)
  assert.equal(r.erros_bipagem, 2)
  assert.equal(r.faltas_indevidas, 1)
  assert.equal(n(r.erros_por_100), 50) // (2 + 1) / 6 x 100
  assert.equal(r.problemas_cliente, 1)
  assert.equal(n(r.pegos_antes_pct), 66.7) // 2 / (2 + 1)
  // Tempo médio por etapa (h úteis): sep (1+4+1)/3=2; conf (0,5+1+0,5)/3=0,67; bip (1,5+0,5+0,5)/3=0,83; fat (0,5+17+0,5)/3=6;
  // emb 1; postagem (25+26+20)/3=23,67 -> gargalo.
  const t = Object.fromEntries(r.tempos.map((x) => [x.etapa, n(x.horas)]))
  assert.deepEqual(t, { separacao: 2, conferencia: 0.67, bipagem: 0.83, faturamento: 6, embalagem: 1, pronto_envio: 23.67 })
  assert.equal(r.gargalo.etapa, 'pronto_envio')
  assert.equal(n(r.gargalo.horas), 23.67)
  assert.equal(r.tempos.find((x) => x.etapa === 'separacao').meta, 2)
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
  assert.deepEqual(r.tempos, [])
  await recusa(() => db.query('select indicadores_resumo($1,$2)', [ATE, DE]), /Período inválido/)
})

test('indicadores_pessoas: peças por etapa, tempo por peça na separação e ocorrências por pessoa', async () => {
  const { ana, bia, g } = await cenario()
  await como(UG)
  const l = Object.fromEntries((await pessoas()).map((x) => [x.nome, x]))
  assert.deepEqual(Object.keys(l).sort(), ['Ana', 'Bia', 'Gestora'])
  // Ana: separou P1 e P2 (4 peças), bipou P1 (autor) e P2 (saída da bipagem pelo e-mail dela), fatura os 3 (responsável = 6 peças).
  assert.deepEqual([l.Ana.separacao, l.Ana.conferencia, l.Ana.bipagem, l.Ana.faturamento, l.Ana.embalagem, l.Ana.pronto_envio], [4, 0, 4, 6, 0, 0])
  assert.equal(n(l.Ana.minutos_por_peca_separacao), 75) // (1,0 + 4,0 h) x 60 / 4 peças
  assert.deepEqual([l.Ana.erros_separacao, l.Ana.faltas_indevidas, l.Ana.problemas_cliente], [2, 0, 1])
  // Bia: separou P3 (2), conferiu os 3 (6), bipagem de P3 (2), embalagem dos 3 (saída pelo e-mail, 6).
  assert.deepEqual([l.Bia.separacao, l.Bia.conferencia, l.Bia.bipagem, l.Bia.faturamento, l.Bia.embalagem, l.Bia.pronto_envio], [2, 6, 2, 0, 6, 0])
  assert.equal(n(l.Bia.minutos_por_peca_separacao), 30) // 1,0 h x 60 / 2
  assert.deepEqual([l.Bia.erros_separacao, l.Bia.faltas_indevidas, l.Bia.problemas_cliente], [0, 1, 0]) // a anulada não conta
  // Gestora fez a saída da Postagem dos 3 pedidos (6 peças) e nenhuma separação.
  assert.deepEqual([l.Gestora.pronto_envio, l.Gestora.separacao, l.Gestora.minutos_por_peca_separacao], [6, 0, null])
  assert.deepEqual([l.Gestora.erros_separacao, l.Gestora.faltas_indevidas, l.Gestora.problemas_cliente], [0, 0, 0])
  assert.ok(ana && bia && g)
})

test('pontuacao_mes: 50% qualidade, 30% produção e 20% prazo; ranking e bônus (contas à mão)', async () => {
  await cenario()
  await como(UG)
  const l = await pontos()
  assert.deepEqual(l.map((x) => [x.posicao, x.nome]), [[1, 'Bia'], [2, 'Gestora'], [3, 'Ana']])
  const por = Object.fromEntries(l.map((x) => [x.nome, x]))
  // Peças (soma das passagens da pessoa), horas e peças por hora: Ana 14 / 25 h (sep 5 + bip 2 + fat 18); Bia 16 / 6,5 h; Gestora 6 / 71 h. Média do time 1,0353.
  assert.deepEqual([por.Ana.pecas, por.Bia.pecas, por.Gestora.pecas], [14, 16, 6])
  assert.deepEqual([n(por.Ana.pecas_por_hora), n(por.Bia.pecas_por_hora), n(por.Gestora.pecas_por_hora)], [0.56, 2.46, 0.08])
  // Ocorrências do mês (a anulada e a de novembro não contam): Ana 3 (2 erros + 1 problema), Bia 1, Gestora 0.
  assert.deepEqual([por.Ana.ocorrencias, por.Bia.ocorrencias, por.Gestora.ocorrencias], [3, 1, 0])
  assert.deepEqual([por.Ana.problemas_cliente, por.Bia.problemas_cliente], [1, 0])
  assert.deepEqual([n(por.Ana.ocorrencias_por_100), n(por.Bia.ocorrencias_por_100)], [21.43, 6.25])
  // Qualidade = 100 - 10 por ocorrência a cada 100 peças, piso 0: Ana 100-214 -> 0; Bia 100-62,5 = 37,5; Gestora 100.
  assert.deepEqual([n(por.Ana.qualidade), n(por.Bia.qualidade), n(por.Gestora.qualidade)], [0, 37.5, 100])
  // Produção = peças/h sobre a média (máx. 100): Ana 0,56/1,0353 = 54,1; Bia 237,7 -> 100; Gestora 8,2.
  assert.deepEqual([n(por.Ana.producao), n(por.Bia.producao), n(por.Gestora.producao)], [54.1, 100, 8.2])
  // Prazo = % das passagens dentro da meta: Ana 4 de 7 (a bipagem do P1 levou 1,5 h para meta de 1); Bia 8 de 8; Gestora 0 de 3.
  assert.deepEqual([n(por.Ana.prazo), n(por.Bia.prazo), n(por.Gestora.prazo)], [57.1, 100, 0])
  // Total: Ana 0,3 x 54,1 + 0,2 x 57,1 = 27,7; Bia 0,5 x 37,5 + 30 + 20 = 68,8; Gestora 50 + 0,3 x 8,2 = 52,5.
  assert.deepEqual([n(por.Ana.pontuacao), n(por.Bia.pontuacao), n(por.Gestora.pontuacao)], [27.7, 68.8, 52.5])
  assert.deepEqual(l.map((x) => x.bonus), [false, false, false])
})

test('pontuacao_componentes: a fórmula está em uma função só; bônus exige 85 pontos e zero problema na cliente', async () => {
  const f = async (...a) => (await one('select * from pontuacao_componentes($1::int,$2::int,$3::numeric,$4::numeric,$5::numeric)', a))
  const perfeito = await f(0, 50, 2, 2, 100)
  assert.deepEqual([n(perfeito.qualidade), n(perfeito.producao), n(perfeito.prazo), n(perfeito.total)], [100, 100, 100, 100])
  const meio = await f(1, 100, 1, 2, 50) // 1 por 100 peças: 90; produção 50; prazo 50 -> 45 + 15 + 10
  assert.deepEqual([n(meio.qualidade), n(meio.producao), n(meio.total)], [90, 50, 70])
  assert.equal(n((await f(0, 0, null, null, null)).total), 50) // sem peças e sem ocorrência: qualidade 100, o resto 0
  assert.equal(n((await f(1, 0, null, null, null)).qualidade), 0) // ocorrência sem peça: qualidade 0
  // Uma pessoa sozinha, tudo no prazo e sem ocorrência: 100 pontos e bônus. Com um problema na cliente, perde o bônus.
  await cenario()
  await db.query('delete from ocorrencias')
  await como(UG)
  const l = await pontos()
  assert.ok(l.every((x) => n(x.qualidade) === 100))
  const bia = l.find((x) => x.nome === 'Bia')
  assert.equal(bia.bonus, n(bia.pontuacao) >= 85)
  assert.equal(n(bia.pontuacao), 100) // Bia: produção acima da média (100), prazo 8 de 8 (100), sem ocorrência
  assert.equal(bia.bonus, true)
  await db.exec('reset role')
  await db.query(`insert into ocorrencias (pedido_id, tipo, motivo, etapa, responsavel_id, created_at)
    select p.id, 'problema_entrega', 'peca_errada', 'bipagem', (select id from equipe where nome='Bia'), $1 from pedidos p limit 1`, [em('08', '10:00')])
  await como(UG)
  const depois = (await pontos()).find((x) => x.nome === 'Bia')
  assert.equal(depois.problemas_cliente, 1)
  assert.equal(depois.bonus, false)
})

test('indicadores_fila: quantidade por etapa, cor do termômetro e pedido mais antigo', async () => {
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
  // Meta de conferência = horas do pedido de 5 dias / 1,5: ele fica a 1,5 x a meta (amarelo); o de 20 dias passa do dobro.
  const h = Number((await one('select horas_uteis(status_desde, now()) h from pedidos where id=$1', [medio.id])).h)
  await db.query("update metas_etapa set meta_horas_uteis=$1 where etapa='conferencia'", [h / 1.5])
  await como(UG)
  const f = (await one('select indicadores_fila() f')).f
  assert.deepEqual(f.map((x) => x.etapa), ['novo', 'separacao', 'avisar_cliente', 'conferencia', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio'])
  const conf = f.find((x) => x.etapa === 'conferencia')
  assert.deepEqual([conf.total, conf.verde, conf.amarelo, conf.vermelho], [3, 1, 1, 1])
  assert.equal(conf.mais_antigo.id, velho.id)
  assert.equal(conf.mais_antigo.numero, (await one('select numero from pedidos where id=$1', [velho.id])).numero)
  assert.ok(Number(conf.mais_antigo.horas) > h)
  assert.ok(novo.id)
  // A Fila não tem termômetro: conta, mas sem cor. Etapa vazia: zeros e sem pedido mais antigo.
  const fila = f.find((x) => x.etapa === 'novo')
  assert.deepEqual([fila.total, fila.verde, fila.amarelo, fila.vermelho], [1, 0, 0, 0])
  const bip = f.find((x) => x.etapa === 'bipagem')
  assert.deepEqual([bip.total, bip.mais_antigo], [0, null])
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
