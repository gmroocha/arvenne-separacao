import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, recusa, pedidoWhats, carrinho, cart, cobrir, importar, payload, payloadV2, num, preco, resumo } from './fixtures.mjs'

const TUDO = 99999999.99
const status = async id => (await one('select status, etapa_antes_desvio from pedidos where id = $1', [id]))
const sair = async id => { await db.exec('set local role authenticated'); const r = (await one('select sair_do_desvio($1) as s', [id])).s; await db.exec('reset role'); return r }

// ---------------------------------------------------------------------------
// V37: etapa de origem do desvio
// ---------------------------------------------------------------------------
test('V37: falta na Conferência leva ao desvio guardando a origem; sair volta à Conferência', async () => {
  const p = await pedidoWhats('conferencia')
  const a = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  assert.deepEqual(await status(p.id), { status: 'avisar_cliente', etapa_antes_desvio: 'conferencia' })
  assert.equal((await one('select etapa_antes_desvio from v_pedidos where id = $1', [p.id])).etapa_antes_desvio, 'conferencia')
  // "Cliente avisada": a origem se mantém.
  await db.query("update pedidos set status = 'aguardando_cliente' where id = $1", [p.id])
  assert.deepEqual(await status(p.id), { status: 'aguardando_cliente', etapa_antes_desvio: 'conferencia' })
  // Ainda em falta: não volta.
  assert.equal(await sair(p.id), 'separacao')
  assert.deepEqual(await status(p.id), { status: 'separacao', etapa_antes_desvio: null })
})

test('V37: resolvida a falta, o pedido volta à etapa de origem; peça pendente manda para a Separação', async () => {
  const p = await pedidoWhats('etiquetagem')
  const a = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  assert.deepEqual(await status(p.id), { status: 'avisar_cliente', etapa_antes_desvio: 'etiquetagem' })
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [a.id])
  assert.equal(await sair(p.id), 'etiquetagem')
  assert.deepEqual(await status(p.id), { status: 'etiquetagem', etapa_antes_desvio: null })
  // Com peça pendente a etapa de origem não vale: Separação.
  const q = await pedidoWhats('conferencia')
  const b = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [q.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [b.id])
  await db.query("update pedido_itens set status = 'pendente' where id = $1", [b.id])
  assert.equal((await status(q.id)).etapa_antes_desvio, 'conferencia')
  assert.equal(await sair(q.id), 'separacao')
  assert.deepEqual(await status(q.id), { status: 'separacao', etapa_antes_desvio: null })
})

test('V37: falta na Separação continua voltando para a Separação', async () => {
  const p = await pedidoWhats('separacao')
  const a = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  await db.query("update pedidos set status = 'avisar_cliente' where id = $1", [p.id])
  assert.deepEqual(await status(p.id), { status: 'avisar_cliente', etapa_antes_desvio: 'separacao' })
  await db.query("update pedido_itens set status = 'removido' where id = $1", [a.id])
  assert.equal(await sair(p.id), 'separacao')
})

test('V37: mover manualmente do desvio vai exatamente para onde a pessoa escolheu', async () => {
  const p = await pedidoWhats('etiquetagem')
  const a = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  assert.equal((await status(p.id)).etapa_antes_desvio, 'etiquetagem')
  await db.query("update pedido_itens set status = 'removido' where id = $1", [a.id])
  await db.query("update pedidos set status = 'conferencia' where id = $1", [p.id])
  assert.deepEqual(await status(p.id), { status: 'conferencia', etapa_antes_desvio: null })
})

test('V37: sair do desvio só vale em desvio e a função é só da equipe', async () => {
  const p = await pedidoWhats('conferencia')
  assert.equal(await sair(p.id), 'conferencia')
  await db.exec('set local role anon')
  await recusa(() => one('select sair_do_desvio($1)', [p.id]), /permission denied/)
  await db.exec('reset role')
  await recusa(() => one('select sair_do_desvio($1)', ['00000000-0000-0000-0000-000000000000']), /não encontrado/)
})

