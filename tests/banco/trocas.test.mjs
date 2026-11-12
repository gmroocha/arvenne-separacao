import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, escolher, concluir, publica, recusa, totalFecha, pedidoWhats, prepararEtapa, BACKFILL, pedidoShopifyAntigo, num, preco, cobrir, resumo, opcaoB, carrinho, cart } from './fixtures.mjs'

test('troca por peça do site: preserva quantidade, registra histórico e repetir não duplica', async () => {
  const f = await fixture()
  await escolher(f)
  await concluir(f)
  await concluir(f)
  const { rows } = await db.query("select * from pedido_itens where pedido_id = $1 and status <> 'removido'", [f.pedido.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].origem, 'shopify')
  assert.equal(rows[0].qtd, 2)
  assert.equal(rows[0].status, 'pendente')
  assert.equal((await one('select status from pedidos where id = $1', [f.pedido.id])).status, 'separacao')
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  assert.equal((await one("select count(*)::int as n from pedido_eventos where pedido_id = $1 and tipo = 'troca_concluida'", [f.pedido.id])).n, 1)
  assert.equal((await publica(f)).resumo.diferenca, 40)
})

test('troca por peça do Clube mantém a origem do catálogo', async () => {
  const f = await fixture({ origem: 'clube' })
  await escolher(f); await concluir(f)
  assert.equal((await one("select origem from pedido_itens where pedido_id = $1 and status <> 'removido'", [f.pedido.id])).origem, 'clube')
})

test('desconto fixo + Pix ficam estáveis após conclusão parcial e crédito', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20, pix: true })
  await escolher(f, 0)
  await escolher(f, 1, 'credito')
  const antes = await publica(f)
  assert.equal(antes.resumo.total_pago, 160)
  assert.equal(antes.resumo.diferenca, -40)
  await concluir(f, 0)
  assert.deepEqual((await publica(f)).resumo, antes.resumo)
  assert.equal((await one('select status from pedidos where id = $1', [f.pedido.id])).status, 'aguardando_cliente')
  assert.equal(Number((await one('select * from troca_valor_pago($1)', [f.itens[1].id])).valor_pago), 80)
  await concluir(f, 1, 'credito')
  assert.deepEqual((await publica(f)).resumo, antes.resumo)
  const final = await one('select resultado_diferenca from troca_pecas where id = $1', [f.pecas[1].id])
  assert.equal(Number(final.resultado_diferenca), -80)
  assert.equal((await one('select status from pedidos where id = $1', [f.pedido.id])).status, 'separacao')
})

