import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { DADOS_COMPLETOS, escolher, fixture, pedidoWhats, prepararEtapa, recusa } from './fixtures.mjs'
import { criarBanco } from './suporte.mjs'

const inconsistencias = async (pedidoId, regra) =>
  (await db.query('select regra from listar_inconsistencias() where pedido_id=$1 and regra=$2', [pedidoId, regra])).rows.length

// V100: "Voltar a pendente" deixava a troca esperando uma peça que já não faltava. "Encontrada" tira a peça da troca
// ainda aberta e a marca como encontrada, na mesma transação.
test('V100: "Voltar a pendente" deixa a troca pendurada (o problema que a nova ação resolve)', async () => {
  const f = await fixture({ quantidade: 1 })
  await one("select alterar_item($1,$2::jsonb)", [f.itens[0].id, JSON.stringify({ status: 'pendente', observacao: null })])
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(1)
})

test('V100: encontrar_peca tira a única peça da troca, cancela a troca vazia e leva a peça para a Conferência', async () => {
  const f = await fixture({ quantidade: 1 })
  await one('select encontrar_peca($1)', [f.itens[0].id])
  expect((await one('select status from pedido_itens where id=$1', [f.itens[0].id])).status).toBe('encontrado')
  expect((await one('select status from trocas where id=$1', [f.troca.id])).status).toBe('cancelada')
  expect((await one('select count(*)::int n from troca_pecas where troca_id=$1', [f.troca.id])).n).toBe(0)
  // Única peça do pedido achada de novo: o desvio acaba e o pedido segue (a peça já está na Conferência).
  expect((await one('select status from pedidos where id=$1', [f.pedido.id])).status).toBe('conferencia')
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(0)
})

test('V100: com outras peças na troca, ela continua e vira "respondida" se as outras já escolheram', async () => {
  const f = await fixture({ quantidade: 2 })
  await escolher(f, 0)
  expect((await one('select status from trocas where id=$1', [f.troca.id])).status).toBe('enviada')
  await one('select encontrar_peca($1)', [f.itens[1].id])
  const t = await one('select status from trocas where id=$1', [f.troca.id])
  expect(t.status).toBe('respondida')
  expect((await one('select count(*)::int n from troca_pecas where troca_id=$1', [f.troca.id])).n).toBe(1)
  // A outra peça segue em falta: o pedido continua no desvio.
  expect((await one('select status from pedidos where id=$1', [f.pedido.id])).status).toBe('aguardando_cliente')
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(0)
})

test('V100: encontrar_peca só vale para peça em falta e não é pública', async () => {
  const f = await fixture({ quantidade: 1 })
  await one('select encontrar_peca($1)', [f.itens[0].id])
  await recusa(() => one('select encontrar_peca($1)', [f.itens[0].id]), /em falta/)
  await db.exec('set local role anon')
  await recusa(() => one('select encontrar_peca($1)', [f.itens[0].id]), /permission denied/)
})

// V106: enviar a troca só marca a troca como enviada; o pedido segue em "Avisar cliente" até "Cliente avisada".
test('V106: enviar_troca não leva o pedido a "Aguardando cliente"; o botão "Cliente avisada" leva', async () => {
  const p = await one("insert into pedidos(origem,status,cliente_nome,etapa_antes_desvio) values('whatsapp','avisar_cliente','Cliente','separacao') returning id")
  const i = await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status) values($1,'avulso','Anel','AN-1',1,50,'falta') returning id", [p.id])
  await db.exec('set local role authenticated')
  const troca = (await one('select garantir_troca($1, array[$2]::uuid[]) as id', [p.id, i.id])).id
  expect((await one('select status from trocas where id=$1', [troca])).status).toBe('rascunho')
  await one('select enviar_troca($1)', [troca])
  const t = await one('select status, enviada_em from trocas where id=$1', [troca])
  expect(t.status).toBe('enviada')
  expect(t.enviada_em).not.toBeNull()
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('avisar_cliente')
  // Reenviar não muda nada.
  await one('select enviar_troca($1)', [troca])
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('avisar_cliente')
  // "Cliente avisada" (a tela grava o status) é o que move o pedido.
  await db.query("update pedidos set status='aguardando_cliente' where id=$1", [p.id])
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('aguardando_cliente')
  await recusa(() => one('select enviar_troca($1)', ['00000000-0000-0000-0000-000000000000']), /não encontrada/)
})

