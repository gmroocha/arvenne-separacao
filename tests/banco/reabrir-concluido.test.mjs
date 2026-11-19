import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { importar, payload, pedidoDe, pedidoWhats, somaFixture, prepararEtapa, recusa, entrarComo } from './fixtures.mjs'

// Reabrir pedido concluído (20261126120000): só o gestor volta um pedido 'enviado' para uma etapa anterior.
// O trabalho do destino em diante é zerado, a entrega some e o pedido não pula de volta para Concluído.
const CAMPOS = 'status,entregue_em,rastreio,rastreio_url,rastreio_enviado_em,postado_em,embalado_em,frete_gerado_em,frete_peso_g,nf_emitida_em,pedido_fornecedor_em,nf_numero'
const ver = (id) => one(`select ${CAMPOS} from pedidos where id=$1`, [id])
const mover = async (id, destino) => (await one('select mover_etapa($1,$2) s', [id, destino])).s
const GESTORA = 'gestora@arvenne.test'

async function shopifyEm(status) {
  await importar(payload({ shopify_order_id: '777002', numero: 'ARV-R1' }))
  const { id } = await pedidoDe('777002')
  await prepararEtapa(id, status)
  return { id }
}

async function concluido(origem = 'whatsapp') {
  await db.exec('reset role')
  const p = origem === 'shopify' ? await shopifyEm('enviado') : await pedidoWhats('enviado')
  await db.query(`update pedidos set entregue_em=now(), rastreio='AA123', rastreio_url='https://rastreio.test/AA123', nf_numero='4567' where id=$1`, [p.id])
  return p
}

test('gestor reabre para Embalagem e frete: zera embalagem, frete, postagem, rastreio enviado e entrega; guarda o que é anterior e o link', async () => {
  const p = await concluido()
  assert.ok((await ver(p.id)).entregue_em)
  await entrarComo(GESTORA)
  assert.equal(await mover(p.id, 'embalagem'), 'embalagem')
  const v = await ver(p.id)
  assert.equal(v.status, 'embalagem')
  for (const c of ['entregue_em', 'rastreio_enviado_em', 'postado_em', 'embalado_em', 'frete_gerado_em', 'frete_peso_g']) assert.equal(v[c], null, c)
  assert.ok(v.nf_emitida_em && v.pedido_fornecedor_em, 'nota e pedido do fornecedor continuam (são anteriores)')
  assert.equal(v.nf_numero, '4567')
  assert.equal(v.rastreio, 'AA123', 'o rastreio fica para reaproveitar')
  assert.equal(v.rastreio_url, 'https://rastreio.test/AA123')
  const itens = (await db.query('select status,conferido_em,qtd,qtd_bipada from pedido_itens where pedido_id=$1', [p.id])).rows
  assert.ok(itens.every((i) => i.status === 'encontrado' && i.conferido_em && i.qtd_bipada === i.qtd), 'peças continuam conferidas e bipadas')
  const ev = await one("select de,texto,usuario_email from pedido_eventos where pedido_id=$1 and tipo='reiniciado'", [p.id])
  assert.deepEqual([ev.de, ev.texto, ev.usuario_email], ['enviado', 'reaberto: voltou para Embalagem e frete', GESTORA])
  const st = await one("select de,para from pedido_eventos where pedido_id=$1 and tipo='status' order by id desc limit 1", [p.id])
  assert.deepEqual([st.de, st.para], ['enviado', 'embalagem'])
})

test('reabrido não volta sozinho para Concluído; refazer cada etapa leva adiante como sempre', async () => {
  const p = await concluido()
  await entrarComo(GESTORA)
  await mover(p.id, 'embalagem')
  assert.equal((await ver(p.id)).status, 'embalagem')
  await db.query("update pedidos set cliente_nome=cliente_nome||' ' where id=$1", [p.id])
  assert.equal((await ver(p.id)).status, 'embalagem', 'uma gravação qualquer não avança')
  await db.query('update pedidos set embalado_em=now(),frete_gerado_em=now() where id=$1', [p.id])
  assert.equal((await ver(p.id)).status, 'pronto_envio')
  await db.query('update pedidos set postado_em=now() where id=$1', [p.id])
  assert.equal((await ver(p.id)).status, 'enviar_rastreio', 'WhatsApp passa pelo Enviar rastreio de novo')
  await db.query('update pedidos set rastreio_enviado_em=now() where id=$1', [p.id])
  assert.equal((await ver(p.id)).status, 'enviado')
})

test('cada destino zera só do destino em diante (WhatsApp)', async () => {
  const esperado = {
    enviar_rastreio: { rastreio_enviado_em: null, postado_em: 'tem', embalado_em: 'tem', frete_gerado_em: 'tem', nf_emitida_em: 'tem' },
    pronto_envio: { rastreio_enviado_em: null, postado_em: null, embalado_em: 'tem', frete_gerado_em: 'tem', nf_emitida_em: 'tem' },
    faturamento: { rastreio_enviado_em: null, postado_em: null, embalado_em: null, frete_gerado_em: null, nf_emitida_em: null, pedido_fornecedor_em: null },
  }
  for (const [destino, campos] of Object.entries(esperado)) {
    await db.exec('savepoint cada')
    const p = await concluido()
    await entrarComo(GESTORA)
    assert.equal(await mover(p.id, destino), destino)
    const v = await ver(p.id)
    for (const [c, x] of Object.entries(campos)) assert.equal(v[c] === null ? null : 'tem', x, `${destino}: ${c}`)
    assert.equal(v.entregue_em, null, `${destino}: entregue_em`)
    await db.exec('reset role')
    await db.exec('rollback to savepoint cada')
  }
})