test('crédito sem substituição guarda a peça original e o valor pago', async () => {
  const f = await fixture()
  await escolher(f, 0, 'credito'); await concluir(f, 0, 'credito'); await concluir(f, 0, 'credito')
  const { rows } = await db.query('select * from pedido_itens where pedido_id = $1', [f.pedido.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'removido')
  assert.equal((await publica(f)).resumo.diferenca, -80)
})

test('se a cliente muda a escolha, a confirmação antiga é recusada sem alterar o pedido', async () => {
  const f = await fixture()
  await escolher(f); await escolher(f, 0, 'credito')
  await recusa(() => concluir(f), /cliente mudou a escolha/)
  assert.equal((await one('select status from pedido_itens where id = $1', [f.itens[0].id])).status, 'falta')
  assert.equal((await one('select count(*)::int as n from pedido_itens where pedido_id = $1', [f.pedido.id])).n, 1)
})

test('falha após inserir a substituição desfaz toda a operação', async () => {
  const f = await fixture()
  await escolher(f)
  await db.exec(`reset role;
    create function teste_falhar_troca() returns trigger language plpgsql as $$
      begin raise exception 'Falha simulada ao concluir'; end $$;
    create trigger teste_falhar before update on troca_pecas
      for each row when (new.concluida_em is not null) execute function teste_falhar_troca();
    set local role authenticated;`)
  await recusa(() => concluir(f), /Falha simulada/)
  assert.equal((await one('select count(*)::int as n from pedido_itens where pedido_id = $1', [f.pedido.id])).n, 1)
  assert.equal((await one('select status from pedido_itens where id = $1', [f.itens[0].id])).status, 'falta')
  assert.equal((await one('select concluida_em from troca_pecas where id = $1', [f.pecas[0].id])).concluida_em, null)
})

test('troca cancelada e peça de outra troca são recusadas', async () => {
  const f = await fixture()
  const g = await fixture()
  await escolher(f)
  await recusa(() => one('select troca_concluir_peca($1, $2, $3, $4, $5)',
    [f.troca.id, g.pecas[0].id, 'opcao', f.opcoes[0].id, 'opcao']), /não pertence/)
  await db.query("update trocas set status = 'cancelada' where id = $1", [f.troca.id])
  await recusa(() => concluir(f), /cancelada/)
})

test('sugestões calculam o preço com o mesmo desconto do link da cliente', async () => {
  const f = await fixture({ quantidade: 2, pix: true })
  await db.exec(`reset role;
    insert into catalogo_site (variant_id, produto_id, produto, variante, preco, status)
    values (100, 100, 'Anel teste', '18', 75, 'ACTIVE'), (101, 101, 'Anel arquivado', '18', 50, 'ARCHIVED');
    set local role authenticated;`)
  await escolher(f); await concluir(f)
  const { rows } = await db.query("select * from sugerir_troca($1, 'preco', null, null, null)", [f.itens[1].id])
  assert.equal(rows.length, 1)
  assert.equal(Number(rows[0].preco_cliente), 60)
  assert.equal(Number(rows[0].diferenca), 40)
})

test('remover a opção escolhida pede nova resposta e preserva escolhas já concluídas', async () => {
  const f = await fixture()
  await escolher(f)
  await db.query('delete from troca_opcoes where id = $1', [f.opcoes[0].id])
  const dados = await publica(f)
  assert.equal(dados.status, 'enviada')
  assert.equal(dados.pecas[0].escolha_tipo, null)
  assert.equal(dados.resumo.pecas_respondidas, 0)
  await recusa(() => concluir(f), /cliente mudou a escolha/)
  const g = await fixture()
  await escolher(g); await concluir(g)
  await recusa(() => db.query('delete from troca_opcoes where id = $1', [g.opcoes[0].id]), /já concluída/)
  assert.equal((await publica(g)).resumo.diferenca, 40)
})

test('garantir_troca e enviar_troca são idempotentes', async () => {
  const p = await pedidoWhats('avisar_cliente')
  const itens = (await db.query('select id from pedido_itens where pedido_id = $1 order by ordem', [p.id])).rows.map(r => r.id)
  await db.exec('set local role authenticated')
  const t1 = (await one('select garantir_troca($1, $2::uuid[]) as t', [p.id, [itens[0]]])).t
  const t2 = (await one('select garantir_troca($1, $2::uuid[]) as t', [p.id, itens])).t
  const t3 = (await one('select garantir_troca($1, $2::uuid[]) as t', [p.id, itens])).t
  assert.equal(t1, t2); assert.equal(t2, t3)
  assert.equal((await one('select count(*)::int as n from troca_pecas where troca_id = $1', [t1])).n, 2)
  await one('select enviar_troca($1)', [t1])
  const env = await one('select status, enviada_em from trocas where id = $1', [t1])
  assert.equal(env.status, 'enviada')
  await one('select enviar_troca($1)', [t1])
  assert.equal((await one('select enviada_em from trocas where id = $1', [t1])).enviada_em.getTime(), env.enviada_em.getTime())
  assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'aguardando_cliente')
  // Peça nova numa troca respondida volta para enviada.
  await db.query("update trocas set status = 'respondida' where id = $1", [t1])
  const extra = await one("insert into pedido_itens (pedido_id, origem, nome, qtd, preco, ordem) values ($1, 'avulso', 'Pulseira', 1, 10, 5) returning id", [p.id])
  await one('select garantir_troca($1, $2::uuid[])', [p.id, [extra.id]])
  assert.equal((await one('select status from trocas where id = $1', [t1])).status, 'enviada')
})

