import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

let db
const casos = []
const test = (nome, executar) => casos.push({ nome, executar })
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]

async function preparar() {
  db = new PGlite()
  // Apenas os objetos de infraestrutura do Supabase são simulados. Tabelas, funções,
  // constraints, gatilhos, permissões e RLS vêm das migrations reais, em ordem.
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key, bucket_id text);
    grant usage on schema public to anon;`)
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
    // PGlite não fornece o servidor de replicação do Supabase Realtime.
    await db.exec(sql.replace(/^alter publication .*;$/gm, ''))
  }
}

async function fixture({ quantidade = 1, desconto = 20, pix = false, origem = 'site', tipoDesconto = 'valor', shopify = false } = {}) {
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
async function escolher(f, n = 0, tipo = 'opcao', opcao = f.opcoes[n].id) {
  await db.exec('set local role anon')
  await one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[n].id, tipo, tipo === 'opcao' ? opcao : null])
  await db.exec('set local role authenticated')
}
const concluir = (f, n = 0, tipo = 'opcao', escolha = tipo, opcao = escolha === 'opcao' ? f.opcoes[n].id : null) =>
  one('select troca_concluir_peca($1, $2, $3, $4, $5)', [f.troca.id, f.pecas[n].id, tipo, opcao, escolha])
const publica = async f => (await one('select troca_publica($1) as dados', [f.troca.token])).dados

// SAVEPOINT permite continuar verificando o banco depois de um erro esperado.
async function recusa(fn, mensagem) {
  await db.exec('savepoint erro_esperado')
  await assert.rejects(fn, mensagem)
  await db.exec('rollback to savepoint erro_esperado')
}

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

test('cliente sem login pode escolher, mas não concluir nem ler dados internos', async () => {
  const f = await fixture()
  await escolher(f)
  await db.exec('set local role anon')
  await recusa(() => concluir(f), /permission denied/)
  await recusa(() => one('select * from pedidos'), /permission denied/)
  const dados = await publica(f)
  assert.deepEqual(Object.keys(dados).sort(), ['cliente', 'numero', 'pecas', 'resumo', 'status'])
  assert.equal(dados.cliente, 'Cliente')
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

// Total do pedido depois da troca = total antes + diferença anunciada à cliente.
async function totalFecha(f, concluirTudo) {
  const antes = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  const anunciado = (await publica(f)).resumo.diferenca
  await concluirTudo()
  const depois = Number((await one('select total from v_pedidos where id = $1', [f.pedido.id])).total)
  assert.equal(Number((depois - antes).toFixed(2)), Number(anunciado))
  return { antes, depois, anunciado }
}

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

const payload = (extra = {}, qtd = 2) => ({
  shopify_order_id: '777001', numero: 'ARV-T1', cliente_nome: 'Cliente', valor_total: '100',
  valor_pago: '100', pedido_em: '2026-11-09T10:00:00Z', pago_em: '2026-11-09T10:00:00Z',
  entrega_cep: '01001000', entrega_logradouro: 'Rua A', frete_cobrado: '0', desconto_codigos: [],
  itens: [{ shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd, preco: '50' }], ...extra,
})
const importar = async p => (await one('select importar_pedido_shopify($1::jsonb) as novo', [JSON.stringify(p)])).novo

test('importação: segunda chamada completa número, cidade e UF vazios', async () => {
  assert.equal(await importar(payload()), true)
  assert.equal(await importar(payload({ entrega_numero: '123', entrega_cidade: 'São Paulo', entrega_uf: 'SP' })), false)
  const p = await one("select entrega_numero, entrega_cidade, entrega_uf from pedidos where shopify_order_id = 777001")
  assert.deepEqual(p, { entrega_numero: '123', entrega_cidade: 'São Paulo', entrega_uf: 'SP' })
})

test('importação: mudança de quantidade na Shopify gera um único evento shopify_alterado', async () => {
  await importar(payload())
  await importar(payload())
  const conta = async () => (await one("select count(*)::int n from pedido_eventos e join pedidos p on p.id = e.pedido_id where p.shopify_order_id = 777001 and e.tipo = 'shopify_alterado'")).n
  assert.equal(await conta(), 0)
  await importar(payload({}, 1))
  assert.equal(await conta(), 1)
  await importar(payload({}, 1))
  assert.equal(await conta(), 1)
})

// ---- Fase 3: ações em transação ----
async function pedidoWhats(status = 'novo') {
  const p = await one("insert into pedidos (origem, status, cliente_nome) values ('whatsapp', 'em_aberto', 'Cliente') returning *")
  await db.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Anel', 'A1', 1, 50, 0)", [p.id])
  await db.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem) values ($1, 'avulso', 'Colar', 'C1', 1, 30, 1)", [p.id])
  if (status !== 'em_aberto') await db.query('update pedidos set status = $2 where id = $1', [p.id, status])
  return p
}

test('reiniciar do zero não ressuscita peça removida na venda e restaura a removida depois', async () => {
  const p = await pedidoWhats('em_aberto')
  const na = await one("select id from pedido_itens where pedido_id = $1 and sku = 'A1'", [p.id])
  const co = await one("select id from pedido_itens where pedido_id = $1 and sku = 'C1'", [p.id])
  await db.query("update pedido_itens set status = 'removido', observacao = 'removida na venda' where id = $1", [na.id])
  await db.query("update pedidos set status = 'novo' where id = $1", [p.id])
  await db.query("update pedido_itens set status = 'removido' where id = $1", [co.id]) // removida na expedição
  await db.query("update pedidos set status = 'bipagem', nf_emitida_em = now() where id = $1", [p.id])
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

test('funções de ação: anon não executa', async () => {
  await db.exec('set local role anon')
  await recusa(() => one('select bipar($1, null, $2)', ['00000000-0000-0000-0000-000000000000', 'x']), /permission denied/)
})

// ---- Troca v2: preço pago exato, frete separado, aprovar e acerto ----
const SQL_MIGRACAO = readFileSync('supabase/migrations/20261113130000_troca_v2.sql', 'utf8')
// Trecho de backfill da migration, para rodar sobre pedidos criados no teste (o banco de teste nasce vazio).
const BACKFILL = SQL_MIGRACAO.slice(
  SQL_MIGRACAO.indexOf('create temporary table _shopify_calc'),
  SQL_MIGRACAO.indexOf('drop table _shopify_calc;') + 'drop table _shopify_calc;'.length)
const dinheiro = n => ({ shopMoney: { amount: String(n) } })
// Pedido como o ARV-1273: peças 100 + 50 = 150, Shopify cobrou 112,50 pelas peças (25%), frete grátis (36,07).
// O total de descontos da Shopify (37,50 + 36,07) e o frete antigo (36,07) são o que o app gravava antes.
const brutoShopify = () => JSON.stringify({
  subtotalPriceSet: dinheiro('112.50'), totalPriceSet: dinheiro('112.50'),
  lineItems: { nodes: [
    { currentQuantity: 1, originalUnitPriceSet: dinheiro('100.00') },
    { currentQuantity: 1, originalUnitPriceSet: dinheiro('50.00') }] },
})
async function pedidoShopifyAntigo(ordem = 9100) {
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

test('backfill da Shopify separa o frete grátis do desconto das peças', async () => {
  const { pedido, a, b } = await pedidoShopifyAntigo()
  await db.exec(BACKFILL)
  const p = await one('select * from pedidos where id = $1', [pedido.id])
  assert.equal(Number(p.frete_cobrado), 0)
  assert.equal(Number(p.frete_original), 36.07)
  assert.equal(Number(p.desconto_frete), 36.07)
  assert.equal(Number(p.desconto_valor), 37.5)
  assert.equal(p.frete_pago_por, 'arvenne')
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [a.id])).preco_pago), 75)
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [b.id])).preco_pago), 37.5)
  assert.equal(Number((await one('select fator_pedido($1) as f', [pedido.id])).f), 0.75)
})

test('importação: preco_pago e frete exatos da Shopify vencem o provisório do backfill', async () => {
  const { pedido, a } = await pedidoShopifyAntigo(777002)
  await db.exec(BACKFILL)
  const exato = {
    ...payload({ shopify_order_id: '777002', valor_total: '112.5', frete_original: '36.07', frete_cobrado: '0', desconto_valor: '37.5' }),
    itens: [{ shopify_variant_id: '11', sku: 'BRI-1', nome: 'Brinco', qtd: 1, preco: '100', preco_pago: '76.00' }],
  }
  assert.equal(await importar(exato), false)
  assert.equal(Number((await one('select preco_pago from pedido_itens where id = $1', [a.id])).preco_pago), 76)
  const p = await one('select frete_cobrado, frete_original, desconto_frete, desconto_valor, frete_pago_por from pedidos where id = $1', [pedido.id])
  assert.deepEqual(
    [Number(p.frete_cobrado), Number(p.frete_original), Number(p.desconto_frete), Number(p.desconto_valor), p.frete_pago_por],
    [0, 36.07, 36.07, 37.5, 'arvenne'])
  // Pedido novo grava tudo de uma vez.
  assert.equal(await importar({ ...exato, shopify_order_id: '777003', numero: 'ARV-T3' }), true)
  const n = await one(`select i.preco_pago, p.frete_original, p.frete_cobrado from pedidos p
    join pedido_itens i on i.pedido_id = p.id where p.shopify_order_id = 777003`)
  assert.deepEqual([Number(n.preco_pago), Number(n.frete_original), Number(n.frete_cobrado)], [76, 36.07, 0])
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

test('funções novas da troca v2: anon não executa', async () => {
  const f = await fixture()
  await db.exec('set local role anon')
  const zero = '00000000-0000-0000-0000-000000000000'
  await recusa(() => one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito']), /permission denied/)
  await recusa(() => one('select troca_acerto($1, $2)', [f.troca.id, 'recebido']), /permission denied/)
  await recusa(() => one("select * from sugerir_troca($1, 'variantes', null, 0.2, null, true)", [zero]), /permission denied/)
  await recusa(() => one("select * from sugerir_troca($1, 'variantes', null, 0.2, null, false, true)", [zero]), /permission denied/)
  await recusa(() => one('select fator_pedido($1)', [zero]), /permission denied/)
  await recusa(() => one('select * from v_pedido_acerto'), /permission denied/)
  await recusa(() => one('select troca_concluir_peca($1, $2, $3, null, $3)', [f.troca.id, f.pecas[0].id, 'credito']), /permission denied/)
  // A página pública continua aberta.
  assert.equal((await publica(f)).status, 'enviada')
})


// ---- Vistoria 11/11: reembolso, desconto por linha, devolução, prazo e bipagem ----
const zero = '00000000-0000-0000-0000-000000000000'
// Pedido da Shopify com duas linhas e frete: A 1x100 (pago 80), B 1x50 (pago 40), frete 20. Total 140.
const payloadV2 = (extra = {}) => ({
  shopify_order_id: '888001', numero: 'ARV-V1', cliente_nome: 'Cliente', valor_total: '140', valor_pago: '140',
  pedido_em: '2020-01-01T10:00:00Z', pago_em: '2020-01-01T10:00:00Z', entrega_cep: '01001000',
  frete_original: '20', frete_cobrado: '20', frete_titulo: 'PAC', desconto_valor: '30', desconto_codigos: [],
  itens: [
    { shopify_line_id: 'L1', shopify_variant_id: '11', sku: 'BRI-1', nome: 'Brinco', qtd: 1, preco: '100', preco_pago: '80' },
    { shopify_line_id: 'L2', shopify_variant_id: '12', sku: 'ANEL-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '40' }],
  ...extra,
})
const pedidoDe = id => one('select * from pedidos where shopify_order_id = $1', [id])
const eventos = async (pedidoId, tipo) =>
  (await one('select count(*)::int n from pedido_eventos where pedido_id = $1 and tipo = $2', [pedidoId, tipo])).n

test('reembolsado na Shopify cancela o pedido (uma vez só no histórico); novo reembolsado não entra', async () => {
  await importar(payload())
  const p0 = await pedidoDe(777001)
  await importar(payload({ reembolsado: true }))
  await importar(payload({ reembolsado: true }))
  assert.equal((await pedidoDe(777001)).status, 'cancelado')
  assert.equal(await eventos(p0.id, 'shopify_alerta'), 1)
  assert.equal(await importar(payload({ shopify_order_id: '777010', reembolsado: true })), false)
  assert.equal((await db.query('select 1 from pedidos where shopify_order_id = 777010')).rows.length, 0)
  // Já enviado: não volta atrás, só avisa.
  await importar(payload({ shopify_order_id: '777011' }))
  await db.query("update pedidos set status = 'enviado' where shopify_order_id = 777011")
  await importar(payload({ shopify_order_id: '777011', reembolsado: true }))
  assert.equal((await pedidoDe(777011)).status, 'enviado')
})

test('reembolso parcial: valor atual é regravado, desconto da carga vale e subtotal - desconto + frete = total', async () => {
  await importar(payloadV2())
  const p0 = await pedidoDe(888001)
  const v = await one('select * from v_pedidos where id = $1', [p0.id])
  assert.deepEqual([Number(v.subtotal), Number(v.desconto), Number(v.frete_na_conta), Number(v.total)], [150, 30, 20, 140])
  // Reembolso parcial da linha B: valor atual 100 (peça B 40 + frete 20 saíram? aqui só B), desconto da carga igual.
  await importar(payloadV2({ valor_total: '100', valor_pago: '100',
    itens: [payloadV2().itens[0]] }))
  const p1 = await pedidoDe(888001)
  assert.deepEqual([Number(p1.valor_total), Number(p1.valor_pago), Number(p1.desconto_valor)], [100, 100, 30])
  assert.equal(await eventos(p0.id, 'shopify_alterado'), 1)
})

test('preco_pago casa por linha da Shopify, mesmo com a mesma variante repetida', async () => {
  const itens = [
    { shopify_line_id: 'R1', shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '40' },
    { shopify_line_id: 'R2', shopify_variant_id: '55', sku: 'AN-1', nome: 'Anel', qtd: 1, preco: '50', preco_pago: '50' }]
  await importar(payloadV2({ shopify_order_id: '888002', itens }))
  const pega = async () => (await db.query(`select i.shopify_line_id l, i.preco_pago::float pp from pedido_itens i
    join pedidos p on p.id = i.pedido_id where p.shopify_order_id = 888002 order by i.ordem`)).rows
  assert.deepEqual(await pega(), [{ l: 'R1', pp: 40 }, { l: 'R2', pp: 50 }])
  itens[0].preco_pago = '45'
  await importar(payloadV2({ shopify_order_id: '888002', itens }))
  assert.deepEqual(await pega(), [{ l: 'R1', pp: 45 }, { l: 'R2', pp: 50 }])
  // Linhas antigas sem id: variante repetida não casa (ficam como estão); variante única casa e ganha o id.
  const ped = await one(`insert into pedidos (origem, status, valor_total, shopify_order_id) values ('shopify', 'novo', 100, 888003) returning id`)
  for (const [n, v] of [[1, 55], [2, 55], [3, 66]])
    await db.query(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, nome, qtd, preco, ordem) values ($1, 'shopify', $2, 'X', 1, 50, $3)`, [ped.id, v, n])
  await importar(payloadV2({ shopify_order_id: '888003', itens: [
    ...itens, { shopify_line_id: 'R3', shopify_variant_id: '66', sku: 'B', nome: 'B', qtd: 1, preco: '50', preco_pago: '30' }] }))
  const l = (await db.query('select shopify_variant_id::int v, shopify_line_id l, preco_pago::float pp from pedido_itens where pedido_id = $1 order by ordem', [ped.id])).rows
  assert.deepEqual(l, [{ v: 55, l: null, pp: null }, { v: 55, l: null, pp: null }, { v: 66, l: 'R3', pp: 30 }])
})