// V107: etapa "Enviar rastreio" entre Postagem e Concluído, só para pedido que não é da Shopify.
const estado = async (id) => await one('select status,postado_em,rastreio_enviado_em from pedidos where id=$1', [id])
async function pedidoEm(status, origem = 'whatsapp') {
  const p = await pedidoWhats('em_aberto')
  if (origem === 'shopify') await db.query("update pedidos set origem='shopify',shopify_order_id=99001,numero='ARV-9001' where id=$1", [p.id])
  await prepararEtapa(p.id, status)
  return p
}

test('V107: pedido do WhatsApp: Postado leva para Enviar rastreio e "Mensagem enviada" leva para Concluído', async () => {
  const p = await pedidoEm('pronto_envio')
  await db.query('update pedidos set postado_em=now() where id=$1', [p.id])
  expect((await estado(p.id)).status).toBe('enviar_rastreio')
  await db.query('update pedidos set rastreio_enviado_em=now() where id=$1', [p.id])
  expect((await estado(p.id)).status).toBe('enviado')
  const fases = (await db.query("select para from pedido_eventos where pedido_id=$1 and tipo='status' order by id", [p.id])).rows.map((r) => r.para)
  expect(fases.slice(-2)).toEqual(['enviar_rastreio', 'enviado'])
})

test('V107: pedido da Shopify não passa por Enviar rastreio e não pode ir para lá', async () => {
  const p = await pedidoEm('pronto_envio', 'shopify')
  await recusa(() => db.query("update pedidos set postado_em=now(),status='enviar_rastreio' where id=$1", [p.id]), /Shopify/)
  await db.query('update pedidos set postado_em=now() where id=$1', [p.id])
  expect((await estado(p.id)).status).toBe('enviado')
})

test('V107: concluir direto (mover_etapa) marca a mensagem como enviada e anota as etapas puladas', async () => {
  const p = await pedidoEm('faturamento')
  await db.exec('set local role authenticated')
  expect((await one("select mover_etapa($1,'enviado') s", [p.id])).s).toBe('enviado')
  const e = await estado(p.id)
  expect(e.postado_em).not.toBeNull()
  expect(e.rastreio_enviado_em).not.toBeNull()
  expect((await one("select texto from pedido_eventos where pedido_id=$1 and tipo='etapas_puladas'", [p.id])).texto).toContain('Enviar rastreio')
})

test('V107: mover_etapa para Enviar rastreio e de volta; Shopify recusa a etapa', async () => {
  const p = await pedidoEm('embalagem')
  await db.exec('set local role authenticated')
  expect((await one("select mover_etapa($1,'enviar_rastreio') s", [p.id])).s).toBe('enviar_rastreio')
  let e = await estado(p.id)
  expect(e.postado_em).not.toBeNull()
  expect(e.rastreio_enviado_em).toBeNull()
  // Voltar para a Postagem desfaz a postagem; voltar de novo e ir para Enviar rastreio refaz.
  expect((await one("select mover_etapa($1,'pronto_envio') s", [p.id])).s).toBe('pronto_envio')
  e = await estado(p.id)
  expect(e.postado_em).toBeNull()
  const s = await pedidoEm('embalagem', 'shopify')
  await recusa(() => one("select mover_etapa($1,'enviar_rastreio')", [s.id]), /Shopify/)
  expect((await one("select mover_etapa($1,'enviado') s", [s.id])).s).toBe('enviado')
  expect((await estado(s.id)).rastreio_enviado_em).toBeNull()
})

test('V107: voltar de Enviar rastreio para a Postagem zera a mensagem; reiniciar a etapa também', async () => {
  const p = await pedidoEm('enviar_rastreio')
  await db.exec('set local role authenticated')
  await one("select reiniciar_pedido($1,'enviar_rastreio',false)", [p.id])
  expect((await estado(p.id)).status).toBe('enviar_rastreio')
  expect((await estado(p.id)).postado_em).not.toBeNull()
  expect((await estado(p.id)).rastreio_enviado_em).toBeNull()
  // Voltar de etapa (mover_etapa) para a Postagem zera também a postagem.
  expect((await one("select mover_etapa($1,'pronto_envio') s", [p.id])).s).toBe('pronto_envio')
  expect(await estado(p.id)).toMatchObject({ postado_em: null, rastreio_enviado_em: null })
})

test('V107: peça desfeita com o pedido em Enviar rastreio volta o pedido para a etapa das peças', async () => {
  const p = await pedidoEm('enviar_rastreio')
  await db.query("update pedido_itens set conferido_em=null,etiquetado_em=null,qtd_bipada=0 where pedido_id=$1 and sku='A1'", [p.id])
  await db.exec('set local role authenticated')
  expect((await one('select avancar_pecas($1) s', [p.id])).s).toBe('conferencia')
})

