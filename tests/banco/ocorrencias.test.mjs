import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa } from './fixtures.mjs'

// Fase 3 (20261126130000): quem fez cada passo da peça e as ocorrências (erro na bipagem, falta indevida, problema na entrega).
// Regra: "quem fez" = responsável da etapa no pedido; sem responsável, quem clicou (autor_da_etapa).

const UG = '33333333-3333-4333-8333-333333333333'
const UA = '11111111-1111-4111-8111-111111111111'
const UB = '22222222-2222-4222-8222-222222222222'

const membro = async (nome, papel, user_id, email = null) =>
  (await one('insert into equipe (nome, papel, user_id, email) values ($1,$2,$3,$4) returning id', [nome, papel, user_id, email])).id
const como = async (sub) => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({ role: 'authenticated', sub })}',true)`)
  await db.exec('set local role authenticated')
}
const sistema = async () => { await db.exec('reset role'); await db.exec("select set_config('request.jwt.claims','',true)"); await db.exec('set local role authenticated') }
const lote = (p, marcas) => one('select marcar_pecas($1,$2::jsonb) r', [p, JSON.stringify(marcas)])
const itens = async (pedido) => (await db.query('select * from pedido_itens where pedido_id=$1 order by ordem', [pedido])).rows
const resp = (id, r) => db.query('update pedidos set responsaveis=$2::jsonb where id=$1', [id, JSON.stringify(r)])
const status = async (id) => (await one('select status from pedidos where id=$1', [id])).status
const ocorrencias = async (pedido) => (await db.query('select * from ocorrencias where pedido_id=$1 order by created_at, id', [pedido])).rows

async function cenario() {
  const g = await membro('Gestora', 'gestor', UG)
  const ana = await membro('Ana', 'funcionaria', UA)
  const bia = await membro('Bia', 'funcionaria', UB)
  return { g, ana, bia }
}

// Pedido com as duas peças separadas e conferidas: está na Bipagem.
async function naBipagem(responsaveis) {
  const p = await pedidoWhats('separacao')
  await resp(p.id, responsaveis)
  await como(UG)
  const [a, b] = await itens(p.id)
  await lote(p.id, [a, b].flatMap((i) => [{ item: i.id, campo: 'status', valor: 'encontrado' }, { item: i.id, campo: 'conferida', valor: true }]))
  assert.equal(await status(p.id), 'bipagem')
  return { p, a, b }
}

test('autor_da_etapa: o responsável da etapa; sem responsável, quem clicou; sem pessoa, ninguém', async () => {
  const { g, ana } = await cenario()
  const p = await pedidoWhats('separacao')
  await resp(p.id, { separacao: ana })
  await como(UG)
  assert.equal((await one("select autor_da_etapa($1,'separacao') a", [p.id])).a, ana, 'o responsável vale mesmo com a gestora clicando')
  assert.equal((await one("select autor_da_etapa($1,'conferencia') a", [p.id])).a, g, 'sem responsável vale quem clicou')
  await como(UA)
  assert.equal((await one("select autor_da_etapa($1,'conferencia') a", [p.id])).a, ana)
  await sistema()
  assert.equal((await one("select autor_da_etapa($1,'conferencia') a", [p.id])).a, null, 'cron e gatilhos não têm autor')
  await db.exec('reset role')
  await db.query("update equipe set ativo=false where id=$1", [ana])
  assert.equal((await one("select autor_da_etapa($1,'separacao') a", [p.id])).a, ana, 'quem era responsável continua sendo')
})

