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
    create table storage.buckets (id text primary key, name text, public boolean);
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