test('voltar para Separação deixa as peças pendentes e o pedido volta à Expedição (fase)', async () => {
  const p = await concluido()
  await entrarComo(GESTORA)
  assert.equal(await mover(p.id, 'separacao'), 'separacao')
  assert.ok((await db.query('select status,conferido_em,qtd_bipada from pedido_itens where pedido_id=$1', [p.id])).rows.every((i) => i.status === 'pendente' && !i.conferido_em && i.qtd_bipada === 0))
  assert.equal((await one('select fase from v_pedidos where id=$1', [p.id])).fase, 'expedicao')
})

test('funcionária é recusada com mensagem clara e nada muda', async () => {
  const p = await concluido()
  await entrarComo('bia@arvenne.test', 'funcionaria')
  await recusa(() => mover(p.id, 'embalagem'), /Só gestor pode reabrir um pedido concluído/)
  await db.exec('reset role')
  assert.equal((await ver(p.id)).status, 'enviado')
  assert.ok((await ver(p.id)).entregue_em)
})

test('gravar status direto em pedido concluído continua proibido (só mover_etapa reabre)', async () => {
  const p = await concluido()
  await entrarComo(GESTORA)
  await recusa(() => db.query("update pedidos set status='embalagem' where id=$1", [p.id]), /arquivado/)
  await recusa(() => db.query("update pedido_itens set qtd_bipada=0 where pedido_id=$1", [p.id]), /arquivado/)
  assert.equal((await ver(p.id)).status, 'enviado')
})

test('de Concluído não se vai "para frente": o mesmo destino é nada a fazer e etapa que não é da esteira é inválida', async () => {
  const p = await concluido()
  await entrarComo(GESTORA)
  assert.equal(await mover(p.id, 'enviado'), 'enviado')
  assert.ok((await ver(p.id)).entregue_em, 'ficar em Concluído não desfaz a entrega')
  for (const destino of ['novo', 'avisar_cliente', 'cancelado', 'somada', 'frete']) await recusa(() => mover(p.id, destino), /Etapa inválida/)
  assert.equal((await ver(p.id)).status, 'enviado')
})

test('Shopify: reabre para as etapas da Shopify e não aceita Enviar rastreio', async () => {
  const p = await concluido('shopify')
  await entrarComo(GESTORA)
  await recusa(() => mover(p.id, 'enviar_rastreio'), /Shopify não tem a etapa Enviar rastreio/)
  assert.equal(await mover(p.id, 'pronto_envio'), 'pronto_envio')
  const v = await ver(p.id)
  assert.equal(v.postado_em, null)
  assert.equal(v.entregue_em, null)
  assert.ok(v.embalado_em && v.frete_gerado_em)
  await db.query('update pedidos set postado_em=now() where id=$1', [p.id])
  assert.equal((await ver(p.id)).status, 'enviado', 'Shopify vai direto da Postagem para Concluído')
})

test('cancelado, somada e venda não são reabertos por aqui', async () => {
  const canc = await pedidoWhats('separacao')
  await db.query("update pedidos set status='cancelado' where id=$1", [canc.id])
  const venda = await pedidoWhats('em_aberto')
  await db.exec('reset role')
  const { w } = await somaFixture()
  await db.exec('reset role')
  await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
  const somada = { id: w.id }
  assert.equal((await one('select status from pedidos where id=$1', [somada.id])).status, 'somada')
  await entrarComo(GESTORA)
  for (const id of [canc.id, venda.id, somada.id]) await recusa(() => mover(id, 'separacao'), /Só dá para mover de etapa um pedido que está na esteira/)
  assert.equal((await one('select status from pedidos where id=$1', [canc.id])).status, 'cancelado')
})

test('histórico coerente: v_tempo_etapas fecha a passagem por Concluído e abre a do destino; produção por pessoa não conta a volta', async () => {
  const p = await concluido()
  const antes = (await db.query('select count(*)::int n from v_producao_pessoa')).rows[0].n
  await entrarComo(GESTORA)
  await mover(p.id, 'embalagem')
  const t = (await db.query("select etapa,visita,em_andamento,proxima_etapa from v_tempo_etapas where pedido_id=$1 and etapa in ('enviado','embalagem') order by entrou_em, visita", [p.id])).rows
  const enviado = t.filter((r) => r.etapa === 'enviado')
  assert.ok(enviado.length >= 1 && enviado.every((r) => !r.em_andamento))
  assert.equal(enviado.at(-1).proxima_etapa, 'embalagem')
  assert.equal(t.filter((r) => r.etapa === 'embalagem').at(-1).em_andamento, true)
  assert.equal((await db.query('select count(*)::int n from v_producao_pessoa')).rows[0].n, antes)
})

test('dinheiro não muda ao reabrir', async () => {
  const p = await concluido()
  const antes = await one('select total,subtotal,frete_na_conta,total_geral from v_pedidos where id=$1', [p.id])
  await entrarComo(GESTORA)
  await mover(p.id, 'faturamento')
  assert.deepEqual(await one('select total,subtotal,frete_na_conta,total_geral from v_pedidos where id=$1', [p.id]), antes)
})
