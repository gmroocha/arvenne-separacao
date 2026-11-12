import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, escolher, concluir, publica, recusa, totalFecha, importar, pedidoWhats, payloadV2, pedidoDe, eventos, num, preco, cobrir, resumo, opcaoB, carrinho } from './fixtures.mjs'

test('total depois da troca: desconto fixo', async () => {
  const f = await fixture()
  await escolher(f)
  const r = await totalFecha(f, () => concluir(f))
  assert.deepEqual([r.antes, r.depois], [80, 120])
})

test('total depois da troca: desconto fixo + Pix, opção e crédito', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20, pix: true })
  await escolher(f, 0); await escolher(f, 1, 'credito')
  const r = await totalFecha(f, async () => { await concluir(f, 0); await concluir(f, 1, 'credito') })
  assert.deepEqual([r.antes, r.depois], [160, 120])
})

test('total depois da troca: desconto percentual', async () => {
  const f = await fixture({ desconto: 10, tipoDesconto: 'percentual' })
  await escolher(f)
  await totalFecha(f, () => concluir(f))
})

test('total depois da troca: crédito sem substituição', async () => {
  const f = await fixture()
  await escolher(f, 0, 'credito')
  const r = await totalFecha(f, () => concluir(f, 0, 'credito'))
  assert.equal(r.depois, 0)
})

test('total depois da troca: pedido da Shopify soma a diferença', async () => {
  const f = await fixture({ shopify: true, desconto: 0 })
  await escolher(f)
  const r = await totalFecha(f, () => concluir(f))
  // Sem desconto registrado na Shopify o fator é 1: a peça de 100 vira 150 (+50).
  assert.equal(r.antes, 80)
  assert.equal(r.depois, 130)
})

test('valores negativos são recusados', async () => {
  const f = await fixture()
  await recusa(() => db.query('update pedido_itens set preco = -10 where id = $1', [f.itens[0].id]), /nao_negativo/)
  for (const col of ['desconto_valor', 'frete_cobrado', 'frete_custo', 'valor_pago'])
    await recusa(() => db.query(`update pedidos set ${col} = -1 where id = $1`, [f.pedido.id]), /nao_negativo/)
  await recusa(() => db.query('update troca_opcoes set preco = -1 where id = $1', [f.opcoes[0].id]), /nao_negativo/)
})

test('acerto: pendente -> recebido, com evento e acerto_pendente na v_pedidos', async () => {
  const f = await fixture({ desconto: 20 })
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  const ac = await one('select * from v_pedido_acerto where pedido_id = $1', [f.pedido.id])
  assert.equal(ac.acerto_status, 'pendente')
  assert.deepEqual([Number(ac.saldo), Number(ac.total_a_cobrar), Number(ac.total_credito), Number(ac.valor_pago_pecas_trocadas)], [40, 40, 0, 80])
  assert.equal(Number(ac.novo_total) - Number(ac.valor_pago_original), 40)
  assert.equal(ac.pecas.length, 1)
  assert.equal(ac.pecas[0].antes.sku, 'ORIGINAL-0')
  assert.equal(ac.pecas[0].depois.sku, 'NOVO')
  assert.equal((await one('select acerto_pendente from v_pedidos where id = $1', [f.pedido.id])).acerto_pendente, true)
  await recusa(() => one('select troca_acerto($1, $2)', [f.troca.id, 'credito_registrado']), /Não há crédito/)
  await recusa(() => one('select troca_acerto($1, $2)', [f.troca.id, 'qualquer']), /inválido/)
  await one('select troca_acerto($1, $2)', [f.troca.id, 'recebido'])
  const depois = await one('select acerto_status, acerto_em, acerto_por from trocas where id = $1', [f.troca.id])
  assert.equal(depois.acerto_status, 'recebido')
  assert.notEqual(depois.acerto_em, null)
  assert.equal((await one('select acerto_pendente from v_pedidos where id = $1', [f.pedido.id])).acerto_pendente, false)
  assert.equal((await one("select count(*)::int n from pedido_eventos where pedido_id = $1 and tipo = 'troca_acerto' and para = 'recebido'", [f.pedido.id])).n, 1)
  // Desfazer volta para pendente.
  await one('select troca_acerto($1, $2)', [f.troca.id, 'pendente'])
  const desfeito = await one('select acerto_status, acerto_em from trocas where id = $1', [f.troca.id])
  assert.deepEqual(desfeito, { acerto_status: 'pendente', acerto_em: null })
})

