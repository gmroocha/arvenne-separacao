import assert from 'node:assert/strict'
import { expect, test } from 'vitest'
import { criarBanco, db, one } from './suporte.mjs'
import { montarVolume, UA, UG } from './volume.mjs'

// V115 (19/11/2026): o app caiu por ~10 minutos com 6 aparelhos no plano gratuito (278 "statement timeout").
// Aqui o banco leve: mesmas respostas, menos custo. Volume parecido com o real: 300 pedidos, ~2 mil peças, 150 trocas.
// Migration 20261126150000_desempenho.sql. A comparação com o banco ANTERIOR (20261126140000) garante que nada mudou de resultado.

const ANTES = '20261126140000'

async function como(banco, sub) {
  await banco.exec('reset role')
  if (!sub) return
  await banco.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub })}',true)`)
  await banco.exec('set local role authenticated')
}

const plano = async (sql, args = []) =>
  JSON.stringify((await db.query('explain (format json) ' + sql, args)).rows[0]['QUERY PLAN'])

async function alvos() {
  await db.exec('reset role')
  const ana = (await one("select id from equipe where nome = 'Ana'")).id
  const ativa = await one("select t.pedido_id, t.id troca from trocas t where t.status = 'enviada' order by t.pedido_id limit 1")
  // Pedido com troca em andamento que a Ana enxerga (a etapa atual é dela).
  const deAna = await one(`select p.id from pedidos p join trocas t on t.pedido_id = p.id and t.status = 'enviada'
    where p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = $1 order by p.id limit 1`, [ana])
  return { ana, gestor: ativa.pedido_id, ana_pedido: deAna.id }
}

test('V115: política de RLS usa a função dentro de (select ...) e não chama pode_ver_pedido() por linha', async () => {
  const { rows } = await db.query(`select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public'`)
  const sobras = rows.filter((r) => {
    const resto = r.expr.replaceAll('( SELECT sou_gestor() AS sou_gestor)', '').replaceAll('( SELECT membro_atual() AS membro_atual)', '')
    return /sou_gestor\(\)|membro_atual\(\)|pode_ver_pedido\(/.test(resto)
  }).map((r) => `${r.tablename}.${r.policyname}`)
  assert.deepEqual(sobras, [], 'políticas com função fora de (select ...) ou com pode_ver_pedido por linha')
})

test('V115: consultas por pedido/peça não calculam a tabela inteira (sem janela nem CTE repetido), como gestor e como funcionária', async () => {
  await montarVolume(db)
  const a = await alvos()
  const consultas = [
    ['v_item_liquido', "select * from v_item_liquido where pedido_id = $1"],
    ['v_cobertura_troca_peca', "select * from v_cobertura_troca_peca where pedido_id = $1"],
    ['v_troca_valores', "select * from v_troca_valores where pedido_id = $1"],
    ['v_troca_resumo', "select * from v_troca_resumo where pedido_id = $1"],
    ['v_pedido_acerto', "select * from v_pedido_acerto where pedido_id = $1"],
    ['v_pedido_alteracoes', "select * from v_pedido_alteracoes where pedido_id = $1"],
    ['v_pedidos', "select * from v_pedidos where id = $1"],
  ]
  for (const [sub, pedido] of [[UG, a.gestor], [UA, a.ana_pedido]]) {
    await como(db, sub)
    for (const [nome, sql] of consultas) {
      const p = await plano(sql, [pedido])
      assert.ok(!p.includes('WindowAgg'), `${nome} (${sub === UG ? 'gestor' : 'funcionária'}) ainda calcula uma janela sobre todas as linhas`)
      assert.ok(!p.includes('"Node Type":"CTE Scan"'), `${nome} (${sub === UG ? 'gestor' : 'funcionária'}) ainda lê um CTE materializado inteiro`)
    }
  }
})

test('V115: as consultas quentes cabem folgadas no limite do banco (gestor e funcionária, volume real)', async () => {
  await montarVolume(db)
  const a = await alvos()
  const melhor = async (sql, args) => {
    let m = Infinity
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); await db.query(sql, args); m = Math.min(m, performance.now() - t0) }
    return m
  }
  // Limites ~5 a 10 vezes acima do medido depois da migration e bem abaixo do que a funcionária pagava antes (RLS por linha + janelas).
  const limites = [
    ['troca_painel', 'select troca_painel($1)', 120],
    ['v_troca_resumo', 'select * from v_troca_resumo where pedido_id = $1', 100],
    ['v_pedido_acerto', 'select * from v_pedido_acerto where pedido_id = $1', 100],
    ['v_pedido_alteracoes', 'select * from v_pedido_alteracoes where pedido_id = $1', 60],
  ]
  for (const [sub, pedido, quem] of [[UG, a.gestor, 'gestor'], [UA, a.ana_pedido, 'funcionária']]) {
    await como(db, sub)
    for (const [nome, sql, limite] of limites) {
      const ms = await melhor(sql, [pedido])
      expect(ms, `${nome} (${quem}) levou ${ms.toFixed(0)} ms`).toBeLessThan(limite)
    }
    const lista = await melhor('select * from v_pedidos_operacao where status in (\'novo\',\'separacao\',\'conferencia\',\'bipagem\',\'faturamento\',\'embalagem\',\'pronto_envio\',\'enviar_rastreio\')')
    expect(lista, `lista da Expedição (${quem}) levou ${lista.toFixed(0)} ms`).toBeLessThan(400)
    const contagens = await melhor('select contagens_pedidos()')
    expect(contagens, `contagens_pedidos (${quem}) levou ${contagens.toFixed(0)} ms`).toBeLessThan(80)
  }
}, 60_000)