test('importação: frete_pago_por da equipe fica, retirada vem antes de pac, pago_em estimado é corrigido', async () => {
  await importar(payloadV2({ pago_em_estimado: true, pago_em: '2020-01-01T10:00:00Z', frete_titulo: 'Retirada na loja (sem PAC)' }))
  let p = await pedidoDe(888001)
  assert.deepEqual([p.frete_tipo, p.frete_pago_por, p.pago_em_estimado], ['retirada', 'cliente', true])
  await db.query("update pedidos set frete_pago_por = 'arvenne' where id = $1", [p.id])
  await importar(payloadV2({ pago_em: '2020-01-01T12:00:00Z' }))
  p = await pedidoDe(888001)
  assert.equal(p.frete_pago_por, 'arvenne')
  assert.equal(p.pago_em_estimado, false)
  assert.equal(new Date(p.pago_em).toISOString(), '2020-01-01T12:00:00.000Z')
  // Estimativa nova não sobrescreve nada; "Pacote" não é PAC.
  await importar(payloadV2({ pago_em: '2020-02-02T12:00:00Z', pago_em_estimado: true }))
  assert.equal(new Date((await pedidoDe(888001)).pago_em).toISOString(), '2020-01-01T12:00:00.000Z')
  await importar(payloadV2({ shopify_order_id: '888004', frete_titulo: 'Pacote econômico' }))
  assert.equal((await pedidoDe(888004)).frete_tipo, 'outro')
  await importar(payloadV2({ shopify_order_id: '888005', frete_titulo: 'PAC Mini' }))
  assert.equal((await pedidoDe(888005)).frete_tipo, 'PAC')
})