test('troca usa o preco_pago exato da peça em falta; as opções usam preço x fator', async () => {
  const { pedido, a } = await pedidoShopifyAntigo(777004)
  await db.exec(BACKFILL)
  await db.exec('set local role authenticated')
  const troca = await one('insert into trocas (pedido_id) values ($1) returning *', [pedido.id])
  assert.equal(Number(troca.fator_desconto).toFixed(4), '0.7500')
  // O preço pago exato chega depois (o fator da troca já foi gravado).
  await db.query('update pedido_itens set preco_pago = 76.9 where id = $1', [a.id])
  const peca = await one('insert into troca_pecas (troca_id, item_id) values ($1, $2) returning *', [troca.id, a.id])
  await db.query("insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco) values ($1, 'site', 'Brinco novo', 'NOVO', 100)", [peca.id])
  const pago = await one('select * from troca_valor_pago($1)', [a.id])
  assert.deepEqual([Number(pago.valor_pago), Number(pago.valor_pago_unit)], [76.9, 76.9])
  const v = (await db.query('select tipo, valor_pago_item, valor_opcao, diferenca from v_troca_valores where troca_peca_id = $1 order by tipo', [peca.id])).rows
  assert.deepEqual(v.map(r => [r.tipo, Number(r.valor_pago_item), Number(r.valor_opcao), Number(r.diferenca)]),
    [['credito', 76.9, 0, -76.9], ['opcao', 76.9, 75, -1.9]])
})

test('sugerir_troca exclui peças que já estão no pedido, a menos que peça para incluir, e marca no_pedido', async () => {
  const { a, b } = await pedidoShopifyAntigo(777005)
  await db.exec(`reset role;
    insert into catalogo_site (variant_id, produto_id, produto, variante, preco, status) values
      (11, 1, 'Brinco', '10', 100, 'ACTIVE'), (12, 1, 'Brinco', '12', 100, 'ACTIVE'), (13, 1, 'Brinco', '14', 100, 'ACTIVE'),
      (21, 2, 'Anel', '16', 100, 'ACTIVE'), (22, 3, 'Colar', '40', 100, 'ACTIVE');
    set local role authenticated;`)
  // O anel (variante 12) já está no pedido.
  await db.query('update pedido_itens set shopify_variant_id = 12 where id = $1', [b.id])
  const variantes = async inc => (await db.query("select variant_id::int v, no_pedido from sugerir_troca($1, 'variantes', null, 0.2, null, $2) order by variante", [a.id, inc])).rows
  assert.deepEqual(await variantes(false), [{ v: 13, no_pedido: false }])
  assert.deepEqual(await variantes(true), [{ v: 12, no_pedido: true }, { v: 13, no_pedido: false }])
  // Sem o parâmetro (assinatura antiga de 5 argumentos): também exclui.
  assert.equal((await db.query("select * from sugerir_troca($1, 'variantes', null, 0.2, null)", [a.id])).rows.length, 1)
  await db.query('update pedido_itens set shopify_variant_id = 21 where id = $1', [b.id])
  const preco = async inc => (await db.query("select variant_id::int v, no_pedido from sugerir_troca($1, 'preco', null, 1, null, $2) order by variant_id", [a.id, inc])).rows
  assert.deepEqual((await preco(false)).map(r => r.v), [22])
  assert.deepEqual(await preco(true), [{ v: 21, no_pedido: true }, { v: 22, no_pedido: false }])
})

test('sugerir_troca com p_so_sem_estoque: só vende_sem_estoque true; padrão false mantém tudo; devolve a coluna', async () => {
  const { a } = await pedidoShopifyAntigo(777006)
  await db.exec(`reset role;
    insert into catalogo_site (variant_id, produto_id, produto, variante, preco, status, vende_sem_estoque) values
      (31, 1, 'Brinco', '10', 100, 'ACTIVE', null), (32, 1, 'Brinco', '12', 100, 'ACTIVE', true),
      (33, 1, 'Brinco', '14', 100, 'ACTIVE', false), (34, 1, 'Brinco', '16', 100, 'ACTIVE', true),
      (41, 2, 'Anel', '16', 100, 'ACTIVE', true), (42, 3, 'Colar', '40', 100, 'ACTIVE', false), (43, 4, 'Pulseira', '18', 100, 'ACTIVE', null);
    set local role authenticated;`)
  await db.query('update pedido_itens set shopify_variant_id = 31 where id = $1', [a.id])
  const q = async (modo, so) => (await db.query('select variant_id::int v, vende_sem_estoque s from sugerir_troca($1, $2, null, 1, null, false, $3) order by variant_id', [a.id, modo, so])).rows
  assert.deepEqual(await q('variantes', true), [{ v: 32, s: true }, { v: 34, s: true }])
  assert.deepEqual((await q('variantes', false)).map(r => r.v), [32, 33, 34])
  assert.deepEqual(await q('preco', true), [{ v: 41, s: true }])
  assert.deepEqual((await q('preco', false)).map(r => r.v), [41, 42, 43])
  assert.equal((await db.query("select * from sugerir_troca($1, 'preco', null, 1, null)", [a.id])).rows.length, 3)
})