test('o lote grava separado_por, conferido_por e bipado_por com o autor da etapa e limpa quando o passo é desfeito', async () => {
  const { g, ana, bia } = await cenario()
  const p = await pedidoWhats('separacao')
  await resp(p.id, { separacao: ana, conferencia: bia }) // bipagem sem responsável: vale a gestora que clica
  await como(UG)
  const [a, b] = await itens(p.id)
  await lote(p.id, [{ item: a.id, campo: 'status', valor: 'encontrado' }])
  let [x, y] = await itens(p.id)
  assert.deepEqual([x.separado_por, x.conferido_por, x.bipado_por], [ana, null, null])
  assert.deepEqual([y.separado_por, y.conferido_por, y.bipado_por], [null, null, null])
  await lote(p.id, [{ item: a.id, campo: 'conferida', valor: true }, { item: b.id, campo: 'status', valor: 'encontrado' }, { item: b.id, campo: 'conferida', valor: true }])
  await lote(p.id, [{ item: a.id, campo: 'bipada', valor: 1 }])
  ;[x, y] = await itens(p.id)
  assert.deepEqual([x.separado_por, x.conferido_por, x.bipado_por], [ana, bia, g])
  assert.deepEqual([y.separado_por, y.conferido_por, y.bipado_por], [ana, bia, null])
  const r = (await lote(p.id, [{ item: a.id, campo: 'bipada', valor: 1 }])).r
  assert.equal(r.itens[0].bipado_por, g, 'a resposta do lote traz os autores')
  // Desfazer a conferência limpa conferência e bipagem; desfazer a separação limpa tudo da peça.
  await lote(p.id, [{ item: a.id, campo: 'conferida', valor: false }])
  ;[x] = await itens(p.id)
  assert.deepEqual([x.separado_por, x.conferido_por, x.bipado_por, x.qtd_bipada], [ana, null, null, 0])
  await lote(p.id, [{ item: b.id, campo: 'status', valor: 'pendente' }])
  ;[, y] = await itens(p.id)
  assert.deepEqual([y.status, y.separado_por, y.conferido_por, y.bipado_por], ['pendente', null, null, null])
})

test('mover o pedido para trás também limpa os autores (o gatilho acompanha o passo desfeito)', async () => {
  const { ana } = await cenario()
  const { p } = await naBipagem({ separacao: ana })
  assert.ok((await itens(p.id)).every((i) => i.separado_por === ana && i.conferido_por))
  await one("select mover_etapa($1,'conferencia')", [p.id])
  assert.ok((await itens(p.id)).every((i) => i.separado_por === ana && i.conferido_por === null), 'voltar à conferência desfaz a conferência')
  await one("select mover_etapa($1,'separacao')", [p.id])
  assert.ok((await itens(p.id)).every((i) => i.separado_por === null))
})

test('erro na bipagem: a peça volta, o pedido volta para a Separação e a ocorrência fica com a separadora', async () => {
  const { g, ana, bia } = await cenario()
  const { p, a, b } = await naBipagem({ separacao: ana, conferencia: bia })
  const id = (await one("select registrar_erro_bipagem($1,'peca_incorreta') id", [a.id])).id
  assert.equal(await status(p.id), 'separacao', 'o pedido volta sozinho')
  const [x, y] = await itens(p.id)
  assert.deepEqual([x.status, x.conferido_em, x.etiquetado_em, x.qtd_bipada, x.bipado_em, x.separado_por, x.conferido_por], ['pendente', null, null, 0, null, null, null])
  assert.ok(y.status === 'encontrado' && y.conferido_em && y.separado_por === ana, 'a outra peça segue como estava')
  const [o] = await ocorrencias(p.id)
  assert.equal(o.id, id)
  assert.deepEqual([o.tipo, o.motivo, o.etapa, o.item_id, o.responsavel_id, o.conferente_id, o.registrado_por, o.anulada_em],
    ['erro_bipagem', 'peca_incorreta', 'separacao', a.id, ana, bia, g, null])
  const v = await one('select responsavel_nome, conferente_nome, registrado_por_nome, sku from v_ocorrencias where id=$1', [id])
  assert.deepEqual(v, { responsavel_nome: 'Ana', conferente_nome: 'Bia', registrado_por_nome: 'Gestora', sku: 'A1' })
  const ev = await one("select texto from pedido_eventos where pedido_id=$1 and tipo='nota'", [p.id])
  assert.match(ev.texto, /Erro na peça \(peça incorreta\).*A1.*Separada por Ana/)
  assert.ok(b)
})