test('V37: troca só com crédito devolve o pedido à Conferência; troca com peça nova vai à Separação', async () => {
  const f = await fixture({ quantidade: 2 })
  // A 2ª peça já estava conferida; a falta da 1ª veio da Conferência.
  await db.query("update pedido_itens set status = 'encontrado', conferido_em = now() where id = $1", [f.itens[1].id])
  await db.query("update pedidos set etapa_antes_desvio = 'conferencia' where id = $1", [f.pedido.id])
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito'])
  assert.deepEqual(await status(f.pedido.id), { status: 'conferencia', etapa_antes_desvio: null })

  const g = await fixture({ quantidade: 2 })
  await db.query("update pedido_itens set status = 'encontrado', conferido_em = now() where id = $1", [g.itens[1].id])
  await db.query("update pedidos set etapa_antes_desvio = 'conferencia' where id = $1", [g.pedido.id])
  await one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id])
  assert.deepEqual(await status(g.pedido.id), { status: 'separacao', etapa_antes_desvio: null })
  // Desvio antigo, sem origem gravada: Separação, como antes.
  const h = await fixture()
  await one('select troca_aprovar($1, $2, $3, null)', [h.troca.id, h.pecas[0].id, 'credito'])
  assert.equal((await status(h.pedido.id)).status, 'separacao')
})

// ---------------------------------------------------------------------------
// V38: cobertura da loja nos valores
// ---------------------------------------------------------------------------
test('V38: valores e carrinho trazem o previsto da cobertura (parcial e tudo)', async () => {
  const f = await fixture({ desconto: 20 })
  // Pago 80, opção de 2 x 60 = 120: diferença de 40.
  await db.query("update troca_opcoes set preco = 100 where id = $1", [f.opcoes[0].id]) // 2 x 80 = 160 -> 80
  await cobrir(f, 30)
  const v = await one("select diferenca, coberto_previsto, cliente_paga_previsto from v_troca_valores where troca_peca_id = $1 and tipo = 'opcao'", [f.pecas[0].id])
  assert.deepEqual([num(v.diferenca), num(v.coberto_previsto), num(v.cliente_paga_previsto)], [80, 30, 50])
  const c = await one("select valor_unit from v_troca_valores where troca_peca_id = $1 and tipo = 'opcao'", [f.pecas[0].id])
  await carrinho(f, 0, f.opcoes[0].id, 2)
  const k = await cart(f)
  assert.deepEqual([num(k.diferenca), num(k.coberto_previsto), num(k.cliente_paga_previsto)], [80, 30, 50])
  assert.ok(Number(c.valor_unit) > 0)
  const cred = await one("select coberto_previsto, cliente_paga_previsto from v_troca_valores where troca_peca_id = $1 and tipo = 'credito'", [f.pecas[0].id])
  assert.deepEqual([num(cred.coberto_previsto), num(cred.cliente_paga_previsto)], [0, 0])
  // Cobrir tudo: a loja absorve a diferença inteira.
  await cobrir(f, TUDO)
  const t = await cart(f)
  assert.deepEqual([num(t.coberto_previsto), num(t.cliente_paga_previsto)], [80, 0])
  // Crédito nunca é coberto.
  await db.query("update troca_opcoes set preco = 10 where id = $1", [f.opcoes[0].id])
  const m = await cart(f)
  assert.ok(num(m.diferenca) < 0)
  assert.deepEqual([num(m.coberto_previsto), num(m.cliente_paga_previsto)], [0, 0])
})

test('V38: cobrir tudo cobre a diferença inteira e o total do pedido não muda', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 100)
  await cobrir(f, TUDO)
  const antes = await one('select total, troca_coberto from v_pedidos where id = $1', [f.pedido.id])
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  const r = await resumo(f)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total)], [80, 80, 0])
  const depois = await one('select total, troca_coberto from v_pedidos where id = $1', [f.pedido.id])
  assert.equal(num(depois.troca_coberto), 80)
  assert.equal(num(depois.total), num(antes.total))
  const alt = await one("select * from v_pedido_alteracoes where pedido_id = $1", [f.pedido.id])
  assert.deepEqual([num(alt.diferenca), num(alt.coberto_loja), num(alt.cliente_paga), num(alt.credito)], [80, 80, 0, 0])
})