test('troca_aprovar em troca em rascunho: opção e crédito, concluída na hora, total certo', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20, pix: true })
  await db.query("update trocas set status = 'rascunho', enviada_em = null where id = $1", [f.troca.id])
  const antes = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  const parcial = await one('select * from troca_pecas where id = $1', [f.pecas[0].id])
  assert.equal(parcial.escolhida_por, 'equipe')
  assert.notEqual(parcial.concluida_em, null)
  assert.equal(Number(parcial.resultado_diferenca), 40)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'rascunho')
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[1].id, 'credito'])
  const t = await one('select status, acerto_status from trocas where id = $1', [f.troca.id])
  assert.deepEqual(t, { status: 'concluida', acerto_status: 'pendente' })
  const depois = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  assert.equal(Number((depois - antes).toFixed(2)), -40)
  assert.equal((await one('select status from pedidos where id = $1', [f.pedido.id])).status, 'separacao')
  // Repetir não duplica nada.
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[1].id, 'credito'])
  assert.equal((await one("select count(*)::int n from pedido_itens where pedido_id = $1 and status <> 'removido'", [f.pedido.id])).n, 1)
  const dados = (await publica(f)).pecas
  assert.equal(dados[0].escolha_equipe, true)
  assert.equal(dados[0].concluida, true)
  assert.equal(Number(dados[0].resultado), 40)
  assert.equal(dados[0].nova.sku, 'NOVO')
  assert.equal(dados[1].nova, null)
  // Tipo ou opção inválidos são recusados.
  const g = await fixture()
  await recusa(() => one('select troca_aprovar($1, $2, $3, null)', [g.troca.id, g.pecas[0].id, 'opcao']), /Opção não pertence/)
  await recusa(() => one('select troca_aprovar($1, $2, $3, null)', [g.troca.id, g.pecas[0].id, 'whatsapp']), /inválido/)
})

test('troca_aprovar em troca enviada sobrepõe a escolha da cliente; peça já escolhida pela cliente também conclui', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20 })
  await escolher(f, 0, 'credito')
  // A cliente escolheu crédito na peça 0, a equipe aprova a opção (cliente mudou de ideia no WhatsApp).
  await one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id])
  assert.equal((await one('select escolha_tipo from troca_pecas where id = $1', [f.pecas[0].id])).escolha_tipo, 'opcao')
  await escolher(f, 1)
  await concluir(f, 1)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  assert.equal((await one('select escolhida_por from troca_pecas where id = $1', [f.pecas[1].id])).escolhida_por, null)
})

test('opção sem preço: não vira crédito na view e a troca é recusada (equipe e cliente)', async () => {
  const f = await fixture({ quantidade: 2, desconto: 20 })
  await escolher(f, 0)
  await db.query('update troca_opcoes set preco = null where id = $1', [f.opcoes[0].id])
  assert.equal((await db.query("select 1 from v_troca_valores where opcao_id = $1", [f.opcoes[0].id])).rows.length, 0)
  await recusa(() => concluir(f, 0), /sem preço/)
  await recusa(() => one('select troca_aprovar($1, $2, $3, $4)', [f.troca.id, f.pecas[0].id, 'opcao', f.opcoes[0].id]), /sem preço/)
  assert.equal((await one('select status from pedido_itens where id = $1', [f.itens[0].id])).status, 'falta')
  await db.exec('set local role anon')
  await recusa(() => one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[1].id, 'opcao', f.opcoes[0].id]), /inválida/)
})

test('pedido cancelado cancela as trocas ativas; pedido cancelado ou enviado recusa escolher e concluir', async () => {
  const f = await fixture({ desconto: 20 })
  await escolher(f)
  await db.query("update pedidos set status = 'cancelado' where id = $1", [f.pedido.id])
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'cancelada')
  await recusa(() => concluir(f), /cancelada/)
  await db.exec('set local role anon')
  await recusa(() => one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[0].id, 'opcao', f.opcoes[0].id]), /não aceita/)
  await db.exec('set local role authenticated')
  // Pedido enviado com troca ativa (caso de dado antigo): escolher, aprovar e concluir recusam.
  const g = await fixture({ desconto: 20 })
  await escolher(g)
  await prepararEtapa(g.pedido.id,'enviado')
  await recusa(() => concluir(g), /enviado/)
  await recusa(() => one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id]), /enviado/)
  await db.exec('set local role anon')
  await recusa(() => one('select troca_escolher($1, $2, $3, $4)', [g.troca.token, g.itens[0].id, 'credito', null]), /não aceita/)
})