test('erro na bipagem: responsável editável, "outro" exige texto, motivo inválido e peça fora do passo são recusados', async () => {
  const { ana, bia } = await cenario()
  const { p, a, b } = await naBipagem({ separacao: ana })
  await recusa(() => one("select registrar_erro_bipagem($1,'outro')", [a.id]), /Conte o que aconteceu/)
  await recusa(() => one("select registrar_erro_bipagem($1,'outro','   ')", [a.id]), /Conte o que aconteceu/)
  await recusa(() => one("select registrar_erro_bipagem($1,'bobagem')", [a.id]), /Escolha o motivo/)
  await recusa(() => one("select registrar_erro_bipagem($1,'peca_suja',null,$2)", [a.id, '99999999-9999-4999-8999-999999999999']), /Pessoa não encontrada/)
  const id = (await one("select registrar_erro_bipagem($1,'outro','faltou o fecho',$2) id", [b.id, bia])).id
  const o = await one('select responsavel_id, observacao, motivo from ocorrencias where id=$1', [id])
  assert.deepEqual(o, { responsavel_id: bia, observacao: 'faltou o fecho', motivo: 'outro' })
  await recusa(() => one("select registrar_erro_bipagem($1,'peca_suja')", [b.id]), /Só uma peça já separada/)
  assert.equal(await status(p.id), 'separacao')
})

test('erro na bipagem só vale até a Bipagem (depois o pedido precisa voltar de etapa antes)', async () => {
  const { ana } = await cenario()
  const { p, a, b } = await naBipagem({ separacao: ana })
  await lote(p.id, [a, b].map((i) => ({ item: i.id, campo: 'bipada', valor: 1 })))
  assert.equal(await status(p.id), 'faturamento')
  await recusa(() => one("select registrar_erro_bipagem($1,'peca_suja')", [a.id]), /se registra na Bipagem/)
})

test('falta indevida: a mesma pessoa que marcou e achou não gera ocorrência; outra pessoa gera, em nome de quem marcou', async () => {
  const { ana, bia } = await cenario()
  const p = await pedidoWhats('separacao')
  await resp(p.id, { separacao: ana })
  await como(UG)
  const [a, b] = await itens(p.id)
  await one('select marcar_falta($1,1)', [a.id])
  assert.equal((await itens(p.id))[0].falta_por, ana, 'quem marcou a falta é a responsável da separação')
  assert.equal(await status(p.id), 'separacao', 'a outra peça ainda está pendente')
  await one('select encontrar_peca($1)', [a.id])
  assert.equal((await ocorrencias(p.id)).length, 0, 'mesma responsável: sem ocorrência')
  let [x] = await itens(p.id)
  assert.deepEqual([x.status, x.falta_por, x.separado_por], ['encontrado', null, ana])

  // Agora a separação passa para a Bia: quem acha é outra pessoa.
  await lote(p.id, [{ item: a.id, campo: 'status', valor: 'pendente' }])
  await one('select marcar_falta($1,1,$2)', [a.id, 'defeito'])
  ;[x] = await itens(p.id)
  assert.deepEqual([x.status, x.falta_por], ['defeito', ana])
  await db.exec('reset role')
  await resp(p.id, { separacao: bia })
  await como(UG)
  await one('select encontrar_peca($1)', [a.id])
  const os = await ocorrencias(p.id)
  assert.equal(os.length, 1)
  assert.deepEqual([os[0].tipo, os[0].motivo, os[0].item_id, os[0].responsavel_id, os[0].etapa], ['falta_indevida', 'peca_encontrada', a.id, ana, 'separacao'])
  ;[x] = await itens(p.id)
  assert.deepEqual([x.status, x.falta_por, x.separado_por], ['encontrado', null, bia])
  assert.ok(b)
})

test('falta indevida por alterar_item direto e falta parcial: o autor vai para a linha que ficou em falta', async () => {
  const { ana, bia } = await cenario()
  const p = await pedidoWhats('separacao')
  await db.exec('reset role')
  await db.query('update pedido_itens set qtd=3 where pedido_id=$1 and sku=$2', [p.id, 'A1'])
  await resp(p.id, { separacao: ana })
  await como(UG)
  const [a] = await itens(p.id)
  const novo = (await one('select marcar_falta($1,2) id', [a.id])).id
  const linhas = await itens(p.id)
  const resto = linhas.find((i) => i.id === a.id)
  const falta = linhas.find((i) => i.id === novo)
  assert.deepEqual([resto.qtd, resto.status, resto.falta_por], [1, 'pendente', null])
  assert.deepEqual([falta.qtd, falta.status, falta.falta_por], [2, 'falta', ana])
  await db.exec('reset role')
  await resp(p.id, { separacao: bia })
  await como(UG)
  await one('select alterar_item($1,$2::jsonb)', [novo, JSON.stringify({ status: 'encontrado' })])
  const os = await ocorrencias(p.id)
  assert.deepEqual(os.map((o) => [o.tipo, o.responsavel_id, o.item_id]), [['falta_indevida', ana, novo]])
})

