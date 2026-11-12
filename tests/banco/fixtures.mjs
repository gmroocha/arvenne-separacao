import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { db, one } from './suporte.mjs'

export async function fixture({ quantidade = 1, desconto = 20, pix = false, origem = 'site', tipoDesconto = 'valor', shopify = false } = {}) {
  const pedido = shopify
    // Pedido da Shopify: 2 x 50 = 100 de peças, a Shopify cobrou 80 (desconto de 20 já aplicado).
    ? await one(`insert into pedidos (origem, status, cliente_nome, valor_total, shopify_order_id)
        values ('shopify', 'aguardando_cliente', 'Cliente Teste', $1, 9001) returning *`, [80 * quantidade])
    : await one(`insert into pedidos (origem, status, cliente_nome, desconto_tipo, desconto_valor, forma_pagamento)
        values ('whatsapp', 'aguardando_cliente', 'Cliente Teste', $1, $2, $3) returning *`, [tipoDesconto, desconto, pix ? 'Pix' : 'Cartão'])
  const itens = []
  for (let n = 0; n < quantidade; n++) {
    itens.push(await one(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status, ordem)
      values ($1, 'shopify', 'Anel original', $2, 2, 50, 'falta', $3) returning *`, [pedido.id, `ORIGINAL-${n}`, n]))
  }
  await db.exec('set local role authenticated')
  const troca = await one('insert into trocas (pedido_id) values ($1) returning *', [pedido.id])
  const pecas = []
  const opcoes = []
  for (const item of itens) {
    const p = await one('insert into troca_pecas (troca_id, item_id) values ($1, $2) returning *', [troca.id, item.id])
    const o = await one(`insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco)
      values ($1, $2, 'Anel novo', 'NOVO', 75) returning *`, [p.id, origem])
    pecas.push(p); opcoes.push(o)
  }
  await db.query("update trocas set status = 'enviada', enviada_em = now() where id = $1", [troca.id])
  return { pedido, itens, troca, pecas, opcoes }
}

export async function escolher(f, n = 0, tipo = 'opcao', opcao = f.opcoes[n].id) {
  await db.exec('set local role anon')
  await one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[n].id, tipo, tipo === 'opcao' ? opcao : null])
  await db.exec('set local role authenticated')
}

export const concluir = (f, n = 0, tipo = 'opcao', escolha = tipo, opcao = escolha === 'opcao' ? f.opcoes[n].id : null) =>
  one('select troca_concluir_peca($1, $2, $3, $4, $5)', [f.troca.id, f.pecas[n].id, tipo, opcao, escolha])

export const publica = async f => (await one('select troca_publica($1) as dados', [f.troca.token])).dados

export async function recusa(fn, mensagem) {
  await db.exec('savepoint erro_esperado')
  await assert.rejects(fn, mensagem)
  await db.exec('rollback to savepoint erro_esperado')
}

export async function totalFecha(f, concluirTudo) {
  const antes = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  const anunciado = (await publica(f)).resumo.diferenca
  await concluirTudo()
  const depois = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  assert.equal(Number((depois - antes).toFixed(2)), Number(anunciado))
  return { antes, depois, anunciado }
}

export const payload = (extra = {}, qtd = 2) => ({
  shopify_order_id: '777001', numero: 'ARV-T1', cliente_nome: 'Cliente', valor_total: '100',
  valor_pago: '100', pedido_em: '2026-11-09T10:00:00Z', pago_em: '2026-11-09T10:00:00Z',
  entrega_cep: '01001000', entrega_logradouro: 'Rua A', frete_cobrado: '0', desconto_codigos: [],
  itens: [{ shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd, preco: '50' }], ...extra,
})

export const importar = async p => (await one('select importar_pedido_shopify($1::jsonb) as novo', [JSON.stringify(p)])).novo

// Prepara um estado operacional válido. Testes não pulam trabalho para chegar a uma etapa.
export async function prepararEtapa(pedidoId, status) {
  const niveis=['novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado']
  const n=niveis.indexOf(status)
  if (n>=2) await db.query("update pedido_itens set status='encontrado' where pedido_id=$1 and status<>'removido'",[pedidoId])
  if (n>=3) await db.query("update pedido_itens set conferido_em=now() where pedido_id=$1 and status<>'removido'",[pedidoId])
  if (n>=4) await db.query("update pedido_itens set etiquetado_em=now() where pedido_id=$1 and status<>'removido'",[pedidoId])
  if (n>=5) await db.query("update pedido_itens set qtd_bipada=qtd,bipado_em=now() where pedido_id=$1 and status<>'removido'",[pedidoId])
  if (n>=6) await db.query('update pedidos set nf_emitida_em=now(),frete_gerado_em=now(),pedido_fornecedor_em=now() where id=$1',[pedidoId])
  if (n>=7) await db.query('update pedidos set embalado_em=now() where id=$1',[pedidoId])
  if (n>=8) await db.query('update pedidos set postado_em=now() where id=$1',[pedidoId])
  await db.query('update pedidos set status=$2 where id=$1',[pedidoId,status])
}

export async function pedidoWhats(status = 'novo') {
  const p = await one("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'Cliente') returning *")
  await db.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Anel', 'A1', 1, 50, 0)", [p.id])
  await db.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Colar', 'C1', 1, 30, 1)", [p.id])
  if (status !== 'em_aberto') await prepararEtapa(p.id,status)
  return p
}

export const SQL_MIGRACAO = readFileSync('supabase/migrations/20261113130000_troca_v2.sql', 'utf8')

export const BACKFILL = SQL_MIGRACAO.slice(
  SQL_MIGRACAO.indexOf('create temporary table _shopify_calc'),
  SQL_MIGRACAO.indexOf('drop table _shopify_calc;') + 'drop table _shopify_calc;'.length)

export const dinheiro = n => ({ shopMoney: { amount: String(n) } })

export const brutoShopify = () => JSON.stringify({
  subtotalPriceSet: dinheiro('112.50'), totalPriceSet: dinheiro('112.50'),
  lineItems: { nodes: [
    { currentQuantity: 1, originalUnitPriceSet: dinheiro('100.00') },
    { currentQuantity: 1, originalUnitPriceSet: dinheiro('50.00') }] },
})

export async function pedidoShopifyAntigo(ordem = 9100) {
  const pedido = await one(`insert into pedidos (origem, status, cliente_nome, valor_total, shopify_order_id,
      desconto_tipo, desconto_valor, frete_cobrado, frete_pago_por, shopify_bruto)
    values ('shopify', 'aguardando_cliente', 'Cliente Teste', 112.5, $1, 'valor', 73.57, 36.07, 'cliente', $2)
    returning id`, [ordem, brutoShopify()])
  const a = await one(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, nome, sku, qtd, preco, status, ordem)
    values ($1, 'shopify', 11, 'Brinco', 'BRI-1', 1, 100, 'falta', 1) returning id`, [pedido.id])
  const b = await one(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, nome, sku, qtd, preco, status, ordem)
    values ($1, 'shopify', 12, 'Anel', 'ANEL-1', 1, 50, 'pendente', 2) returning id`, [pedido.id])
  return { pedido, a, b }
}

export const zero = '00000000-0000-0000-0000-000000000000'

export const payloadV2 = (extra = {}) => ({
  shopify_order_id: '888001', numero: 'ARV-V1', cliente_nome: 'Cliente', valor_total: '140', valor_pago: '140',
  pedido_em: '2020-01-01T10:00:00Z', pago_em: '2020-01-01T10:00:00Z', entrega_cep: '01001000',
  frete_original: '20', frete_cobrado: '20', frete_titulo: 'PAC', desconto_valor: '30', desconto_codigos: [],
  itens: [
    { shopify_line_id: 'L1', shopify_variant_id: '11', sku: 'BRI-1', nome: 'Brinco', qtd: 1, preco: '100', preco_pago: '80' },
    { shopify_line_id: 'L2', shopify_variant_id: '12', sku: 'ANEL-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '40' }],
  ...extra,
})

export const pedidoDe = id => one('select * from pedidos where shopify_order_id = $1', [id])

export const eventos = async (pedidoId, tipo) =>
  (await one('select count(*)::int n from pedido_eventos where pedido_id = $1 and tipo = $2', [pedidoId, tipo])).n

export const num = v => Number(Number(v).toFixed(2))

export const preco = (f, n, p) => db.query('update troca_opcoes set preco = $1 where id = $2', [p, f.opcoes[n].id])

export const cobrir = (f, x) => db.query('update trocas set cobrir_ate = $1 where id = $2', [x, f.troca.id])

export const resumo = f => one('select * from v_troca_resumo where troca_id = $1', [f.troca.id])

export async function itemQtd4() {
  const p = await one("insert into pedidos (origem, status, cliente_nome) values ('shopify', 'separacao', 'Cliente') returning *")
  const i = await one(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, sku, nome, variante, foto_url, qtd, preco, preco_pago,
      shopify_line_id, ordem, status, conferido_em, etiquetado_em, etiqueta_previa, qtd_bipada, bipado_em)
    values ($1, 'shopify', 55, 'AN-4', 'Anel', '18', 'http://foto', 4, 50, 40, 'L1', 3, 'encontrado', now(), now(), true, 4, now()) returning *`, [p.id])
  await db.exec('set local role authenticated')
  return { p, i }
}