// ---------------------------------------------------------------------------
// Alterações do pedido
// ---------------------------------------------------------------------------
test('alterações: troca com cobertura parcial, crédito, peça removida e quantidade reduzida', async () => {
  const f = await fixture({ quantidade: 3, desconto: 30 }) // 3 peças de 2 x 50; pago 270
  await preco(f, 0, 100)
  await cobrir(f, 20)
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  const t = await one("select * from v_pedido_alteracoes where pedido_id = $1 and tipo = 'troca'", [f.pedido.id])
  assert.equal(t.sai.sku, 'ORIGINAL-0')
  assert.equal(t.sai.qtd, 2)
  assert.equal(t.entra.length, 1)
  assert.equal(t.entra[0].sku, 'NOVO')
  assert.equal(t.entra[0].qtd, 2)
  assert.equal(t.escolhida_por, 'equipe')
  assert.ok(num(t.diferenca) > 20)
  assert.deepEqual([num(t.coberto_loja), num(t.cliente_paga)], [20, num(t.diferenca) - 20])
  assert.equal(num(t.credito), 0)
  assert.equal(num(t.a_devolver), 0)
  // Crédito de outra peça.
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[1].id, 'credito'])
  const c = await one("select * from v_pedido_alteracoes where pedido_id = $1 and tipo = 'credito'", [f.pedido.id])
  assert.equal(c.sai.sku, 'ORIGINAL-1')
  assert.deepEqual(c.entra, [])
  assert.ok(num(c.credito) > 0)
  assert.equal(num(c.cliente_paga), 0)
  // Peça que a cliente tirou depois de pagar: valor, a devolver e devolvido.
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [f.itens[2].id])
  const r = await one("select * from v_pedido_alteracoes where pedido_id = $1 and tipo = 'removida'", [f.pedido.id])
  assert.equal(r.sai.sku, 'ORIGINAL-2')
  assert.ok(num(r.valor) > 0)
  assert.equal(num(r.a_devolver), num(r.valor))
  assert.equal(r.devolvido_em, null)
  await db.exec('set local role authenticated')
  await one('select marcar_devolvido($1)', [f.pedido.id])
  await db.exec('reset role')
  const r2 = await one("select * from v_pedido_alteracoes where pedido_id = $1 and tipo = 'removida'", [f.pedido.id])
  assert.equal(num(r2.a_devolver), 0)
  assert.notEqual(r2.devolvido_em, null)
  assert.equal((await db.query("select 1 from v_pedido_alteracoes where pedido_id = $1", [f.pedido.id])).rows.length, 3)
})

test('alterações: quantidade reduzida depois do pagamento vira linha própria; antes do pagamento não', async () => {
  // Venda ainda aberta (sem pagamento): mexer na quantidade não é alteração.
  const v = await one("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'Cliente') returning *")
  const iv = await one("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Anel', 'A1', 4, 50, 0) returning *", [v.id])
  await db.query('update pedido_itens set qtd = 3 where id = $1', [iv.id])
  assert.equal((await db.query('select 1 from v_pedido_alteracoes where pedido_id = $1', [v.id])).rows.length, 0)
  await db.query("update pedidos set status = 'novo', pago_em = now() + interval '1 hour' where id = $1", [v.id])
  assert.equal((await db.query('select 1 from v_pedido_alteracoes where pedido_id = $1', [v.id])).rows.length, 0)
  const p = await one("insert into pedidos (origem, status, cliente_nome, pago_em) values ('whatsapp', 'novo', 'Cliente', now() - interval '1 second') returning *")
  const i = await one("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Anel', 'A1', 4, 50, 0) returning *", [p.id])
  await db.query('update pedido_itens set qtd = 1 where id = $1', [i.id])
  const q = await one("select * from v_pedido_alteracoes where pedido_id = $1", [p.id])
  assert.equal(q.tipo, 'quantidade')
  assert.equal(q.sai.qtd, 3)
  assert.equal(num(q.valor), 150)
  assert.equal(num(q.a_devolver), 150)
})

test('alterações: só a equipe lê; anon não', async () => {
  const f = await fixture()
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito'])
  assert.equal((await db.query('select 1 from v_pedido_alteracoes where pedido_id = $1', [f.pedido.id])).rows.length, 1)
  await db.exec('set local role anon')
  await recusa(() => one('select * from v_pedido_alteracoes'), /permission denied/)
  await db.exec('reset role')
})