test('sem responsável nenhum, quem clica é sempre o mesmo e a falta achada não vira ocorrência; chamada direta da função não grava', async () => {
  await cenario()
  const p = await pedidoWhats('separacao')
  await como(UG)
  const [a] = await itens(p.id)
  await one('select marcar_falta($1,1)', [a.id])
  await one('select encontrar_peca($1)', [a.id])
  assert.equal((await ocorrencias(p.id)).length, 0)
  await one("select alterar_item($1,$2::jsonb)", [a.id, JSON.stringify({ status: 'falta' })])
  await one('select registrar_falta_indevida($1)', [a.id])
  assert.equal((await ocorrencias(p.id)).length, 0, 'sem a marca da transação a função não faz nada')
})

async function concluido(responsaveis = {}) {
  await db.exec('reset role')
  const p = await pedidoWhats('enviado')
  await resp(p.id, responsaveis)
  return p
}

test('problema na entrega: só pedido concluído; motivo escolhe a etapa; responsável vem sugerido e é editável', async () => {
  const { g, ana, bia } = await cenario()
  const aberto = await pedidoWhats('bipagem')
  await como(UG)
  await recusa(() => one("select registrar_problema_entrega($1,'nota_errada')", [aberto.id]), /só vale para pedido concluído/)
  await db.exec('reset role')
  const p = await concluido({ faturamento: ana, embalagem: bia })
  await db.query('update pedido_itens set bipado_por=$2, qtd_bipada=qtd where pedido_id=$1', [p.id, g])
  await como(UG)
  const [a] = await itens(p.id)
  // Sugestão por etapa.
  assert.equal((await one("select responsavel_sugerido($1,'faturamento') r", [p.id])).r, ana)
  assert.equal((await one("select responsavel_sugerido($1,'embalagem') r", [p.id])).r, bia)
  assert.equal((await one("select responsavel_sugerido($1,'bipagem',$2) r", [p.id, a.id])).r, g, 'a peça tem o autor da bipagem')
  // Etapa e responsável vêm do motivo.
  const i1 = (await one("select registrar_problema_entrega($1,'nota_errada') id", [p.id])).id
  const i2 = (await one("select registrar_problema_entrega($1,'endereco_errado') id", [p.id])).id
  const i3 = (await one("select registrar_problema_entrega($1,'peca_suja','bipagem',$2,$3,'veio manchada') id", [p.id, g, a.id])).id
  const i4 = (await one("select registrar_problema_entrega($1,'envio_errado',null,$2) id", [p.id, ana])).id
  const por = async (id) => one('select tipo, motivo, etapa, responsavel_id, item_id, observacao from ocorrencias where id=$1', [id])
  assert.deepEqual(await por(i1), { tipo: 'problema_entrega', motivo: 'nota_errada', etapa: 'faturamento', responsavel_id: ana, item_id: null, observacao: null })
  assert.deepEqual(await por(i2), { tipo: 'problema_entrega', motivo: 'endereco_errado', etapa: 'embalagem', responsavel_id: bia, item_id: null, observacao: null })
  assert.deepEqual(await por(i3), { tipo: 'problema_entrega', motivo: 'peca_suja', etapa: 'bipagem', responsavel_id: g, item_id: a.id, observacao: 'veio manchada' })
  assert.equal((await por(i4)).responsavel_id, ana, 'o responsável escolhido vale no lugar do sugerido')
  const sugeridas = (await db.query("select m, etapa_da_ocorrencia(m) e from unnest(array['peca_errada','quantidade_errada','peca_defeito','peca_suja','nota_errada','endereco_errado','envio_errado','outro']) m")).rows
  assert.deepEqual(sugeridas.map((r) => r.e), ['bipagem', 'bipagem', 'bipagem', 'bipagem', 'faturamento', 'embalagem', 'embalagem', null])
})