test('acerto: crédito vira credito_registrado e troca sem diferença não tem acerto', async () => {
  const f = await fixture({ desconto: 20 })
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito'])
  await recusa(() => one('select troca_acerto($1, $2)', [f.troca.id, 'recebido']), /Não há diferença/)
  await one('select troca_acerto($1, $2)', [f.troca.id, 'credito_registrado'])
  const ac = await one('select acerto_status, saldo, total_credito from v_pedido_acerto where pedido_id = $1', [f.pedido.id])
  assert.deepEqual([ac.acerto_status, Number(ac.saldo), Number(ac.total_credito)], ['credito_registrado', -80, 80])
  // Opção do mesmo valor da peça paga: sem diferença.
  const g = await fixture({ desconto: 20 })
  await db.query('update troca_opcoes set preco = 50 where id = $1', [g.opcoes[0].id])
  await one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id])
  assert.equal((await one('select acerto_status from trocas where id = $1', [g.troca.id])).acerto_status, 'sem_diferenca')
  await recusa(() => one('select troca_acerto($1, $2)', [g.troca.id, 'recebido']), /não tem acerto/)
})

test('peça removida depois do pagamento: a devolver + acerto pendente; marcar_devolvido e desfazer', async () => {
  await importar(payloadV2())
  const p = await pedidoDe(888001)
  const b = await one("select id from pedido_itens where pedido_id = $1 and shopify_line_id = 'L2'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [b.id])
  const ver = () => one('select a_devolver, acerto_pendente, total, valor_removido, subtotal, desconto, frete_na_conta from v_pedidos where id = $1', [p.id])
  let v = await ver()
  assert.deepEqual([Number(v.a_devolver), v.acerto_pendente, Number(v.total), Number(v.valor_removido)], [40, true, 100, 40])
  assert.equal(Number(v.subtotal) - Number(v.desconto) + Number(v.frete_na_conta), 100)
  assert.notEqual((await one('select removido_em from pedido_itens where id = $1', [b.id])).removido_em, null)
  await db.exec('set local role authenticated')
  await one('select marcar_devolvido($1)', [p.id])
  await one('select marcar_devolvido($1)', [p.id]) // repetir não duplica o histórico
  v = await ver()
  assert.deepEqual([Number(v.a_devolver), v.acerto_pendente, Number(v.total)], [0, false, 100])
  assert.equal(await eventos(p.id, 'devolvido'), 1)
  await one('select marcar_devolvido($1, true)', [p.id])
  v = await ver()
  assert.deepEqual([Number(v.a_devolver), v.acerto_pendente], [40, true])
  assert.equal(await eventos(p.id, 'devolvido_desfeito'), 1)
  // Peça que volta (reiniciar não é possível aqui; volta pelo status) zera removido_em e devolvido_em.
  await one('select marcar_devolvido($1)', [p.id])
  await db.query("update pedido_itens set status = 'pendente' where id = $1", [b.id])
  const i = await one('select removido_em, devolvido_em from pedido_itens where id = $1', [b.id])
  assert.deepEqual(i, { removido_em: null, devolvido_em: null })
  assert.equal(Number((await ver()).a_devolver), 0)
})

test('peça removida no app e reembolsada na Shopify: não desconta duas vezes do total', async () => {
  await importar(payloadV2())
  const p = await pedidoDe(888001)
  const b = await one("select id from pedido_itens where pedido_id = $1 and shopify_line_id = 'L2'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [b.id])
  // Reembolso na Shopify: linha L2 volta com quantidade 0 e o total atual cai de 100 para 60.
  const itens = payloadV2().itens.map(i => i.shopify_line_id === 'L2' ? { ...i, qtd: 0 } : i)
  await importar(payloadV2({ valor_total: '100', valor_pago: '100', desconto_valor: '20', itens }))
  await importar(payloadV2({ valor_total: '100', valor_pago: '100', desconto_valor: '20', itens })) // repetir não muda
  const v = await one('select a_devolver, acerto_pendente, total, valor_removido, subtotal, desconto, frete_na_conta from v_pedidos where id = $1', [p.id])
  assert.deepEqual([Number(v.a_devolver), v.acerto_pendente, Number(v.total), Number(v.valor_removido)], [0, false, 100, 0])
  assert.equal(Number(v.subtotal) - Number(v.desconto) + Number(v.frete_na_conta), 100)
  // Desfazer "devolvido" não reabre a peça reembolsada na Shopify.
  await db.exec('set local role authenticated')
  await one('select marcar_devolvido($1, true)', [p.id])
  assert.equal(Number((await one('select a_devolver from v_pedidos where id = $1', [p.id])).a_devolver), 0)
})

test('venda do WhatsApp: peça removida depois de paga devolve o que passou do total', async () => {
  const p = await pedidoWhats('novo')
  await db.query("update pedidos set valor_pago = 80, pago_em = now() - interval '1 day' where id = $1", [p.id])
  const co = await one("select id from pedido_itens where pedido_id = $1 and sku = 'C1'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [co.id])
  const v = await one('select a_devolver, acerto_pendente, total from v_pedidos where id = $1', [p.id])
  assert.deepEqual([Number(v.a_devolver), v.acerto_pendente, Number(v.total)], [30, true, 50])
  await db.exec('set local role authenticated')
  await one('select marcar_devolvido($1)', [p.id])
  assert.equal(Number((await one('select a_devolver from v_pedidos where id = $1', [p.id])).a_devolver), 0)
})

test('Shopify depois da troca: subtotal - desconto + frete = total, e a contagem ignora a peça de troca', async () => {
  await importar(payloadV2())
  const p = await pedidoDe(888001)
  const a = await one("select id from pedido_itens where pedido_id = $1 and shopify_line_id = 'L1'", [p.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [a.id])
  await db.exec('set local role authenticated')
  const troca = await one('insert into trocas (pedido_id) values ($1) returning *', [p.id])
  assert.equal(Number(troca.fator_desconto).toFixed(4), '0.8000') // (80 + 40) / (100 + 50)
  const peca = await one('insert into troca_pecas (troca_id, item_id) values ($1, $2) returning *', [troca.id, a.id])
  const opcao = await one("insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco) values ($1, 'site', 'Brinco novo', 'NOVO', 150) returning *", [peca.id])
  await one('select troca_aprovar($1, $2, $3, $4)', [troca.id, peca.id, 'opcao', opcao.id])
  const ver = () => one('select subtotal, desconto, frete_na_conta, total, valor_removido from v_pedidos where id = $1', [p.id])
  let v = await ver()
  assert.deepEqual([Number(v.subtotal), Number(v.desconto), Number(v.frete_na_conta), Number(v.total)], [200, 40, 20, 180])
  assert.equal(Number(v.subtotal) - Number(v.desconto) + Number(v.frete_na_conta), Number(v.total))
  const ac = await one('select saldo, valor_pago_original, novo_total from v_pedido_acerto where pedido_id = $1', [p.id])
  assert.deepEqual([Number(ac.saldo), Number(ac.valor_pago_original), Number(ac.novo_total)], [40, 140, 180])
  // Sincronizar de novo não acusa "peças mudaram" por causa da peça de troca.
  await db.exec('reset role')
  await importar(payloadV2())
  assert.equal(await eventos(p.id, 'shopify_alterado'), 0)
  // Cliente desiste da peça B depois de pago: total, desconto e frete continuam fechando.
  const b = await one("select id from pedido_itens where pedido_id = $1 and shopify_line_id = 'L2'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'cliente desistiu' where id = $1", [b.id])
  v = await ver()
  assert.deepEqual([Number(v.subtotal), Number(v.desconto), Number(v.total), Number(v.valor_removido)], [150, 30, 140, 40])
  assert.equal(Number(v.subtotal) - Number(v.desconto) + Number(v.frete_na_conta), Number(v.total))
})

test('v_pedido_acerto: o saldo é o da mesma troca que aparece no troca_id', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20 })
  // Primeira troca concluída com diferença de pagar; a segunda, de crédito.
  await db.query("update trocas set status = 'rascunho' where id = $1", [f.troca.id])
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[1].id, 'credito'])
  const t2 = await one('insert into trocas (pedido_id) values ($1) returning *', [f.pedido.id])
  const novo = await one("select id from pedido_itens where pedido_id = $1 and status = 'pendente'", [f.pedido.id])
  await db.query("update pedido_itens set status = 'falta' where id = $1", [novo.id])
  const p2 = await one('insert into troca_pecas (troca_id, item_id) values ($1, $2) returning *', [t2.id, novo.id])
  await one('select troca_aprovar($1, $2, $3, null)', [t2.id, p2.id, 'credito'])
  const ac = await one('select * from v_pedido_acerto where pedido_id = $1', [f.pedido.id])
  const saldoDaTroca = Number((await one('select sum(resultado_diferenca) s from troca_pecas where troca_id = $1', [ac.troca_id])).s)
  assert.equal(Number(ac.saldo), saldoDaTroca)
  assert.equal(Number(ac.total_a_cobrar) - Number(ac.total_credito), saldoDaTroca)
})