// ---------------------------------------------------------------------------------------------------------------
// Comparação com o banco anterior à migration: mesmos dados (volume determinístico), mesmas respostas, por número do pedido.
// ---------------------------------------------------------------------------------------------------------------
// Alguns pedidos (com troca em andamento, concluída, em várias etapas): as consultas por pedido do banco anterior são lentas demais
// para rodar nos 300 (era justamente o problema).
const AMOSTRA = "('W0001','W0002','W0003','W0031','W0032','W0050','W0070','W0110','W0148','W0160','W0230')"

const SQL_COMPARAVEL = {
  pedidos: `select numero, status, subtotal, desconto, total, total_geral, total_pago, valor_pecas_pacote, a_devolver, acerto_pendente,
      troca_coberto, valor_removido, qtd_adicionais, valor_somado, frete_na_conta from v_pedidos where numero in ${AMOSTRA} order by numero`,
  itens: `select p.numero, i.ordem, i.sku, l.valor_antes_cobertura, l.coberto, l.valor_liquido
      from v_item_liquido l join pedido_itens i on i.id = l.id join pedidos p on p.id = l.pedido_id order by p.numero, i.ordem, i.sku`,
  cobertura: `select p.numero, i.ordem, c.coberto from v_cobertura_troca_peca c join pedidos p on p.id = c.pedido_id
      join troca_pecas tp on tp.id = c.troca_peca_id join pedido_itens i on i.id = tp.item_id order by p.numero, i.ordem`,
  valores: `select p.numero, i.ordem, v.tipo, o.ordem as opcao, v.qtd, v.valor_pago_item, v.valor_opcao, v.diferenca, v.situacao, v.valor_unit,
        v.coberto_previsto, v.cliente_paga_previsto
      from v_troca_valores v join pedidos p on p.id = v.pedido_id join pedido_itens i on i.id = v.item_id
      left join troca_opcoes o on o.id = v.opcao_id order by p.numero, i.ordem, v.tipo, o.ordem`,
  carrinho: `select p.numero, i.ordem, c.unidades, c.valor_escolhido, c.valor_pago_item, c.diferenca, c.coberto_previsto, c.cliente_paga_previsto
      from v_troca_carrinho c join pedidos p on p.id = c.pedido_id join pedido_itens i on i.id = c.item_id order by p.numero, i.ordem`,
  resumo: `select p.numero, r.pecas_total, r.pecas_respondidas, r.total_pago, r.diferenca_total, r.diferenca_bruta, r.coberto, r.cobrir_ate
      from v_troca_resumo r join pedidos p on p.id = r.pedido_id order by p.numero, r.pecas_total`,
  acerto: `select p.numero, a.valor_pago_original, a.valor_pago_pecas_trocadas, a.total_a_cobrar, a.total_credito, a.saldo, a.novo_total,
        a.acerto_status, a.coberto, a.total_pago_atual, a.bloqueio, jsonb_array_length(a.pecas) as pecas
      from v_pedido_acerto a join pedidos p on p.id = a.pedido_id where p.numero in ${AMOSTRA} order by p.numero`,
  alteracoes: `select p.numero, a.tipo, a.valor, a.diferenca, a.coberto_loja, a.cliente_paga, a.credito, a.a_devolver, jsonb_array_length(a.entra) as entra
      from v_pedido_alteracoes a join pedidos p on p.id = a.pedido_id where p.numero in ${AMOSTRA} order by p.numero, a.tipo, a.valor, a.diferenca`,
  painel: `select p.numero, (troca_painel(p.id) -> 'resumo') - 'troca_id' - 'pedido_id' as resumo,
        (select jsonb_agg(jsonb_build_object('coberto', x -> 'coberto', 'cliente_paga', x -> 'cliente_paga', 'carrinho', x -> 'carrinho' -> 'diferenca',
           'valores', (select jsonb_agg(v -> 'diferenca' order by v ->> 'diferenca') from jsonb_array_elements(x -> 'valores') v)) order by x ->> 'resultado_diferenca')
           from jsonb_array_elements(troca_painel(p.id) -> 'pecas') x) as pecas
      from pedidos p where p.numero in ${AMOSTRA} order by p.numero`,
  publica: `select p.numero, (troca_publica(t.token) -> 'resumo') as resumo,
        (select jsonb_agg(jsonb_build_object('valor_pago', x -> 'valor_pago', 'valor_escolhido', x -> 'valor_escolhido', 'unidades', x -> 'unidades',
           'opcoes', (select jsonb_agg(jsonb_build_object('valor', o -> 'valor', 'diferenca', o -> 'diferenca', 'situacao', o -> 'situacao') order by o ->> 'valor')
                        from jsonb_array_elements(x -> 'opcoes') o)) order by x ->> 'valor_pago')
           from jsonb_array_elements(troca_publica(t.token) -> 'pecas') x) as pecas
      from trocas t join pedidos p on p.id = t.pedido_id where t.status <> 'rascunho' and p.numero in ${AMOSTRA} order by p.numero`,
  repetidas: `select chave, qtd_total, qtd_pedidos,
        (select jsonb_agg(jsonb_build_object('numero', x ->> 'numero', 'qtd', x -> 'qtd', 'status', x ->> 'status', 'prazo', (x ->> 'prazo') is not null)
           order by x ->> 'numero') from jsonb_array_elements(pedidos) x) as pedidos
      from pecas_repetidas(null, false) order by chave`,
  repetidas_avancadas: `select chave, qtd_total, qtd_pedidos from pecas_repetidas(null, true) order by chave`,
  contagens: `select contagens_pedidos() as c, contagem_repetidas() as r`,
  operacao: `select numero, status, qtd_pecas, qtd_encontradas, fase, termometro is null as sem_termometro, cliente_decidiu, acerto_pendente, a_devolver,
        (prazo is not null) as tem_prazo, etapas_permitidas from v_pedidos_operacao order by numero`,
}