test('carrinho: duas opções batendo o valor (diferença 0), menor (crédito) e maior (paga)', async () => {
  const f = await fixture()
  await preco(f, 0, 50)
  const b = await opcaoB(f)
  await carrinho(f, 0, f.opcoes[0].id, 1); await carrinho(f, 0, b.id, 2) // 40 + 40 = 80
  let c = await cart(f)
  assert.deepEqual([c.unidades, num(c.valor_escolhido), num(c.valor_pago_item), num(c.diferenca)], [3, 80, 80, 0])
  assert.deepEqual(c.itens.map(x => [x.qtd, num(x.valor_unit), num(x.valor)]), [[1, 40, 40], [2, 20, 40]])
  let pub = await publica(f)
  assert.deepEqual([pub.status, pub.pecas[0].escolha_tipo, pub.pecas[0].unidades, num(pub.pecas[0].valor_escolhido), num(pub.resumo.diferenca)], ['respondida', 'opcao', 3, 80, 0])
  assert.deepEqual(pub.pecas[0].carrinho, [{ opcao_id: f.opcoes[0].id, qtd: 1 }, { opcao_id: b.id, qtd: 2 }])
  assert.deepEqual(pub.pecas[0].opcoes.map(o => num(o.valor_unit)), [40, 20])
  assert.equal((await resumo(f)).pecas_respondidas, 1)
  await carrinho(f, 0, b.id, 1) // 40 + 20 = 60 -> crédito de 20
  assert.equal(num((await cart(f)).diferenca), -20)
  assert.equal(num((await resumo(f)).diferenca_total), -20)
  await carrinho(f, 0, f.opcoes[0].id, 2); await carrinho(f, 0, b.id, 1) // 80 + 20 = 100 -> paga 20
  assert.equal(num((await cart(f)).diferenca), 20)
  await cobrir(f, 15)
  const r = await resumo(f)
  assert.deepEqual([num(r.diferenca_bruta), num(r.coberto), num(r.diferenca_total)], [20, 15, 5])
  // Esvaziar o carrinho volta a aguardar resposta.
  await carrinho(f, 0, f.opcoes[0].id, 0); await carrinho(f, 0, b.id, 0)
  pub = await publica(f)
  assert.deepEqual([pub.status, pub.pecas[0].escolha_tipo, pub.pecas[0].escolha_opcao_id, pub.pecas[0].unidades], ['enviada', null, null, 0])
})

test('carrinho: limite de 20 unidades, opção inválida e troca já concluída', async () => {
  const f = await fixture()
  const b = await opcaoB(f)
  await carrinho(f, 0, f.opcoes[0].id, 10)
  await carrinho(f, 0, b.id, 10)
  await recusa(() => carrinho(f, 0, b.id, 11), /limite é de 20/)
  await recusa(() => carrinho(f, 0, b.id, -1), /inválida/)
  const g = await fixture()
  await recusa(() => carrinho(f, 0, g.opcoes[0].id, 1), /Opção inválida/)
  await db.query('update troca_opcoes set preco = null where id = $1', [b.id])
  await recusa(() => carrinho(f, 0, b.id, 1), /Opção inválida/)
  await carrinho(g, 0, g.opcoes[0].id, 1)
  await concluir(g)
  await recusa(() => carrinho(g, 0, g.opcoes[0].id, 2), /não aceita|Peça inválida/)
})