test('cobertura parcial, total e crédito: resumo e troca_publica', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 60) // diferença cheia 16
  await cobrir(f, 10)
  await escolher(f)
  let r = await resumo(f)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total), num(r.cobrir_ate)], [16, 10, 6, 10])
  const pub = (await publica(f)).resumo
  assert.deepEqual([num(pub.diferenca), num(pub.diferenca_bruta), num(pub.coberto), num(pub.cobrir_ate)], [6, 16, 10, 10])
  // Por opção o valor continua cheio.
  assert.equal(num((await publica(f)).pecas[0].opcoes[0].diferenca), 16)
  // Cobertura maior que a diferença: líquido zero, coberto = diferença.
  await preco(f, 0, 50.4) // 0,64
  r = await resumo(f)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total)], [0.64, 0.64, 0])
  // Crédito nunca é afetado.
  const g = await fixture({ desconto: 20 })
  await cobrir(g, 10)
  await escolher(g, 0, 'credito')
  r = await resumo(g)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total)], [-80, 0, -80])
})

test('cobertura na troca com várias peças: soma a troca inteira (+13,50 e -5,40)', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20 })
  await preco(f, 0, 57.5) // +13,50
  await preco(f, 1, 47)   // -5,40
  await cobrir(f, 10)
  await escolher(f, 0)
  await escolher(f, 1)
  const r = await resumo(f)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total)], [8.1, 8.1, 0])
})