export const opcaoB = async (f, n = 0, p = 25, sku = 'NOVO-B') =>
  one(`insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco, ordem) values ($1, 'clube', 'Brinco', $2, $3, 1) returning *`, [f.pecas[n].id, sku, p])

export const carrinho = async (f, n, opcao, qtd) => {
  await db.exec('set local role anon')
  const r = (await one('select troca_carrinho($1, $2, $3, $4) as ok', [f.troca.token, f.itens[n].id, opcao, qtd])).ok
  await db.exec('set local role authenticated') // em erro, o rollback do savepoint de recusa() restaura o papel
  return r
}

export const cart = (f, n = 0) => one('select * from v_troca_carrinho where troca_peca_id = $1', [f.pecas[n].id])

export async function somaFixture({ principal = {}, venda = {} } = {}) {
  const p = await one(`insert into pedidos (origem, status, cliente_nome, desconto_tipo, desconto_valor, forma_pagamento, valor_pago, pago_em, numero)
    values ($1, $2, 'Nathália', 'valor', 10, 'Cartão', 90, now(), 'ARV-1') returning *`, [principal.origem ?? 'whatsapp', principal.status==='perdida' ? 'em_aberto' : ['conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado','cancelado'].includes(principal.status) ? 'novo' : principal.status ?? 'separacao'])
  await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem, status)
    values ($1, 'clube', 'Anel', 'AN', 2, 50, 1, 'encontrado')`, [p.id])
  if (principal.status && principal.status !== p.status) await prepararEtapa(p.id,principal.status)
  const w = await one(`insert into pedidos (origem, status, cliente_nome, desconto_tipo, desconto_valor, somar_em)
    values ('whatsapp', $1, 'Nathália', 'valor', 5, $2) returning *`, [venda.status ?? 'em_aberto', venda.somar ? null : p.id])
  const i1 = await one(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem)
    values ($1, 'clube', 'Brinco', 'BR', 1, 30, 1) returning *`, [w.id])
  const i2 = await one(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem)
    values ($1, 'clube', 'Colar', 'CO', 1, 20, 2) returning *`, [w.id])
  await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem, status, observacao)
    values ($1, 'clube', 'Pulseira', 'PU', 1, 99, 3, 'removido', 'removida na venda')`, [w.id])
  await db.exec('set local role authenticated')
  return { p, w, i1, i2 }
}