// ---------------------------------------------------------------------------
// v_pedidos: desconto sem a cobertura, percentual e invariante do total
// ---------------------------------------------------------------------------
const fecha = r => num(Number(r.subtotal) - Number(r.desconto_sem_cobertura) - Number(r.troca_coberto) - Number(r.desconto_pix) + Number(r.frete_na_conta))

test('v_pedidos: subtotal - desconto sem cobertura - cobertura - Pix + frete = total (WhatsApp e Shopify)', async () => {
  for (const opcoes of [{ desconto: 20 }, { desconto: 20, pix: true }, { desconto: 25, tipoDesconto: 'percentual' }]) {
    const f = await fixture(opcoes)
    await preco(f, 0, 100)
    let r = await one('select * from v_pedidos where id = $1', [f.pedido.id])
    assert.equal(fecha(r), num(r.total), `antes ${JSON.stringify(opcoes)}`)
    await cobrir(f, 15)
    await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
    r = await one('select * from v_pedidos where id = $1', [f.pedido.id])
    assert.equal(num(r.troca_coberto), 15, JSON.stringify(opcoes))
    assert.equal(num(r.desconto_sem_cobertura), num(Number(r.desconto) - 15), JSON.stringify(opcoes))
    assert.equal(fecha(r), num(r.total), `depois ${JSON.stringify(opcoes)}`)
  }
})

test('v_pedidos: o mesmo fecha num pedido da Shopify, com e sem cobertura de troca', async () => {
  await importar(payloadV2({ shopify_order_id: '888101', numero: 'ARV-V9' }))
  const p = await one('select * from pedidos where shopify_order_id = 888101')
  const itens = (await db.query('select * from pedido_itens where pedido_id = $1 order by ordem', [p.id])).rows
  let r = await one('select * from v_pedidos where id = $1', [p.id])
  assert.equal(fecha(r), num(r.total))
  assert.equal(num(r.desconto_sem_cobertura), 30)
  assert.equal(Number(r.desconto_percentual), 20)
  await db.query("update pedido_itens set status = 'falta' where id = $1", [itens[0].id])
  await db.exec('set local role authenticated')
  const t = await one('insert into trocas (pedido_id) values ($1) returning *', [p.id])
  const tp = await one('insert into troca_pecas (troca_id, item_id) values ($1, $2) returning *', [t.id, itens[0].id])
  const o = await one("insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco) values ($1, 'site', 'Brinco novo', 'NOVO', 150) returning *", [tp.id])
  await db.query("update trocas set status = 'enviada', enviada_em = now(), cobrir_ate = 15 where id = $1", [t.id])
  await one('select troca_aprovar($1, $2, $3, $4)', [t.id, tp.id, 'opcao', o.id])
  r = await one('select * from v_pedidos where id = $1', [p.id])
  assert.equal(num(r.troca_coberto), 15)
  assert.equal(fecha(r), num(r.total))
  assert.equal(num(r.desconto_sem_cobertura), 40) // a peça nova leva o mesmo desconto de 20%; a cobertura (15) fica à parte
})

test('v_pedidos: percentual do desconto sobre o subtotal, sem a cobertura da loja', async () => {
  const f = await fixture({ desconto: 25, tipoDesconto: 'percentual' })
  const r = await one('select * from v_pedidos where id = $1', [f.pedido.id])
  assert.equal(num(r.desconto_sem_cobertura), 25)
  assert.equal(Number(r.desconto_percentual), 25)
  await preco(f, 0, 100)
  await cobrir(f, TUDO)
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  const d = await one('select * from v_pedidos where id = $1', [f.pedido.id])
  assert.equal(Number(d.desconto_percentual), 25) // a cobertura não vira "desconto"
  assert.ok(num(d.troca_coberto) > 0)
  const z = await pedidoWhats('novo')
  assert.equal(Number((await one('select desconto_percentual from v_pedidos where id = $1', [z.id])).desconto_percentual), 0)
})