test('carrinho: apagar uma opção tira a escolha dela e acerta escolha_tipo / escolha_opcao_id', async () => {
  const f = await fixture()
  const b = await opcaoB(f)
  await carrinho(f, 0, f.opcoes[0].id, 1); await carrinho(f, 0, b.id, 2)
  await db.query('delete from troca_opcoes where id = $1', [f.opcoes[0].id]) // a 1ª escolha some
  let p = await one('select * from troca_pecas where id = $1', [f.pecas[0].id])
  assert.deepEqual([p.escolha_tipo, p.escolha_opcao_id], ['opcao', b.id])
  assert.equal((await db.query('select 1 from troca_escolhas where troca_peca_id = $1', [f.pecas[0].id])).rows.length, 1)
  assert.equal((await publica(f)).status, 'respondida')
  await db.query('delete from troca_opcoes where id = $1', [b.id]) // o carrinho esvazia
  p = await one('select * from troca_pecas where id = $1', [f.pecas[0].id])
  assert.deepEqual([p.escolha_tipo, p.escolha_opcao_id, p.respondida_em], [null, null, null])
  assert.equal((await publica(f)).status, 'enviada')
  // Apagar a opção que NÃO é a primeira mantém a escolha.
  const g = await fixture()
  const b2 = await opcaoB(g)
  await carrinho(g, 0, g.opcoes[0].id, 1); await carrinho(g, 0, b2.id, 1)
  await db.query('delete from troca_opcoes where id = $1', [b2.id])
  p = await one('select * from troca_pecas where id = $1', [g.pecas[0].id])
  assert.deepEqual([p.escolha_tipo, p.escolha_opcao_id], ['opcao', g.opcoes[0].id])
})

test('troca_escolher: "Quero esta" mantém a quantidade da linha; crédito e WhatsApp limpam o carrinho', async () => {
  const f = await fixture()
  const b = await opcaoB(f)
  await carrinho(f, 0, b.id, 3)
  await escolher(f) // opcoes[0]
  let e = (await db.query('select opcao_id, qtd from troca_escolhas where troca_peca_id = $1', [f.pecas[0].id])).rows
  assert.deepEqual(e, [{ opcao_id: f.opcoes[0].id, qtd: 2 }])
  assert.equal((await one('select escolha_opcao_id from troca_pecas where id = $1', [f.pecas[0].id])).escolha_opcao_id, f.opcoes[0].id)
  await escolher(f, 0, 'credito')
  assert.equal((await db.query('select 1 from troca_escolhas where troca_peca_id = $1', [f.pecas[0].id])).rows.length, 0)
  const pub = await publica(f)
  assert.deepEqual([pub.pecas[0].escolha_tipo, pub.pecas[0].carrinho, pub.pecas[0].unidades], ['credito', [], 0])
  await carrinho(f, 0, b.id, 1)
  await escolher(f, 0, 'whatsapp')
  assert.equal((await db.query('select 1 from troca_escolhas where troca_peca_id = $1', [f.pecas[0].id])).rows.length, 0)
})

test('carrinho: concluir gera uma linha por peça e o total fecha (WhatsApp desconto fixo + Pix)', async () => {
  const f = await fixture({ desconto: 20, pix: true })
  await preco(f, 0, 50)
  const b = await opcaoB(f)
  await carrinho(f, 0, f.opcoes[0].id, 2); await carrinho(f, 0, b.id, 1)
  const dif = num((await cart(f)).diferenca)
  await totalFecha(f, () => concluir(f))
  const novas = (await db.query("select * from pedido_itens where pedido_id = $1 and status <> 'removido' order by ordem", [f.pedido.id])).rows
  assert.deepEqual(novas.map(x => [x.sku, x.qtd, num(x.preco), x.observacao]),
    [['NOVO', 2, 50, 'troca de ORIGINAL-0'], ['NOVO-B', 1, 25, 'troca de ORIGINAL-0']])
  const orig = await one('select * from pedido_itens where id = $1', [f.itens[0].id])
  assert.equal(orig.status, 'removido')
  assert.match(orig.observacao, /^trocada por NOVO .*\+ .*NOVO-B/)
  assert.equal(num((await one('select resultado_diferenca from troca_pecas where id = $1', [f.pecas[0].id])).resultado_diferenca), dif)
  const ac = await one('select * from v_pedido_acerto where pedido_id = $1', [f.pedido.id])
  assert.deepEqual(ac.pecas[0].depois_lista.map(x => [x.sku, x.qtd]), [['NOVO', 2], ['NOVO-B', 1]])
  assert.equal(ac.pecas[0].depois.sku, 'NOVO')
  const pub = await publica(f)
  assert.deepEqual(pub.pecas[0].novas.map(x => [x.sku, x.qtd]), [['NOVO', 2], ['NOVO-B', 1]])
  assert.equal(pub.pecas[0].nova.sku, 'NOVO')
})