test('problema na entrega: "outro" pede etapa e texto; etapa, motivo e peça de outro pedido são recusados', async () => {
  const { ana } = await cenario()
  const p = await concluido({ conferencia: ana })
  const outro = await pedidoWhats('separacao')
  await como(UG)
  const [fora] = await itens(outro.id)
  await recusa(() => one("select registrar_problema_entrega($1,'outro','conferencia',null,null,'  ')", [p.id]), /Conte o que aconteceu/)
  await recusa(() => one("select registrar_problema_entrega($1,'outro',null,null,null,'algo')", [p.id]), /Escolha a etapa/)
  await recusa(() => one("select registrar_problema_entrega($1,'peca_suja','novo')", [p.id]), /Etapa inválida/)
  await recusa(() => one("select registrar_problema_entrega($1,'xis')", [p.id]), /Escolha o motivo/)
  await recusa(() => one("select registrar_problema_entrega($1,'peca_suja','bipagem',null,$2)", [p.id, fora.id]), /não pertence/)
  const id = (await one("select registrar_problema_entrega($1,'outro','conferencia',null,null,'cor diferente') id", [p.id])).id
  assert.equal((await one('select responsavel_id from ocorrencias where id=$1', [id])).responsavel_id, ana, 'sem escolha, vale o sugerido da etapa')
  const hist = await one("select texto from pedido_eventos where pedido_id=$1 and tipo='nota'", [p.id])
  assert.match(hist.texto, /Problema na entrega \(outro\)/)
})

test('responsavel_sugerido: peça, mais comum do pedido, responsável da etapa e quem saiu da etapa (por e-mail)', async () => {
  const { ana, bia } = await cenario()
  await db.exec('reset role')
  const g2 = await membro('Carla', 'funcionaria', null, 'carla@arvenne.test')
  const p = await pedidoWhats('separacao')
  await resp(p.id, { embalagem: bia })
  const [a, b] = await itens(p.id)
  await db.query("update pedido_itens set status='encontrado', bipado_por=$2, qtd_bipada=qtd where id=$1", [a.id, ana])
  await db.query("update pedido_itens set status='encontrado', bipado_por=$2, qtd_bipada=qtd where id=$1", [b.id, bia])
  await como(UG)
  assert.equal((await one("select responsavel_sugerido($1,'bipagem',$2) r", [p.id, a.id])).r, ana, 'a peça tem o autor da bipagem')
  await db.exec('reset role')
  await db.query("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem, status, bipado_por, qtd_bipada) values ($1,'avulso','Terceira','T1',1,10,5,'encontrado',$2,1)", [p.id, bia])
  await como(UG)
  assert.equal((await one("select responsavel_sugerido($1,'bipagem') r", [p.id])).r, bia, 'sem peça: o mais comum do pedido (2 de 3)')
  // Etapa sem responsável: quem saiu dela, pelo e-mail do histórico.
  await db.exec('reset role')
  await db.query('delete from pedido_eventos where pedido_id=$1', [p.id])
  await db.query(`insert into pedido_eventos (pedido_id, tipo, de, para, usuario_email, created_at) values
    ($1,'status','bipagem','faturamento','x@arvenne.test', now() - interval '3 hours'),
    ($1,'status','faturamento','embalagem','Carla@Arvenne.test', now() - interval '2 hours')`, [p.id])
  await como(UG)
  assert.equal((await one("select responsavel_sugerido($1,'faturamento') r", [p.id])).r, g2)
  assert.equal((await one("select responsavel_sugerido($1,'pronto_envio') r", [p.id])).r, null)
})

test('anular ocorrência: só o gestor; a linha fica guardada e uma segunda anulação é recusada', async () => {
  const { ana } = await cenario()
  const { a } = await naBipagem({ separacao: ana, bipagem: ana })
  const id = (await one("select registrar_erro_bipagem($1,'peca_suja') id", [a.id])).id
  await como(UA)
  await recusa(() => one('select anular_ocorrencia($1)', [id]), /Só o gestor/)
  await como(UG)
  await one('select anular_ocorrencia($1)', [id])
  const o = await one('select anulada_em is not null as anulada, anulada_por from ocorrencias where id=$1', [id])
  assert.equal(o.anulada, true)
  assert.ok(o.anulada_por)
  await recusa(() => one('select anular_ocorrencia($1)', [id]), /já anulada/)
})