// ---------------------------------------------------------------------------
// Descontos da Shopify
// ---------------------------------------------------------------------------
const aplicacoes = [
  { __typename: 'DiscountCodeApplication', code: 'BEMVINDA10', allocationMethod: 'ACROSS', targetType: 'LINE_ITEM', value: { percentage: 10 } },
  { __typename: 'AutomaticDiscountApplication', title: '25% OFF no Pix', allocationMethod: 'ACROSS', targetType: 'LINE_ITEM', value: { percentage: 25.0 } },
  { __typename: 'ManualDiscountApplication', title: 'Cortesia', description: 'x', allocationMethod: 'EACH', targetType: 'LINE_ITEM', value: { amount: '5.00', currencyCode: 'BRL' } },
  { __typename: 'ScriptDiscountApplication', title: 'Frete grátis', allocationMethod: 'ACROSS', targetType: 'SHIPPING_LINE', value: { amount: '12.50' } },
]
const esperado = [
  { tipo: 'code', rotulo: 'BEMVINDA10', codigo: 'BEMVINDA10', titulo: null, percentual: 10, valor: null, alocacao: 'across', alvo: 'line_item' },
  { tipo: 'automatic', rotulo: '25% OFF no Pix', codigo: null, titulo: '25% OFF no Pix', percentual: 25, valor: null, alocacao: 'across', alvo: 'line_item' },
  { tipo: 'manual', rotulo: 'Cortesia', codigo: null, titulo: 'Cortesia', percentual: null, valor: 5, alocacao: 'each', alvo: 'line_item' },
  { tipo: 'script', rotulo: 'Frete grátis', codigo: null, titulo: 'Frete grátis', percentual: null, valor: 12.5, alocacao: 'across', alvo: 'shipping_line' },
]

test('descontos da Shopify: normaliza cupom, automático, manual e script (percentual ou valor)', async () => {
  await importar(payload({ shopify_order_id: '777101', numero: 'ARV-D1', shopify_bruto: { discountApplications: { nodes: aplicacoes } } }))
  const p = await one("select id, descontos from pedidos where shopify_order_id = 777101")
  assert.deepEqual(p.descontos, esperado)
  assert.deepEqual((await one('select descontos from v_pedidos where id = $1', [p.id])).descontos, esperado)
  // Lista simples (sem "nodes") também vale.
  await importar(payload({ shopify_order_id: '777102', numero: 'ARV-D2', shopify_bruto: { discountApplications: aplicacoes.slice(0, 1) } }))
  assert.deepEqual((await one("select descontos from pedidos where shopify_order_id = 777102")).descontos, esperado.slice(0, 1))
})

test('descontos da Shopify: sem a chave fica nulo e mantém o valor antigo; lista vazia é "sem desconto"', async () => {
  await importar(payload({ shopify_order_id: '777103', numero: 'ARV-D3', shopify_bruto: { name: 'ARV-D3' } }))
  assert.equal((await one("select descontos from pedidos where shopify_order_id = 777103")).descontos, null)
  await importar(payload({ shopify_order_id: '777103', numero: 'ARV-D3', shopify_bruto: { name: 'ARV-D3', discountApplications: { nodes: [] } } }))
  assert.deepEqual((await one("select descontos from pedidos where shopify_order_id = 777103")).descontos, [])
  await importar(payload({ shopify_order_id: '777103', numero: 'ARV-D3', shopify_bruto: { name: 'ARV-D3', discountApplications: { nodes: aplicacoes.slice(0, 2) } } }))
  assert.equal((await one("select jsonb_array_length(descontos) n from pedidos where shopify_order_id = 777103")).n, 2)
  // Uma sincronização em que a consulta de descontos falhou não apaga o que já se sabia.
  await importar(payload({ shopify_order_id: '777103', numero: 'ARV-D3', shopify_bruto: { name: 'ARV-D3', atualizado: true } }))
  assert.equal((await one("select jsonb_array_length(descontos) n from pedidos where shopify_order_id = 777103")).n, 2)
})

