import assert from 'node:assert/strict'
import { test } from 'vitest'
import { criarBanco, db, one } from './suporte.mjs'
import { DADOS_COMPLETOS, pedidoWhats, recusa } from './fixtures.mjs'

// Embalagem e Frete viram uma etapa só (status 'embalagem', "Embalagem e frete"). O pedido vai para a Postagem quando
// embalado_em E frete_gerado_em estão preenchidos, em qualquer ordem. 'frete' deixou de ser etapa.
const status = async (id) => (await one('select status from pedidos where id=$1', [id])).status
const entrar = () => db.exec('set local role authenticated')

test('Embalagem e frete: embalar primeiro e gerar o frete depois leva à Postagem só com os dois', async () => {
  const p = await pedidoWhats('embalagem')
  await entrar()
  await db.query('update pedidos set embalado_em=now() where id=$1', [p.id])
  assert.equal(await status(p.id), 'embalagem', 'só a embalagem: o pedido continua na etapa')
  await db.query("update pedidos set frete_gerado_em=now(),frete_servico='PAC' where id=$1", [p.id])
  assert.equal(await status(p.id), 'pronto_envio', 'os dois feitos: avança sozinho')
})

test('Embalagem e frete: gerar o frete primeiro e embalar depois também leva à Postagem só com os dois', async () => {
  const p = await pedidoWhats('embalagem')
  await entrar()
  await db.query('update pedidos set frete_gerado_em=now() where id=$1', [p.id])
  assert.equal(await status(p.id), 'embalagem', 'só o frete: o pedido continua na etapa')
  await db.query('update pedidos set embalado_em=now() where id=$1', [p.id])
  assert.equal(await status(p.id), 'pronto_envio')
})

test('Embalagem e frete: os dois na mesma gravação avançam; desfazer um deles na Postagem volta para a etapa', async () => {
  const p = await pedidoWhats('embalagem')
  await entrar()
  await db.query('update pedidos set embalado_em=now(),frete_gerado_em=now() where id=$1', [p.id])
  assert.equal(await status(p.id), 'pronto_envio')
  await db.query('update pedidos set embalado_em=null where id=$1', [p.id])
  assert.equal(await status(p.id), 'embalagem')
  await db.query('update pedidos set embalado_em=now() where id=$1', [p.id])
  assert.equal(await status(p.id), 'pronto_envio', 'refazer o que faltava leva de novo')
})

test('regras_etapas: a Postagem exige embalagem E frete; estar na Embalagem e frete não exige embalado; frete não é destino', async () => {
  const base = { status: 'embalagem', linhas: 1, pecas: 1, encontradas: 1, conferidas: 1, bipadas: 1, nota: 'x', fornecedor: 'x' }
  const regras = async (extra) => (await one('select regras_etapas($1::jsonb) r', [JSON.stringify({ ...base, ...extra })])).r
  assert.match((await regras({ embalado: 'x' })).pronto_envio, /Gere o frete/)
  const soFrete = await regras({ frete: 'x' })
  assert.match(soFrete.pronto_envio, /Confirme a embalagem/)
  assert.equal(soFrete.embalagem, null, 'estar na Embalagem e frete não exige embalado')
  assert.equal((await regras({ embalado: 'x', frete: 'x' })).pronto_envio, null)
  assert.match((await regras({ embalado: 'x', frete: 'x', acerto: true })).pronto_envio, /acertos/)
  assert.ok(!('frete' in soFrete), "'frete' deixou de ser destino")
})

test("Embalagem e frete: 'frete' não é mais etapa (nem para o pedido, nem para quem faz a etapa)", async () => {
  const p = await pedidoWhats('embalagem')
  await recusa(() => db.query("update pedidos set status='frete' where id=$1", [p.id]), /Etapa inválida/)
  await entrar()
  await recusa(() => one("select mover_etapa($1,'frete')", [p.id]), /Etapa inválida/)
  const ana = (await one("insert into equipe(nome) values('Ana') returning id")).id
  await recusa(() => one("select designar($1,'frete',$2)", [p.id, ana]), /Etapa inválida/)
  await one("select designar($1,'embalagem',$2)", [p.id, ana])
  assert.deepEqual((await one('select responsaveis r from pedidos where id=$1', [p.id])).r, { embalagem: ana })
})

test('Embalagem e frete: mover_etapa passa por cima da etapa única e marca os dois documentos', async () => {
  const p = await pedidoWhats('faturamento')
  await entrar()
  assert.equal(await one("select mover_etapa($1,'embalagem')", [p.id]).then((r) => r.mover_etapa), 'embalagem')
  const a = await one('select embalado_em, frete_gerado_em from pedidos where id=$1', [p.id])
  assert.equal(a.embalado_em, null); assert.equal(a.frete_gerado_em, null)
  await one("select mover_etapa($1,'pronto_envio')", [p.id])
  const b = await one('select status, embalado_em, frete_gerado_em from pedidos where id=$1', [p.id])
  assert.equal(b.status, 'pronto_envio')
  assert.ok(b.embalado_em); assert.ok(b.frete_gerado_em)
  const textos = (await db.query("select texto from pedido_eventos where pedido_id=$1 and tipo='etapas_puladas' order by id", [p.id])).rows.map((r) => r.texto)
  assert.deepEqual(textos, ['Marcado como feito ao mover: Nota fiscal', 'Marcado como feito ao mover: Embalagem e frete'])
  // Voltar para a Embalagem e frete limpa a embalagem e o frete (a etapa é refeita inteira); a nota fica.
  await one("select mover_etapa($1,'embalagem')", [p.id])
  const c = await one('select status, nf_emitida_em, embalado_em, frete_gerado_em, frete_peso_g from pedidos where id=$1', [p.id])
  assert.equal(c.status, 'embalagem')
  assert.ok(c.nf_emitida_em)
  assert.equal(c.embalado_em, null); assert.equal(c.frete_gerado_em, null); assert.equal(c.frete_peso_g, null)
})