test('cobertura: total do pedido do WhatsApp com desconto em R$ e Pix = original + líquido, identidade do desconto', async () => {
  const f = await fixture({ desconto: 20, pix: true })
  await preco(f, 0, 70)
  await cobrir(f, 10)
  const antes = await one('select * from v_pedidos where id = $1', [f.pedido.id])
  await escolher(f)
  await concluir(f)
  const r = await resumo(f)
  assert.equal(num(r.coberto), 10)
  const v = await one('select * from v_pedidos where id = $1', [f.pedido.id])
  assert.equal(num(v.troca_coberto), 10)
  assert.equal(num(v.total), num(Number(antes.total) + Number(r.diferenca_total)))
  assert.equal(num(Number(v.subtotal) - Number(v.desconto) - Number(v.desconto_pix) + Number(v.frete_na_conta)), num(v.total))
  assert.equal(num(Number(v.subtotal) - Number(v.desconto) - Number(v.desconto_pix)), num(v.valor_pecas_com_desconto))
  // O Pix não muda por causa da cobertura (10% do valor cheio).
  assert.equal(num(v.desconto_pix), num(Number(v.subtotal) * 0.10))
  // Romaneio público acompanha a view.
  const rom = (await one('select romaneio_publico($1) d', [v.token_publico])).d
  assert.deepEqual([num(rom.desconto), num(rom.total)], [num(v.desconto), num(v.total)])
})