// ---------------------------------------------------------------------------
// V39: painel da troca numa viagem
// ---------------------------------------------------------------------------
test('V39: troca_painel devolve num só jsonb o mesmo que a tela montava em várias leituras', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20 })
  await preco(f, 0, 100)
  await cobrir(f, 30)
  await carrinho(f, 0, f.opcoes[0].id, 2)
  const painel = (await one('select troca_painel($1) as t', [f.pedido.id])).t
  assert.equal(painel.id, f.troca.id)
  assert.equal(painel.token, f.troca.token)
  assert.equal(painel.pecas.length, 2)
  assert.deepEqual(painel.resumo, (await one('select to_jsonb(r) as d from v_troca_resumo r where troca_id = $1', [f.troca.id])).d)
  assert.deepEqual(painel.pecas.map(p => p.id).sort(), f.pecas.map(p => p.id).sort())
  for (const peca of painel.pecas) {
    const id = peca.id
    assert.deepEqual(peca.opcoes.map(o => o.id), (await db.query('select id from troca_opcoes where troca_peca_id = $1 order by ordem', [id])).rows.map(r => r.id))
    assert.deepEqual(peca.escolhas, (await db.query('select to_jsonb(e) as d from troca_escolhas e where troca_peca_id = $1 order by seq', [id])).rows.map(r => r.d))
    const valores = (await db.query('select to_jsonb(v) as d from v_troca_valores v where troca_peca_id = $1', [id])).rows.map(r => r.d)
    assert.equal(peca.valores.length, valores.length)
    for (const v of valores) assert.deepEqual(peca.valores.find(x => x.opcao_id === v.opcao_id && x.tipo === v.tipo), v)
  }
  const com = painel.pecas.find(p => p.id === f.pecas[0].id)
  assert.deepEqual(com.carrinho, (await one('select to_jsonb(c) as d from v_troca_carrinho c where troca_peca_id = $1', [f.pecas[0].id])).d)
  assert.equal(painel.pecas.find(p => p.id === f.pecas[1].id).carrinho, null)
  assert.equal(num(com.carrinho.coberto_previsto), 30)
  // Sem troca ativa (ou concluída) devolve null.
  const g = await pedidoWhats('novo')
  assert.equal((await one('select troca_painel($1) as t', [g.id])).t, null)
  await db.query("update trocas set status = 'cancelada' where id = $1", [f.troca.id])
  assert.equal((await one('select troca_painel($1) as t', [f.pedido.id])).t, null)
})

test('V39: troca_painel traz a cobertura confirmada de cada peça resolvida; anon não executa', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 100)
  await cobrir(f, 30)
  await db.query("update trocas set status = 'rascunho', enviada_em = null where id = $1", [f.troca.id])
  // Troca ainda aberta com a única peça resolvida: concluir fecha a troca, então confere na leitura direta.
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  assert.equal((await one('select troca_painel($1) as t', [f.pedido.id])).t, null) // concluída: o painel só traz troca ativa
  const alt = await one('select * from v_pedido_alteracoes where pedido_id = $1', [f.pedido.id])
  assert.deepEqual([num(alt.coberto_loja), num(alt.cliente_paga)], [30, 50])
  const g = await fixture({ quantidade: 2, desconto: 20 })
  await preco(g, 0, 100)
  await cobrir(g, 30)
  await one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id])
  const painel = (await one('select troca_painel($1) as t', [g.pedido.id])).t
  const feita = painel.pecas.find(p => p.id === g.pecas[0].id)
  assert.deepEqual([num(feita.coberto), num(feita.cliente_paga)], [30, 60])
  assert.equal(painel.pecas.find(p => p.id === g.pecas[1].id).coberto, null)
  await db.exec('set local role anon')
  await recusa(() => one('select troca_painel($1)', [g.pedido.id]), /permission denied/)
  await db.exec('reset role')
})

test('sugerir_troca traz o previsto da cobertura da loja', async () => {
  const f = await fixture({ desconto: 20 })
  await db.exec(`reset role;
    insert into catalogo_site (variant_id, produto_id, produto, variante, preco, status) values (90, 5, 'Brinco', '8', 50, 'ACTIVE'), (91, 5, 'Brinco', '10', 100, 'ACTIVE');
    set local role authenticated;`)
  await db.query('update pedido_itens set shopify_variant_id = 90 where id = $1', [f.itens[0].id])
  await cobrir(f, 30)
  const s = await one("select diferenca, coberto_previsto, cliente_paga_previsto from sugerir_troca($1, 'variantes', null, 0.2, null, true)", [f.itens[0].id])
  assert.deepEqual([num(s.diferenca), num(s.coberto_previsto), num(s.cliente_paga_previsto)], [80, 30, 50])
})