test('carrinho: concluir exige carrinho e preço; p_versao protege contra mudança; 5 argumentos continuam valendo', async () => {
  const f = await fixture()
  await recusa(() => one("select troca_concluir_peca($1, $2, 'opcao', null, 'opcao')", [f.troca.id, f.pecas[0].id]), /cliente mudou|ainda não escolheu/)
  await carrinho(f, 0, f.opcoes[0].id, 1)
  const v = (await one('select respondida_em from troca_pecas where id = $1', [f.pecas[0].id])).respondida_em
  const outra = new Date(new Date(v).getTime() - 60000).toISOString()
  await recusa(() => one("select troca_concluir_peca($1, $2, 'opcao', null, 'opcao', $3)", [f.troca.id, f.pecas[0].id, outra]), /cliente mudou a escolha/)
  assert.equal((await one('select status from pedido_itens where id = $1', [f.itens[0].id])).status, 'falta')
  assert.equal((await one("select troca_concluir_peca($1, $2, 'opcao', null, 'opcao', $3) as ok", [f.troca.id, f.pecas[0].id, v])).ok, true)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
})

test('troca_aprovar_carrinho aprova o que a cliente montou; troca_aprovar de opção troca o carrinho', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 50)
  const b = await opcaoB(f)
  await recusa(() => one('select troca_aprovar_carrinho($1, $2)', [f.troca.id, f.pecas[0].id]), /não montou/)
  await carrinho(f, 0, f.opcoes[0].id, 1); await carrinho(f, 0, b.id, 2)
  await one('select troca_aprovar_carrinho($1, $2)', [f.troca.id, f.pecas[0].id])
  const p = await one('select * from troca_pecas where id = $1', [f.pecas[0].id])
  assert.equal(p.escolhida_por, null); assert.notEqual(p.concluida_em, null); assert.equal(num(p.resultado_diferenca), 0)
  assert.equal((await db.query("select 1 from pedido_itens where pedido_id = $1 and observacao like 'troca de%'", [f.pedido.id])).rows.length, 2)
  // Aprovar uma opção avulsa: o carrinho passa a ser só ela, com a quantidade da linha.
  const g = await fixture({ desconto: 20 })
  const gb = await opcaoB(g)
  await carrinho(g, 0, gb.id, 5)
  await one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id])
  const e = (await db.query('select opcao_id, qtd from troca_escolhas where troca_peca_id = $1', [g.pecas[0].id])).rows
  assert.deepEqual(e, [{ opcao_id: g.opcoes[0].id, qtd: 2 }])
  const gp = await one('select * from troca_pecas where id = $1', [g.pecas[0].id])
  assert.equal(gp.escolhida_por, 'equipe'); assert.notEqual(gp.concluida_em, null)
  assert.equal((await db.query("select 1 from pedido_itens where pedido_id = $1 and observacao like 'troca de%'", [g.pedido.id])).rows.length, 1)
})

test('troca: peça que saiu da falta some da página e do resumo, e volta igual se faltar de novo', async () => {
  const f = await fixture({ quantidade: 2 })
  const resumo = () => one('select pecas_total, total_pago from v_troca_resumo where troca_id = $1', [f.troca.id])
  const antes = await resumo()
  assert.equal(antes.pecas_total, 2)
  await db.query("update pedido_itens set status = 'pendente' where id = $1", [f.itens[1].id])
  let dados = await publica(f)
  assert.equal(dados.pecas.length, 1)
  assert.equal(dados.pecas[0].item_id, f.itens[0].id)
  assert.equal(dados.resumo.pecas_total, 1)
  assert.equal((await resumo()).pecas_total, 1)
  // valor de UMA unidade vem pronto do banco (2 unidades -> metade do total pago).
  const p0 = dados.pecas[0]
  assert.ok(Math.abs(num(p0.valor_pago_unit) * p0.qtd - num(p0.valor_pago)) <= 0.01)
  // Volta a faltar: a peça reaparece com as opções que já tinha.
  await db.query("update pedido_itens set status = 'falta' where id = $1", [f.itens[1].id])
  dados = await publica(f)
  assert.equal(dados.pecas.length, 2)
  assert.equal(dados.pecas[1].opcoes.length, 1)
  assert.equal(num((await resumo()).total_pago), num(antes.total_pago))
})