test('cobertura: pedido da Shopify abate o total e v_pedido_acerto fica líquido', async () => {
  const f = await fixture({ shopify: true })
  await preco(f, 0, 60)
  await cobrir(f, 10)
  const antes = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  await escolher(f)
  await concluir(f)
  const bruta = num((await one('select resultado_diferenca d from troca_pecas where id = $1', [f.pecas[0].id])).d)
  assert.ok(bruta > 10)
  const v = await one('select * from v_pedidos where id = $1', [f.pedido.id])
  assert.equal(num(v.total), num(antes + bruta - 10))
  assert.equal(num(v.desconto) - 0, num(Number(v.subtotal) - Number(v.valor_pecas_com_desconto) - Number(v.desconto_pix)))
  const ac = await one('select * from v_pedido_acerto where pedido_id = $1', [f.pedido.id])
  assert.deepEqual([num(ac.saldo), num(ac.total_a_cobrar), num(ac.coberto)], [num(bruta - 10), num(bruta - 10), 10])
  assert.equal(num(ac.valor_pago_original), antes)
  assert.equal(num(ac.novo_total), num(v.total))
})

test('carrinho: concluir fecha o total também no desconto percentual, na Shopify e com cobertura', async () => {
  const p = await fixture({ desconto: 10, tipoDesconto: 'percentual' })
  const pb = await opcaoB(p)
  await carrinho(p, 0, p.opcoes[0].id, 1); await carrinho(p, 0, pb.id, 3)
  await totalFecha(p, () => concluir(p))
  const s = await fixture({ shopify: true, desconto: 0 })
  const sb = await opcaoB(s)
  await carrinho(s, 0, s.opcoes[0].id, 1); await carrinho(s, 0, sb.id, 2)
  const r = await totalFecha(s, () => concluir(s))
  assert.equal(r.antes, 80)
  const c = await fixture({ desconto: 20 })
  await preco(c, 0, 50)
  const cb = await opcaoB(c)
  await cobrir(c, 15)
  await carrinho(c, 0, c.opcoes[0].id, 2); await carrinho(c, 0, cb.id, 1) // paga 20, loja cobre 15
  const t = await totalFecha(c, () => concluir(c))
  assert.equal(t.anunciado, 5)
})


test.each([[75,0,50],[75,10,40],[75,50,0],[75,100,0],[25,100,-50]])('V07: acerto e evento usam saldo líquido (preço %s, cobertura %s)', async (valor, cobertura, saldo) => {
  const f = await fixture({ desconto: 0 })
  await preco(f,0,valor)
  await cobrir(f,cobertura)
  await escolher(f); await concluir(f)
  assert.equal(num((await one('select troca_saldo_liquido($1) saldo',[f.troca.id])).saldo), saldo)
  assert.equal((await one('select acerto_status from trocas where id=$1',[f.troca.id])).acerto_status, saldo===0 ? 'sem_diferenca' : 'pendente')
  if (saldo===0) {
    await recusa(() => one("select troca_acerto($1,'recebido')",[f.troca.id]), /não tem acerto/)
    assert.equal((await one('select acerto_pendente from v_pedidos where id=$1',[f.pedido.id])).acerto_pendente, false)
  } else {
    const status = saldo>0 ? 'recebido' : 'credito_registrado'
    await one('select troca_acerto($1,$2)',[f.troca.id,status])
    const e=await one("select texto from pedido_eventos where pedido_id=$1 and tipo='troca_acerto' and para=$2 order by created_at desc limit 1",[f.pedido.id,status])
    assert.match(e.texto, new RegExp(Math.abs(saldo).toFixed(2).replace('.',',')))
    await one("select troca_acerto($1,'pendente')",[f.troca.id])
    assert.equal((await one('select acerto_em from trocas where id=$1',[f.troca.id])).acerto_em, null)
  }
})