test('V107: a leitura operacional marca o pedido que espera a mensagem e as regras aceitam a etapa', async () => {
  const p = await pedidoEm('enviar_rastreio')
  const w = await pedidoEm('enviado')
  await db.exec('set local role authenticated')
  expect((await one('select pendente_rastreio from v_pedidos_operacao where id=$1', [p.id])).pendente_rastreio).toBe(true)
  expect((await one('select pendente_rastreio from v_pedidos_operacao where id=$1', [w.id])).pendente_rastreio).toBe(false)
  const op = await one('select fase, etapas_permitidas from v_pedidos_operacao where id=$1', [p.id])
  expect(op.fase).toBe('expedicao')
  expect(op.etapas_permitidas.enviar_rastreio).toBeNull()
  expect(op.etapas_permitidas.enviado).toMatch(/rastreio/)
  expect((await db.query("select regra from listar_inconsistencias() where pedido_id=$1 and regra='etapa_adiantada'", [p.id])).rows.length).toBe(0)
})

test('V107: designar aceita responsável da etapa Enviar rastreio', async () => {
  const p = await pedidoEm('enviar_rastreio')
  const m = await one("insert into equipe(nome) values ('Mel') returning id")
  await db.exec('set local role authenticated')
  await one("select designar($1,'enviar_rastreio',$2)", [p.id, m.id])
  expect((await one('select responsaveis from pedidos where id=$1', [p.id])).responsaveis.enviar_rastreio).toBe(m.id)
})

test('V107: produção por pessoa conta Postagem → Enviar rastreio como etapa concluída', async () => {
  const p = await pedidoEm('pronto_envio')
  await db.query("update pedido_eventos set usuario_email='ana@arvenne.test' where pedido_id=$1", [p.id])
  await db.query("insert into pedido_eventos(pedido_id,tipo,de,para,usuario_email) values ($1,'status','pronto_envio','enviar_rastreio','ana@arvenne.test')", [p.id])
  await db.exec('set local role authenticated')
  const r = await one("select etapa, pedidos from v_producao_pessoa where pessoa='ana@arvenne.test' and etapa='pronto_envio'")
  expect(r).toEqual({ etapa: 'pronto_envio', pedidos: 1 })
})

test('V107: a migration leva o pedido do WhatsApp já concluído sem mensagem para Enviar rastreio (e só ele)', async () => {
  const antes = {}
  const banco = await criarBanco({
    antesDe: '20261123090000',
    prepararAntes: async (b) => {
      const q = async (sql, a = []) => (await b.query(sql, a)).rows[0]
      const novo = async (origem, extra, nome) => {
        const p = await q(`insert into pedidos(origem,status,cliente_nome,numero) values ($1,'em_aberto',$2,$2) returning id`, [origem, nome])
        const cols = Object.keys(DADOS_COMPLETOS)
        await b.query(`update pedidos set ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')} where id=$1`, [p.id, ...cols.map((c) => DADOS_COMPLETOS[c])])
        await b.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values ($1,'avulso','Anel','A1',1,10)`, [p.id])
        await b.query(`update pedidos set status='novo',pago_em=now(),valor_pago=10,forma_pagamento='Pix' where id=$1`, [p.id])
        await b.query(`update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=1 where pedido_id=$1`, [p.id])
        await b.query(`update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now(),frete_gerado_em=now(),postado_em=now() ${extra} where id=$1`, [p.id])
        await b.query(`update pedidos set status='enviado' where id=$1`, [p.id])
        return p.id
      }
      antes.sem = await novo('whatsapp', '', 'Sem mensagem')
      antes.com = await novo('whatsapp', ',rastreio_enviado_em=now()', 'Com mensagem')
      antes.entregue = await novo('whatsapp', ',entregue_em=now()', 'Entregue')
      antes.shopify = await novo('shopify', '', 'Shopify')
    },
  })
  try {
    const st = async (id) => (await banco.query('select status from pedidos where id=$1', [id])).rows[0].status
    expect(await st(antes.sem)).toBe('enviar_rastreio')
    expect(await st(antes.com)).toBe('enviado')
    expect(await st(antes.entregue)).toBe('enviado')
    expect(await st(antes.shopify)).toBe('enviado')
    // O ajuste de dados não escreve histórico de status nem mexe no tempo na etapa.
    expect((await banco.query("select count(*)::int n from pedido_eventos where pedido_id=$1 and para='enviar_rastreio'", [antes.sem])).rows[0].n).toBe(0)
  } finally { await banco.close() }
})