const FUNCOES_DE_DATA = `
  select jsonb_agg(jsonb_build_object('p', public.prazo_envio(t), 'h', public.horas_uteis(t, t + (g % 11 || ' days')::interval + (g % 7 || ' hours')::interval)) order by g)
  from (select g, timestamptz '2026-01-01 00:00:00-03' + (g * interval '7 hours 13 minutes') as t from generate_series(0, 599) g) x`

async function coletar(banco, contextos) {
  await banco.exec('reset role')
  await banco.exec(`insert into feriados (data, nome) values ('2026-01-01','a'),('2026-02-16','b'),('2026-02-17','c'),('2026-04-03','d'),('2026-04-21','e'),
    ('2026-05-01','f'),('2026-06-04','g'),('2026-09-07','h'),('2026-10-12','i'),('2026-11-02','j'),('2026-11-15','k'),('2026-11-20','l'),('2026-12-25','m')
    on conflict do nothing`)
  const saida = {}
  saida.datas = (await banco.query(FUNCOES_DE_DATA)).rows[0].jsonb_agg
  for (const [rotulo, sub] of contextos) {
    await banco.exec('savepoint contexto')
    await como(banco, sub)
    for (const [nome, sql] of Object.entries(SQL_COMPARAVEL)) {
      saida[`${rotulo}:${nome}`] = JSON.parse(JSON.stringify((await banco.query(sql)).rows))
    }
    await banco.exec('rollback to savepoint contexto')
  }
  return saida
}

test('V115: depois da migration, todas as respostas são iguais às do banco anterior (mesmos dados, por número do pedido)', async () => {
  const contextos = [['gestor', UG], ['funcionaria', UA]]
  // Banco anterior, só até a Fase 4, com o mesmo volume.
  const antigo = await criarBanco({ ate: ANTES })
  await antigo.exec('begin')
  await montarVolume(antigo)
  const esperado = await coletar(antigo, contextos)
  await antigo.close()
  // Banco novo (o do teste), com o mesmo volume.
  await montarVolume(db)
  const atual = await coletar(db, contextos)
  for (const chave of Object.keys(esperado)) {
    assert.deepEqual(atual[chave], esperado[chave], `resposta diferente em ${chave}`)
  }
  // O volume tem dinheiro de verdade para comparar (nada vazio por acidente).
  expect(atual['gestor:itens'].some((r) => Number(r.coberto) > 0), 'rateio da cobertura da loja').toBe(true)
  expect(atual['gestor:acerto'].length).toBeGreaterThan(3)
  expect(atual['funcionaria:pedidos'].length).toBeGreaterThan(0)
  expect(atual['funcionaria:pedidos'].length).toBeLessThan(atual['gestor:pedidos'].length)
  expect(atual.datas).toHaveLength(600)
}, 90_000)