test('Shopify despachada antes da embalagem só avisa (uma vez), sem mover o pedido', async () => {
  await importar(payloadV2())
  await importar(payloadV2({ despachado: true }))
  await importar(payloadV2({ despachado: true }))
  const p = await pedidoDe(888001)
  assert.equal(p.status, 'novo')
  assert.equal(await eventos(p.id, 'shopify_alerta'), 1)
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

test('reiniciar do zero é recusado se já houve troca concluída (a etapa sozinha continua valendo)', async () => {
  const f = await fixture({ desconto: 20 })
  await one('select troca_aprovar($1, $2, $3, null)', [f.troca.id, f.pecas[0].id, 'credito'])
  await recusa(() => one('select reiniciar_pedido($1, $2, true)', [f.pedido.id, 'novo']), /troca concluída/)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  await one('select reiniciar_pedido($1, $2, false)', [f.pedido.id, 'bipagem'])
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
  await db.query("update pedidos set status = 'enviado' where id = $1", [g.pedido.id])
  await recusa(() => concluir(g), /enviado/)
  await recusa(() => one('select troca_aprovar($1, $2, $3, $4)', [g.troca.id, g.pecas[0].id, 'opcao', g.opcoes[0].id]), /enviado/)
  await db.exec('set local role anon')
  await recusa(() => one('select troca_escolher($1, $2, $3, $4)', [g.troca.token, g.itens[0].id, 'credito', null]), /não aceita/)
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

test('funções da vistoria: anon não executa nem lê as views', async () => {
  await db.exec('set local role anon')
  await recusa(() => one('select marcar_devolvido($1)', [zero]), /permission denied/)
  await recusa(() => one('select bipar_ajustar($1, 1)', [zero]), /permission denied/)
  await recusa(() => one('select reiniciar_pedido($1, $2, false)', [zero, 'novo']), /permission denied/)
  await recusa(() => one('select prazo_envio(now())'), /permission denied/)
  await recusa(() => one('select importar_pedido_shopify($1::jsonb)', ['{}']), /permission denied/)
  await recusa(() => one('select * from v_pedidos'), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => one('select importar_pedido_shopify($1::jsonb)', ['{}']), /permission denied/)
})

// ---- Cobertura da loja ("a loja cobre até R$ X da diferença") ----
// Fixture WhatsApp: 2 x 50 com R$ 20 de desconto => cliente pagou 80; opção a p vale 2*p*0,8 - 80 de diferença.
const num = v => Number(Number(v).toFixed(2))
const preco = (f, n, p) => db.query('update troca_opcoes set preco = $1 where id = $2', [p, f.opcoes[n].id])
const cobrir = (f, x) => db.query('update trocas set cobrir_ate = $1 where id = $2', [x, f.troca.id])
const resumo = f => one('select * from v_troca_resumo where troca_id = $1', [f.troca.id])

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

test('cobertura: troca cancelada não cobre; trava em troca concluída; anon não lê', async () => {
  const f = await fixture({ desconto: 20 })
  await preco(f, 0, 60)
  await cobrir(f, 10)
  await escolher(f)
  await concluir(f)
  assert.equal((await one('select status from trocas where id = $1', [f.troca.id])).status, 'concluida')
  await recusa(() => cobrir(f, 5), /não pode mudar numa troca concluída/)
  await recusa(() => one("update trocas set cobrir_ate = -1 where id = $1", [f.troca.id]), /check|não pode/)
  const g = await fixture({ desconto: 20 })
  await db.query("update trocas set status = 'cancelada' where id = $1", [g.troca.id])
  await recusa(() => cobrir(g, 5), /cancelada/)
  await db.exec('set local role anon')
  await recusa(() => one('select * from v_troca_resumo'), /permission denied/)
  await recusa(() => one('select * from v_pedido_acerto'), /permission denied/)
  await db.exec('set local role authenticated')
})

// ---- Falta parcial e carrinho da troca ----
async function itemQtd4() {
  const p = await one("insert into pedidos (origem, status, cliente_nome) values ('shopify', 'separacao', 'Cliente') returning *")
  const i = await one(`insert into pedido_itens (pedido_id, origem, shopify_variant_id, sku, nome, variante, foto_url, qtd, preco, preco_pago,
      shopify_line_id, ordem, status, conferido_em, etiquetado_em, etiqueta_previa, qtd_bipada, bipado_em)
    values ($1, 'shopify', 55, 'AN-4', 'Anel', '18', 'http://foto', 4, 50, 40, 'L1', 3, 'encontrado', now(), now(), true, 4, now()) returning *`, [p.id])
  await db.exec('set local role authenticated')
  return { p, i }
}

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

// Fixture WhatsApp com desconto 20 em 2 x 50: a cliente pagou 80 (fator 0,8). Opção A = 50 (unit 40), B = 25 (unit 20).
const opcaoB = async (f, n = 0, p = 25, sku = 'NOVO-B') =>
  one(`insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco, ordem) values ($1, 'clube', 'Brinco', $2, $3, 1) returning *`, [f.pecas[n].id, sku, p])
const carrinho = async (f, n, opcao, qtd) => {
  await db.exec('set local role anon')
  const r = (await one('select troca_carrinho($1, $2, $3, $4) as ok', [f.troca.token, f.itens[n].id, opcao, qtd])).ok
  await db.exec('set local role authenticated') // em erro, o rollback do savepoint de recusa() restaura o papel
  return r
}
const cart = (f, n = 0) => one('select * from v_troca_carrinho where troca_peca_id = $1', [f.pecas[n].id])

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

test('carrinho: anon só usa troca_carrinho, troca_escolher e troca_publica', async () => {
  const f = await fixture()
  await carrinho(f, 0, f.opcoes[0].id, 1)
  await db.exec('set local role anon')
  await one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[0].id, 'opcao', f.opcoes[0].id])
  assert.ok((await publica(f)).pecas[0].carrinho)
  await recusa(() => one('select * from troca_escolhas'), /permission denied/)
  await recusa(() => one('select * from v_troca_carrinho'), /permission denied/)
  await recusa(() => one('select troca_carrinho_definir($1, $2)', [f.pecas[0].id, f.opcoes[0].id]), /permission denied/)
  await recusa(() => one('select troca_aprovar_carrinho($1, $2)', [f.troca.id, f.pecas[0].id]), /permission denied/)
  await recusa(() => one('select troca_recalcular_escolha($1)', [f.pecas[0].id]), /permission denied/)
  await recusa(() => db.query('delete from troca_escolhas'), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => db.query('delete from troca_escolhas'), /permission denied/)
  await recusa(() => db.query('insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values ($1, $2, 1)', [f.pecas[0].id, f.opcoes[0].id]), /permission denied/)
})

// ---- Venda somada a um pedido ----
// Principal pago (2 x 50, desconto de 10 => total 90 + frete 0) e venda de 2 peças (30 + 20, desconto 5).
async function somaFixture({ principal = {}, venda = {} } = {}) {
  const p = await one(`insert into pedidos (origem, status, cliente_nome, desconto_tipo, desconto_valor, forma_pagamento, valor_pago, pago_em, numero)
    values ($1, $2, 'Nathália', 'valor', 10, 'Cartão', 90, now(), 'ARV-1') returning *`, [principal.origem ?? 'whatsapp', principal.status ?? 'separacao'])
  await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem, status)
    values ($1, 'clube', 'Anel', 'AN', 2, 50, 1, 'encontrado')`, [p.id])
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

test('somar_venda: peças vão para o principal como adicionais, venda vira somada e o total do principal não muda', async () => {
  const { p, w, i1 } = await somaFixture()
  const antes = await one('select total, subtotal, desconto, total_geral, valor_somado from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(antes.total), num(antes.subtotal), num(antes.valor_somado), num(antes.total_geral)], [90, 100, 0, 90])
  await one("select somar_venda($1, 'Cartão', 40, '2026-11-11T14:32:00Z')", [w.id])
  const venda = await one('select status, forma_pagamento, valor_pago, somada_valor, somada_em, pago_em, fase from pedidos p join (select id, fase from v_pedidos) v using (id) where id = $1', [w.id])
  assert.deepEqual([venda.status, venda.forma_pagamento, num(venda.valor_pago), num(venda.somada_valor), venda.fase], ['somada', 'Cartão', 40, 45, 'arquivo'])
  assert.ok(venda.somada_em)
  assert.equal(new Date(venda.pago_em).toISOString(), '2026-11-11T14:32:00.000Z')
  const itens = (await db.query("select * from pedido_itens where pedido_id = $1 order by ordem", [p.id])).rows
  assert.equal(itens.length, 3)
  assert.deepEqual(itens.map(i => [i.sku, i.adicional, i.ordem]), [['AN', false, 1], ['BR', true, 2], ['CO', true, 3]])
  // preço com o desconto da venda: 45/50 = 0.9
  assert.deepEqual([num(itens[1].preco_pago), num(itens[2].preco_pago)], [27, 18])
  assert.equal(itens[1].venda_origem_id, w.id)
  // a peça removida fica na venda
  const sobra = (await db.query('select sku, status from pedido_itens where pedido_id = $1', [w.id])).rows
  assert.deepEqual(sobra.map(r => [r.sku, r.status]), [['PU', 'removido']])
  const dep = await one('select * from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(dep.total), num(dep.subtotal), num(dep.desconto), num(dep.valor_somado), num(dep.valor_pago_somado), num(dep.total_geral)], [90, 100, 10, 45, 40, 135])
  assert.equal(dep.qtd_pecas, 4)
  assert.equal(dep.qtd_adicionais, 2)
  assert.equal(dep.partes.length, 1)
  assert.deepEqual([dep.partes[0].numero, dep.partes[0].forma_pagamento, num(dep.partes[0].valor_pago), num(dep.partes[0].somada_valor), dep.partes[0].qtd_pecas], [venda.numero ?? w.numero, 'Cartão', 40, 45, 2])
  assert.equal(dep.partes[0].id, w.id)
  // total pago = pagamento do principal + o da venda; a venda sabe o número do principal
  assert.equal(num(dep.total_pago), num(Number(p.valor_pago ?? 0) + 40))
  assert.equal((await one('select somada_a_numero from v_pedidos where id = $1', [w.id])).somada_a_numero, p.numero)
  assert.equal(i1.id, itens[1].id)
  // eventos nos dois pedidos
  assert.equal((await one("select count(*)::int n from pedido_eventos where tipo = 'venda_somada' and pedido_id = any($1)", [[p.id, w.id]])).n, 2)
  // o principal já estava na separação: continua
  assert.equal(dep.status, 'separacao')
  // venda somada não pode ser somada de novo
  await recusa(() => one("select somar_venda($1, 'Pix', 1, now())", [w.id]), /já foi somada/)
})

test('somar_venda: principal na conferência ou depois volta para a separação', async () => {
  for (const st of ['conferencia', 'etiquetagem', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio']) {
    const { p, w } = await somaFixture({ principal: { status: st } })
    await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
    assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'separacao', st)
    await db.exec('reset role')
  }
  const { p, w } = await somaFixture({ principal: { status: 'novo' } })
  await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
  assert.equal((await one('select status from pedidos where id = $1', [p.id])).status, 'novo')
})

test('somar_venda: recusas', async () => {
  const f = await somaFixture()
  await db.exec('reset role')
  await db.query('update pedidos set somar_em = null where id = $1', [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /Escolha o pedido/)
  await db.exec('reset role')
  await db.query('update pedidos set somar_em = $2 where id = $1', [f.w.id, f.p.id])
  for (const st of ['enviado', 'cancelado', 'perdida', 'somada', 'em_aberto']) {
    await db.query('update pedidos set status = $2 where id = $1', [f.p.id, st])
    await db.exec('set local role authenticated')
    await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /não aceita mais peças/)
    await db.exec('reset role')
  }
  await db.query("update pedidos set status = 'separacao' where id = $1", [f.p.id])
  await db.query("update pedidos set status = 'novo' where id = $1", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /não está aberta/)
  await db.exec('reset role')
  await db.query("update pedidos set status = 'em_aberto' where id = $1", [f.w.id])
  await db.query("update pedido_itens set preco = null where pedido_id = $1 and sku = 'BR'", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /sem preço/)
  await db.exec('reset role')
  await db.query("update pedido_itens set preco = 30 where pedido_id = $1 and sku = 'BR'", [f.w.id])
  await db.query("update pedido_itens set status = 'removido' where pedido_id = $1", [f.w.id])
  await db.exec('set local role authenticated')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /nenhuma peça/)
  await recusa(() => one("select somar_venda($1, '', 40, now())", [f.w.id]), /forma de pagamento/)
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.p.id]), /não está aberta/)
  await db.exec('set local role anon')
  await recusa(() => one("select somar_venda($1, 'Pix', 40, now())", [f.w.id]), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => db.query('update pedidos set somar_em = id where id = $1', [f.w.id]), /pedidos_somar_em_outro/)
})

test('somar_venda: Pix da venda entra no valor somado e o principal da Shopify mantém o total', async () => {
  const { p, w } = await somaFixture({ principal: { origem: 'shopify' } })
  await db.exec('reset role')
  await db.query("update pedidos set valor_total = 90, shopify_order_id = 9300 where id = $1", [p.id])
  await db.query("update pedido_itens set preco_pago = 45, origem = 'shopify' where pedido_id = $1", [p.id])
  await db.exec('set local role authenticated')
  const antes = await one('select total, desconto from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(antes.total), num(antes.desconto)], [90, 10])
  await one("select somar_venda($1, 'Pix', 40, now())", [w.id])
  // Pix: 10% de 50 = 5 somado ao desconto de 5 => 40
  assert.equal(num((await one('select somada_valor from pedidos where id = $1', [w.id])).somada_valor), 40)
  const dep = await one('select total, subtotal, desconto, valor_somado, total_geral, valor_pecas_com_desconto from v_pedidos where id = $1', [p.id])
  assert.deepEqual([num(dep.total), num(dep.subtotal), num(dep.desconto), num(dep.valor_somado), num(dep.total_geral), num(dep.valor_pecas_com_desconto)], [90, 100, 10, 40, 130, 90])
  // O importador da Shopify ignora as adicionais (preço pago e checagem de alteração).
  await db.exec('reset role')
  await db.query("update pedido_itens set origem = 'shopify' where pedido_id = $1 and adicional", [p.id])
  await db.query("update pedido_itens set shopify_variant_id = 5, shopify_line_id = 'L1' where pedido_id = $1 and not adicional", [p.id])
  await one(`select importar_pedido_shopify($1::jsonb)`, [JSON.stringify({
    shopify_order_id: 9300, numero: '#9300', valor_total: 90,
    itens: [{ shopify_variant_id: 5, shopify_line_id: 'L1', sku: 'AN', nome: 'Anel', qtd: 2, preco: 50, preco_pago: 45 }] })])
  assert.equal((await one("select count(*)::int n from pedido_eventos where pedido_id = $1 and tipo = 'shopify_alterado'", [p.id])).n, 0)
  assert.deepEqual((await db.query('select round(preco_pago,2) num_pago from pedido_itens where pedido_id = $1 order by ordem', [p.id])).rows.map(r => num(r.num_pago)), [45, 24, 16])
})

test('romaneio_publico: venda somada aponta o principal e o principal lista as adicionais à parte', async () => {
  const { p, w } = await somaFixture()
  await one("select somar_venda($1, 'Cartão', 45, now())", [w.id])
  const rp = (await one('select romaneio_publico($1) d', [(await one('select token_publico from pedidos where id = $1', [p.id])).token_publico])).d
  assert.equal(rp.itens.length, 1)
  assert.equal(rp.adicionais.length, 2)
  assert.deepEqual([num(rp.total), num(rp.valor_somado), num(rp.total_geral)], [90, 45, 135])
  const rw = (await one('select romaneio_publico($1) d', [(await one('select token_publico from pedidos where id = $1', [w.id])).token_publico])).d
  assert.deepEqual([rw.somada_a, rw.status, rw.itens.length], ['ARV-1', 'somada', 0])
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

await preparar()
let falhas = 0
try {
  for (const { nome, executar } of casos) {
    await db.exec('begin')
    try {
      await executar()
      console.log(`OK: ${nome}`)
    } catch (e) {
      falhas++
      console.error(`FALHOU: ${nome}\n${e.stack}`)
    } finally {
      await db.exec('rollback')
    }
  }
} finally {
  await db.close()
}
console.log(`${casos.length - falhas}/${casos.length} testes passaram`)
if (falhas) process.exitCode = 1