test('Embalagem e frete: peças completas de novo pulam os documentos já feitos até a Postagem (ou param na Embalagem e frete)', async () => {
  for (const [docs, esperado] of [
    ['', 'faturamento'],
    ['nf_emitida_em=now(),pedido_fornecedor_em=now()', 'embalagem'],
    ['nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now()', 'embalagem'],
    ['nf_emitida_em=now(),pedido_fornecedor_em=now(),frete_gerado_em=now()', 'embalagem'],
    ['nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now(),frete_gerado_em=now()', 'pronto_envio'],
  ]) {
    const p = await pedidoWhats('bipagem')
    if (docs) await db.query(`update pedidos set ${docs} where id=$1`, [p.id])
    await db.query('update pedido_itens set qtd_bipada=qtd,bipado_em=now() where pedido_id=$1', [p.id])
    await db.query('select avancar_pecas($1)', [p.id])
    assert.equal(await status(p.id), esperado, docs || 'sem documentos')
  }
})

// A migration leva o pedido que estava em Frete para a Embalagem e frete (a embalagem já feita continua marcada) e junta
// o responsável do Frete ao da Embalagem e frete, sem mexer em status_desde nem escrever histórico.
test('migração: pedido em Frete vai para Embalagem e frete, com a embalagem feita e o responsável preservado', async () => {
  const ids = {}
  const b = await criarBanco({
    antesDe: '20261125130000',
    prepararAntes: async (banco) => {
      const q = async (sql, a = []) => (await banco.query(sql, a)).rows[0]
      const ana = (await q("insert into equipe(nome) values('Ana') returning id")).id
      const bia = (await q("insert into equipe(nome) values('Bia') returning id")).id
      const novo = async (nome, status, resp) => {
        const p = await q(`insert into pedidos(origem,status,cliente_nome,numero) values ('whatsapp','em_aberto',$1,$1) returning id`, [nome])
        const cols = Object.keys(DADOS_COMPLETOS)
        await banco.query(`update pedidos set ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')} where id=$1`, [p.id, ...cols.map((c) => DADOS_COMPLETOS[c])])
        await banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values ($1,'avulso','Anel','A1',1,10)`, [p.id])
        await banco.query(`update pedidos set status='novo',pago_em=now(),valor_pago=10,forma_pagamento='Pix' where id=$1`, [p.id])
        await banco.query(`update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=1 where pedido_id=$1`, [p.id])
        await banco.query(`update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now() where id=$1`, [p.id])
        await banco.query(`update pedidos set status=$2, responsaveis=$3::jsonb where id=$1`, [p.id, status, JSON.stringify(resp)])
        await banco.query(`update pedidos set status_desde=now() - interval '7 days' where id=$1`, [p.id])
        return p.id
      }
      ids.frete = await novo('Em Frete', 'frete', { frete: ana })
      ids.freteDois = await novo('Em Frete com dois responsáveis', 'frete', { frete: ana, embalagem: bia })
      ids.embalagem = await novo('Em Embalagem', 'embalagem', { embalagem: bia })
      ids.ana = ana; ids.bia = bia
    },
  })
  try {
    const ler = async (id) => (await b.query('select status, embalado_em, status_desde < now() - interval \'6 days\' as antigo, responsaveis r from pedidos where id=$1', [id])).rows[0]
    const a = await ler(ids.frete)
    assert.equal(a.status, 'embalagem')
    assert.ok(a.embalado_em, 'a embalagem já feita continua marcada: só falta o frete')
    assert.equal(a.antigo, true, 'o tempo na etapa não recomeça')
    assert.deepEqual(a.r, { embalagem: ids.ana }, 'o responsável do Frete vira o da Embalagem e frete')
    const c = await ler(ids.freteDois)
    assert.equal(c.status, 'embalagem')
    assert.deepEqual(c.r, { embalagem: ids.bia }, 'já havia responsável na Embalagem e frete: ele fica')
    assert.equal((await ler(ids.embalagem)).status, 'embalagem')
    assert.equal((await b.query("select count(*)::int n from pedidos where status='frete'")).rows[0].n, 0)
    assert.equal((await b.query("select count(*)::int n from pedido_eventos where pedido_id=$1 and para='embalagem'", [ids.frete])).rows[0].n, 0, 'sem histórico novo')
    // A etapa já é a nova: o frete gerado leva o pedido migrado para a Postagem.
    await b.query('update pedidos set frete_gerado_em=now() where id=$1', [ids.frete])
    assert.equal((await ler(ids.frete)).status, 'pronto_envio')
  } finally { await b.close() }
})