test('RLS: cada uma lê as ocorrências dos pedidos que vê; nada de gravar direto; anon recusado', async () => {
  const { ana, bia } = await cenario()
  const p1 = await pedidoWhats('separacao')
  const p2 = await pedidoWhats('separacao')
  await resp(p1.id, { separacao: ana })
  await resp(p2.id, { separacao: bia })
  await db.query(`insert into ocorrencias (pedido_id, tipo, motivo, etapa, responsavel_id) values
    ($1,'problema_entrega','nota_errada','faturamento',$3), ($2,'problema_entrega','nota_errada','faturamento',$3)`, [p1.id, p2.id, ana])
  await como(UA)
  assert.deepEqual((await db.query('select pedido_id from ocorrencias')).rows.map((r) => r.pedido_id), [p1.id])
  assert.deepEqual((await db.query('select pedido_id from v_ocorrencias')).rows.map((r) => r.pedido_id), [p1.id])
  await como(UB)
  assert.deepEqual((await db.query('select pedido_id from ocorrencias')).rows.map((r) => r.pedido_id), [p2.id])
  await como(UG)
  assert.equal((await db.query('select 1 from ocorrencias')).rows.length, 2)
  await recusa(() => db.query("insert into ocorrencias (pedido_id, tipo, motivo, etapa) values ($1,'problema_entrega','nota_errada','faturamento')", [p1.id]), /permission denied|row-level/)
  await recusa(() => db.query("update ocorrencias set anulada_em = now()"), /permission denied/)
  await recusa(() => db.query('delete from ocorrencias'), /permission denied/)
  // Funcionária não registra erro em pedido que não vê.
  await como(UB)
  const [de1] = (await db.query('select id from pedido_itens where pedido_id=$1', [p1.id])).rows
  assert.equal(de1, undefined)
  await db.exec('reset role')
  const [item1] = (await db.query('select id from pedido_itens where pedido_id=$1', [p1.id])).rows
  await como(UB)
  await recusa(() => one("select registrar_erro_bipagem($1,'peca_suja')", [item1.id]), /não está com você/)
  await recusa(() => one("select registrar_problema_entrega($1,'nota_errada')", [p1.id]), /não está com você/)
  await db.exec('reset role')
  await db.exec('set local role anon')
  await recusa(() => db.query('select 1 from ocorrencias'), /permission denied/)
  await recusa(() => db.query('select 1 from v_ocorrencias'), /permission denied/)
  await recusa(() => one("select registrar_problema_entrega($1,'nota_errada')", [p1.id]), /permission denied/)
  await recusa(() => one("select registrar_erro_bipagem($1,'peca_suja')", [item1.id]), /permission denied/)
  await recusa(() => one('select anular_ocorrencia($1)', [p1.id]), /permission denied/)
})

test('os motivos de cada tipo e o texto de "outro" são conferidos pelo banco', async () => {
  const p = await pedidoWhats('separacao')
  const grava = (tipo, motivo, obs = null) => db.query('insert into ocorrencias (pedido_id, tipo, motivo, etapa, observacao) values ($1,$2,$3,$4,$5)', [p.id, tipo, motivo, 'separacao', obs])
  await recusa(() => grava('erro_bipagem', 'nota_errada'), /ocorrencias_motivo/)
  await recusa(() => grava('falta_indevida', 'outro', 'x'), /ocorrencias_motivo/)
  await recusa(() => grava('problema_entrega', 'peca_incorreta'), /ocorrencias_motivo/)
  await recusa(() => grava('problema_entrega', 'outro'), /ocorrencias_outro_com_obs/)
  await recusa(() => grava('qualquer', 'outro', 'x'), /check/)
  await grava('problema_entrega', 'outro', 'algo')
  await grava('erro_bipagem', 'peca_incorreta')
  await grava('falta_indevida', 'peca_encontrada')
})