test.each(['pendente','encontrado','removido'])('V15: peça inativa %s não impede responder nem concluir a troca', async (status) => {
  for (const viaCarrinho of [false,true]) {
    const f=await fixture({ quantidade: 2 })
    await db.query('update pedido_itens set status=$1 where id=$2',[status,f.itens[1].id])
    if (viaCarrinho) await carrinho(f,0,f.opcoes[0].id,1)
    else await escolher(f)
    assert.equal((await one('select status from trocas where id=$1',[f.troca.id])).status,'respondida')
    await concluir(f)
    assert.equal((await one('select status from trocas where id=$1',[f.troca.id])).status,'concluida')
    assert.equal((await one('select concluida_em from troca_pecas where id=$1',[f.pecas[1].id])).concluida_em,null)
    assert.equal((await one('select count(*)::int n from troca_pecas where troca_id=$1',[f.troca.id])).n,2)
  }
})

test.each(['whatsapp','shopify'])('V06: troca direta é atômica e gera acerto no pedido %s', async (origem) => {
  const p=await one("insert into pedidos(origem,status,valor_total,valor_pago,desconto_tipo,desconto_valor) values ($1,'separacao',80,80,'percentual',20) returning *",[origem])
  const i=await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,preco_pago,status) values ($1,'shopify','Original','A1',2,50,$2,'encontrado') returning *",[p.id,origem==='shopify' ? 40 : null])
  const novos=JSON.stringify([{ origem:'shopify',nome:'Nova',sku:'N1',qtd:2,preco:75 }])
  await db.exec('set local role authenticated')
  const t=(await one('select substituir_item($1,$2::jsonb) as id',[i.id,novos])).id
  assert.equal((await one('select status from pedido_itens where id=$1',[i.id])).status,'removido')
  assert.equal(num((await one('select total from v_pedidos where id=$1',[p.id])).total),120)
  const ac=await one('select acerto_status,saldo from v_pedido_acerto where troca_id=$1',[t])
  assert.deepEqual([ac.acerto_status,num(ac.saldo)],['pendente',40])
  await one('select substituir_item($1,$2::jsonb)',[i.id,novos]) // repetição não duplica substitutas nem cobrança
  assert.equal((await one("select count(*)::int n from pedido_itens where pedido_id=$1 and status<>'removido'",[p.id])).n,1)
  await recusa(() => one('select adicionar_itens($1,$2::jsonb)',[p.id,novos]), /pago|venda somada|troca/i)
})

test('V06: falha após criar a troca desfaz opções, status e novas peças', async () => {
  const p=await pedidoWhats('novo')
  const i=await one("select id from pedido_itens where pedido_id=$1 and sku='A1'",[p.id])
  await db.exec(`create function public.falhar_substituta() returns trigger language plpgsql as $$
    begin if new.observacao like 'troca de%' then raise exception 'Falha de teste na substituta'; end if; return new; end $$;
    create trigger falhar_substituta before insert on pedido_itens for each row execute function public.falhar_substituta();`)
  await db.exec('set local role authenticated')
  await recusa(() => one('select substituir_item($1,$2::jsonb)',[i.id,JSON.stringify([{ origem:'clube',nome:'Nova',qtd:1,preco:75 }])]), /Falha de teste/)
  assert.equal((await one('select count(*)::int n from trocas where pedido_id=$1',[p.id])).n,0)
  assert.equal((await one('select count(*)::int n from pedido_itens where pedido_id=$1',[p.id])).n,2)
  assert.equal((await one('select status from pedido_itens where id=$1',[i.id])).status,'pendente')
  await db.exec('set local role anon')
  await recusa(() => one("select substituir_item($1,'[]')",[i.id]), /permission denied/)
})

test('V29: cada mudança do carrinho da troca fica no histórico com as quantidades', async () => {
  const f = await fixture()
  const b = await opcaoB(f)
  await carrinho(f, 0, f.opcoes[0].id, 2)
  await carrinho(f, 0, f.opcoes[0].id, 1)
  await carrinho(f, 0, b.id, 1)
  const ev = (await db.query("select de, para, texto from pedido_eventos where pedido_id = $1 and tipo = 'troca_carrinho' order by created_at, id", [f.pedido.id])).rows
  const textos = ev.map((e) => e.texto)
  assert.ok(textos.includes('ORIGINAL-0 → NOVO: 0 → 2'), textos.join(' | '))
  assert.ok(textos.includes('ORIGINAL-0 → NOVO: 2 → 1'), textos.join(' | '))
  assert.ok(textos.includes('ORIGINAL-0 → NOVO-B: 0 → 1'), textos.join(' | '))
})
