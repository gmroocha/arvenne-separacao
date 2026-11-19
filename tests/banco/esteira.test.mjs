import assert from 'node:assert/strict'
import { test } from "vitest"
import { db, one } from './suporte.mjs'
import { criarBanco } from './suporte.mjs'
import { fixture, escolher, concluir, pedidoWhats, recusa } from './fixtures.mjs'

// Esteira leve (20261122180000): marcar_pecas em lote, avanço automático, mover_etapa, excluir_membro.
const entrar = (email = 'ana@arvenne.test') => db.exec(`select set_config('request.jwt.claims','{"email":"${email}"}',true); set local role authenticated`)
const marcar = async (pedido, marcas) => (await one('select marcar_pecas($1,$2::jsonb) as r', [pedido, JSON.stringify(marcas)])).r
const itens = async (id) => (await db.query('select * from pedido_itens where pedido_id=$1 and status<>$2 order by ordem,id', [id, 'removido'])).rows
const status = async (id) => (await one('select status from pedidos where id=$1', [id])).status
const achei = (i) => ({ item: i.id, campo: 'status', valor: 'encontrado' })
const conf = (i, valor = true) => ({ item: i.id, campo: 'conferida', valor })
const bip = (i, valor, codigo) => ({ item: i.id, campo: 'bipada', valor, ...(codigo ? { codigo } : {}) })

async function montar(extra = [], qtds = [1, 1, 2]) {
  await db.exec('reset role')
  const p = await pedidoWhats('em_aberto')
  await db.query("delete from pedido_itens where pedido_id=$1", [p.id])
  for (const [n, q] of qtds.entries())
    await db.query("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem) select $1,'avulso','Peça '||n,'PC-'||n,$3,10,n from (select $2::int as n) t", [p.id, n, q])
  await db.query("update pedidos set status='novo',forma_pagamento='Pix',valor_pago=40,pago_em=now() where id=$1", [p.id])
  return p
}

test('marcar_pecas: cada peça anda sozinha e o pedido fica na etapa da mais atrasada', async () => {
  const p = await montar()
  const [a, b, c] = await itens(p.id)
  await entrar()
  let r = await marcar(p.id, [achei(a)])
  assert.equal(r.pedido.status, 'separacao')
  assert.equal(r.itens.length, 1)
  assert.equal(r.itens[0].status, 'encontrado')
  r = await marcar(p.id, [achei(b), achei(c)])
  assert.equal(r.pedido.status, 'conferencia', 'todas achadas: o pedido segue sozinho')
  assert.ok(r.eventos.some((e) => e.tipo === 'status' && e.de === 'separacao' && e.para === 'conferencia' && e.usuario_email === 'ana@arvenne.test'))
  r = await marcar(p.id, [conf(a), conf(b)])
  assert.equal(r.pedido.status, 'conferencia')
  r = await marcar(p.id, [conf(c)])
  assert.equal(r.pedido.status, 'bipagem')
  r = await marcar(p.id, [bip(a, 1, 'PC-0'), bip(b, 1, 'pc-1'), bip(c, 1, 'PC-2')])
  assert.equal(r.pedido.status, 'bipagem', 'peça com 2 unidades ainda não completa')
  r = await marcar(p.id, [bip(c, 2, 'PC-2')])
  assert.equal(r.pedido.status, 'faturamento')
  assert.deepEqual(r.itens.map((i) => i.qtd_bipada), [2])
  assert.equal(await status(p.id), 'faturamento')
})

test('marcar_pecas: repetir o mesmo lote não muda nada nem repete evento', async () => {
  const p = await montar()
  const [a, b, c] = await itens(p.id)
  await entrar()
  const lote = [achei(a), achei(b), achei(c), conf(a), conf(b), conf(c)]
  await marcar(p.id, lote)
  const antes = (await db.query('select id,conferido_em,updated_at from pedido_itens where pedido_id=$1 order by id', [p.id])).rows
  const eventos = Number((await one('select count(*) n from pedido_eventos where pedido_id=$1', [p.id])).n)
  const r = await marcar(p.id, lote)
  assert.equal(r.pedido.status, 'bipagem')
  assert.deepEqual((await db.query('select id,conferido_em,updated_at from pedido_itens where pedido_id=$1 order by id', [p.id])).rows, antes)
  assert.equal(Number((await one('select count(*) n from pedido_eventos where pedido_id=$1', [p.id])).n), eventos)
  assert.deepEqual(r.eventos, [], 'sem mudança, sem evento novo')
})

test('marcar_pecas: vale a última marca de cada peça e campo (rajada de clica e desfaz)', async () => {
  const p = await montar()
  const [a] = await itens(p.id)
  await entrar()
  const r = await marcar(p.id, [achei(a), { item: a.id, campo: 'status', valor: 'pendente' }, achei(a), conf(a), conf(a, false), conf(a)])
  assert.equal(r.itens[0].status, 'encontrado')
  assert.ok(r.itens[0].conferido_em)
  const d = await marcar(p.id, [{ item: a.id, campo: 'status', valor: 'pendente' }])
  assert.equal(d.itens[0].conferido_em, null)
  assert.equal(d.itens[0].qtd_bipada, 0)
})

test('marcar_pecas: desfazer faz o pedido voltar para a etapa da peça mais atrasada e refazer o leva de novo', async () => {
  const p = await montar()
  const lista = await itens(p.id)
  await entrar()
  await marcar(p.id, [...lista.map(achei), ...lista.map((i) => conf(i)), ...lista.map((i) => bip(i, i.qtd, i.sku))])
  assert.equal(await status(p.id), 'faturamento')
  // Documentos prontos e pedido adiantado: desfazer uma bipada volta à Bipagem; refazer pula os documentos já feitos.
  await db.exec('reset role')
  await db.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now(),frete_gerado_em=now() where id=$1", [p.id])
  await db.query("update pedidos set status='pronto_envio' where id=$1", [p.id])
  await entrar()
  const [, , c] = lista
  let r = await marcar(p.id, [bip(c, 1)])
  assert.equal(r.pedido.status, 'bipagem')
  r = await marcar(p.id, [bip(c, 2, 'PC-2')])
  assert.equal(r.pedido.status, 'pronto_envio', 'nota, LR, embalagem e frete já estavam feitos')
  r = await marcar(p.id, [conf(lista[0], false)])
  assert.equal(r.pedido.status, 'conferencia')
  r = await marcar(p.id, [{ item: lista[1].id, campo: 'status', valor: 'pendente' }])
  assert.equal(r.pedido.status, 'separacao')
})

test('marcar_pecas: código errado recusa o lote inteiro; contagem à mão (sem código) vale; peça fora do pedido recusa', async () => {
  const p = await montar()
  const [a, b] = await itens(p.id)
  await entrar()
  await marcar(p.id, [achei(a), conf(a), achei(b)])
  await recusa(() => marcar(p.id, [bip(a, 1, 'OUTRO')]), /não é o SKU/)
  assert.equal((await one('select qtd_bipada from pedido_itens where id=$1', [a.id])).qtd_bipada, 0)
  await marcar(p.id, [bip(a, 1)])
  assert.equal((await one('select qtd_bipada from pedido_itens where id=$1', [a.id])).qtd_bipada, 1)
  // Excedente é limitado à quantidade; peça não conferida não bipa.
  await marcar(p.id, [bip(a, 9), bip(b, 1)])
  assert.equal((await one('select qtd_bipada from pedido_itens where id=$1', [a.id])).qtd_bipada, a.qtd)
  assert.equal((await one('select qtd_bipada from pedido_itens where id=$1', [b.id])).qtd_bipada, 0)
  const outro = await montar()
  const [x] = await itens(outro.id)
  await recusa(() => marcar(p.id, [achei(x)]), /não pertence/)
  await recusa(() => marcar(p.id, [{ item: a.id, campo: 'inventado', valor: 1 }]), /inválida/)
  await recusa(() => marcar(p.id, [{ item: a.id, campo: 'status', valor: 'falta' }]), /inválida/)
})

test('marcar_pecas: peça em falta ou removida é ignorada e devolvida; pedido arquivado ou venda recusa', async () => {
  const p = await montar()
  const [a, b] = await itens(p.id)
  await db.query("update pedido_itens set status='falta' where id=$1", [a.id])
  await db.query("update pedido_itens set status='removido' where id=$1", [b.id])
  await entrar()
  const r = await marcar(p.id, [achei(a), achei(b)])
  assert.deepEqual([...r.ignoradas].sort(), [a.id, b.id].sort())
  assert.equal((await one('select status from pedido_itens where id=$1', [a.id])).status, 'falta')
  const v = await pedidoWhats('em_aberto')
  const [i] = await itens(v.id)
  await recusa(() => marcar(v.id, [achei(i)]), /não aceita/)
  await db.exec('reset role')
  const e = await pedidoWhats('enviado')
  await entrar()
  await recusa(() => marcar(e.id, []), /não aceita/)
})

test('marcar_pecas: o progresso das peças não recalcula acerto nem reavalia etapa (zero execuções)', async () => {
  const p = await montar([], [3, 3])
  const lista = await itens(p.id)
  await db.exec(`alter function public.reavaliar_etapa(uuid) rename to reavaliar_etapa_original;
    alter function public.reconciliar_acertos(uuid,uuid) rename to reconciliar_acertos_original;
    create temp table chamadas (nome text);
    grant all on chamadas to public;
    create function public.reavaliar_etapa(p_pedido uuid) returns void language plpgsql as $$
    begin insert into chamadas values('reavaliar'); perform public.reavaliar_etapa_original(p_pedido); end $$;
    create function public.reconciliar_acertos(p_pedido uuid, p_priorizar uuid default null) returns void language plpgsql as $$
    begin insert into chamadas values('reconciliar'); perform public.reconciliar_acertos_original(p_pedido,p_priorizar); end $$;`)
  await entrar()
  await marcar(p.id, lista.map(achei))
  await marcar(p.id, lista.map((i) => conf(i)))
  await marcar(p.id, lista.map((i) => bip(i, 1, i.sku)))
  await marcar(p.id, lista.map((i) => bip(i, 3, i.sku)))
  // Desfazer também é só do lote: a etapa é recalculada por avancar_pecas, sem reavaliar_etapa.
  await marcar(p.id, [conf(lista[0], false)])
  await db.exec('reset role')
  assert.equal(Number((await one("select count(*) n from chamadas")).n), 0)
  assert.equal(await status(p.id), 'conferencia')
})

test('marcar_pecas: histórico só do essencial (nada de achei, conferida ou bipada), status com quem concluiu', async () => {
  const p = await montar()
  const lista = await itens(p.id)
  await entrar('bia@arvenne.test')
  await marcar(p.id, lista.map(achei))
  await marcar(p.id, lista.map((i) => conf(i)))
  await marcar(p.id, lista.map((i) => bip(i, i.qtd, i.sku)))
  await db.exec('reset role')
  const tipos = (await db.query("select distinct tipo from pedido_eventos where pedido_id=$1 order by 1", [p.id])).rows.map((r) => r.tipo)
  assert.deepEqual(tipos, ['criado', 'pago', 'status'])
  const status = (await db.query("select de,para,usuario_email from pedido_eventos where pedido_id=$1 and tipo='status' and usuario_email='bia@arvenne.test' order by id", [p.id])).rows
  assert.deepEqual(status.map((s) => [s.de, s.para]), [['novo', 'conferencia'], ['conferencia', 'bipagem'], ['bipagem', 'faturamento']])
  assert.equal((await one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo in ('conferida','desconferida','etiquetada','desetiquetada','bipada')", [p.id])).n, 0)
  // Retirar peça, falta, quantidade e preço depois de pago continuam registrados.
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where id=$1", [lista[0].id])
  await db.query("update pedido_itens set qtd=5,preco=11 where id=$1", [lista[1].id])
  const novos = (await db.query("select tipo from pedido_eventos where pedido_id=$1 and tipo in ('item','qtd','preco') order by id", [p.id])).rows.map((r) => r.tipo)
  assert.deepEqual(novos, ['item', 'qtd', 'preco'])
})

test('marcar_pecas: lotes concorrentes e repetidos do mesmo pedido chegam ao mesmo estado final', async () => {
  const p = await montar([], [1, 1, 1, 1])
  const lista = await itens(p.id)
  await entrar()
  const lotes = lista.map((i) => [achei(i), conf(i)])
  await Promise.all([...lotes, ...lotes].map((l) => marcar(p.id, l)))
  const fim = await itens(p.id)
  assert.ok(fim.every((i) => i.status === 'encontrado' && i.conferido_em))
  assert.equal(await status(p.id), 'bipagem')
})

test('documentos: cada etapa avança sozinha quando termina; o acerto pendente segura a Embalagem', async () => {
  const p = await pedidoWhats('faturamento')
  await entrar()
  await db.query("update pedidos set nf_emitida_em=now() where id=$1", [p.id])
  assert.equal(await status(p.id), 'faturamento', 'só a nota: falta o pedido LR')
  await db.query("update pedidos set pedido_fornecedor_em=now() where id=$1", [p.id])
  assert.equal(await status(p.id), 'embalagem')
  await db.query("update pedidos set embalado_em=now() where id=$1", [p.id])
  assert.equal(await status(p.id), 'embalagem', 'só a embalagem: falta o frete')
  await db.query("update pedidos set frete_gerado_em=now() where id=$1", [p.id])
  assert.equal(await status(p.id), 'pronto_envio')
  await db.query("update pedidos set postado_em=now() where id=$1", [p.id])
  // V107: pedido do WhatsApp passa por "Enviar rastreio" e só conclui com a mensagem enviada.
  assert.equal(await status(p.id), 'enviar_rastreio')
  await db.query("update pedidos set rastreio_enviado_em=now() where id=$1", [p.id])
  assert.equal(await status(p.id), 'enviado')
  await db.query("update pedidos set entregue_em=now() where id=$1", [p.id])
  assert.equal((await one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='entregue'", [p.id])).n, 1)

  const f = await fixture({ desconto: 0 })
  await escolher(f); await concluir(f)
  await db.exec('reset role')
  await db.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=qtd where pedido_id=$1 and status<>'removido'", [f.pedido.id])
  await db.query("update pedidos set status='faturamento' where id=$1", [f.pedido.id])
  await entrar()
  await db.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now() where id=$1", [f.pedido.id])
  assert.equal(await status(f.pedido.id), 'faturamento', 'acerto de troca pendente: o pedido espera, os campos ficam gravados')
  assert.ok((await one('select nf_emitida_em from pedidos where id=$1', [f.pedido.id])).nf_emitida_em)
})

test('mover_etapa: para frente marca o que falta como feito e registra etapas_puladas; Concluir pedido', async () => {
  const p = await montar()
  const lista = await itens(p.id)
  await entrar('ana@arvenne.test')
  assert.equal((await one("select mover_etapa($1,'embalagem') s", [p.id])).s, 'embalagem')
  const depois = await itens(p.id)
  assert.ok(depois.every((i) => i.status === 'encontrado' && i.conferido_em && i.etiquetado_em && i.qtd_bipada === i.qtd))
  const ped = await one('select nf_emitida_em,pedido_fornecedor_em,embalado_em,frete_gerado_em from pedidos where id=$1', [p.id])
  assert.ok(ped.nf_emitida_em && ped.pedido_fornecedor_em); assert.equal(ped.embalado_em, null); assert.equal(ped.frete_gerado_em, null)
  const ev = await one("select de,para,texto,usuario_email from pedido_eventos where pedido_id=$1 and tipo='etapas_puladas'", [p.id])
  assert.deepEqual([ev.de, ev.para, ev.usuario_email], ['separacao', 'embalagem', 'ana@arvenne.test'])
  assert.match(ev.texto, /Separação.*Nota fiscal/)
  // Concluir pedido = mover para 'enviado'.
  assert.equal((await one("select mover_etapa($1,'enviado') s", [p.id])).s, 'enviado')
  const fim = await one('select embalado_em,frete_gerado_em,postado_em from pedidos where id=$1', [p.id])
  assert.ok(fim.embalado_em && fim.frete_gerado_em && fim.postado_em)
  await recusa(() => one("select mover_etapa($1,'separacao')", [p.id]), /concluído/)
  assert.equal(lista.length, 3)
})

test('mover_etapa: para trás zera o trabalho do destino em diante e conserva o anterior', async () => {
  const p = await pedidoWhats('pronto_envio')
  await entrar()
  assert.equal((await one("select mover_etapa($1,'bipagem') s", [p.id])).s, 'bipagem')
  const ped = await one('select nf_emitida_em,pedido_fornecedor_em,embalado_em,frete_gerado_em,frete_peso_g,postado_em from pedidos where id=$1', [p.id])
  assert.deepEqual(Object.values(ped), [null, null, null, null, null, null])
  assert.ok((await itens(p.id)).every((i) => i.conferido_em && i.qtd_bipada === 0 && i.status === 'encontrado'))
  assert.equal((await one("select mover_etapa($1,'separacao') s", [p.id])).s, 'separacao')
  assert.ok((await itens(p.id)).every((i) => i.status === 'pendente' && !i.conferido_em))
  assert.equal(Number((await one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='reiniciado'", [p.id])).n), 2)
  assert.equal((await one("select mover_etapa($1,'separacao') s", [p.id])).s, 'separacao', 'mesma etapa: nada a fazer')
})

test('mover_etapa: recusa troca em andamento, acerto pendente, peça em falta, desvio, venda e etapa inválida', async () => {
  const f = await fixture({ desconto: 0 })
  await recusa(() => one("select mover_etapa($1,'conferencia')", [f.pedido.id]), /falta|desvio|Resolva/)
  await escolher(f); await concluir(f)
  // V113: o acerto pendente só segura a Embalagem em diante.
  await recusa(() => one("select mover_etapa($1,'embalagem')", [f.pedido.id]), /acerto ou devolução pendente/)
  await db.exec('reset role')
  const sep = await pedidoWhats('separacao')
  await db.query("insert into trocas(pedido_id) values ($1)", [sep.id])
  await entrar()
  await recusa(() => one("select mover_etapa($1,'conferencia')", [sep.id]), /troca em andamento/)
  const v = await pedidoWhats('em_aberto')
  await recusa(() => one("select mover_etapa($1,'conferencia')", [v.id]), /esteira/)
  const n = await pedidoWhats('novo')
  await recusa(() => one("select mover_etapa($1,'etiquetagem')", [n.id]), /Etapa inválida/)
  await recusa(() => one("select mover_etapa($1,'novo')", [n.id]), /Etapa inválida/)
  await recusa(() => one("select mover_etapa($1,'conferencia')", ['00000000-0000-0000-0000-000000000000']), /não encontrado/)
})

test('v_producao_pessoa: conta o que cada pessoa concluiu por dia e etapa, sem trechos pulados', async () => {
  const p = await montar()
  const lista = await itens(p.id)
  await entrar('ana@arvenne.test')
  await marcar(p.id, lista.map(achei))
  await db.exec('reset role')
  await entrar('bia@arvenne.test')
  await marcar(p.id, lista.map((i) => conf(i)))
  await one("select mover_etapa($1,'embalagem')", [p.id])
  const linhas = (await db.query('select pessoa,etapa,pedidos,pecas from v_producao_pessoa order by pessoa,etapa')).rows
  assert.deepEqual(linhas, [
    { pessoa: 'ana@arvenne.test', etapa: 'separacao', pedidos: 1, pecas: 4 },
    { pessoa: 'bia@arvenne.test', etapa: 'conferencia', pedidos: 1, pecas: 4 },
  ])
})

test('excluir_membro: tira a pessoa do Time e dos pedidos; eventos e pedidos continuam', async () => {
  const p = await pedidoWhats('separacao')
  const ana = (await one("insert into equipe(nome,email) values('Ana','ana@arvenne.test') returning id")).id
  const bia = (await one("insert into equipe(nome) values('Bia') returning id")).id
  // V109: só o gestor exclui pessoas; quem entra aqui (ana@arvenne.test) é a gestora e a excluída é outra pessoa.
  await db.query("update equipe set papel='gestor' where id=$1", [ana])
  await entrar()
  await one("select designar($1,'separacao',$2)", [p.id, ana])
  await one("select designar($1,'embalagem',$2)", [p.id, bia])
  await one("select designar($1,'conferencia',$2)", [p.id, bia])
  await one('select excluir_membro($1)', [bia])
  assert.deepEqual((await one('select responsaveis r from pedidos where id=$1', [p.id])).r, { separacao: ana })
  assert.equal((await one('select count(*) n from equipe where id=$1', [bia])).n, 0)
  assert.equal((await one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='designado'", [p.id])).n, 3)
  assert.equal((await one('select count(*) n from pedidos where id=$1', [p.id])).n, 1)
  await recusa(() => one('select excluir_membro($1)', [bia]), /não encontrada/)
})

test('permissões: anon não executa nada novo; authenticated sem DELETE em equipe nem nas views', async () => {
  const p = await pedidoWhats('novo')
  const [a] = await itens(p.id)
  await db.exec('set local role anon')
  await recusa(() => marcar(p.id, [achei(a)]), /permission denied/)
  await recusa(() => one("select mover_etapa($1,'conferencia')", [p.id]), /permission denied/)
  await recusa(() => one('select excluir_membro(gen_random_uuid())'), /permission denied/)
  await recusa(() => one('select avancar_pecas($1)', [p.id]), /permission denied/)
  await recusa(() => one('select * from v_producao_pessoa'), /permission denied/)
  await db.exec('reset role')
  await entrar()
  await recusa(() => db.query('delete from equipe'), /permission denied/)
  assert.ok(await db.query('select * from v_producao_pessoa'))
  await recusa(() => db.query('select * from v_tempo_sku'), /does not exist/)
})

test('migração: pedidos em Etiquetagem vão para a Bipagem e o histórico clique a clique é apagado', async () => {
  let ids
  const b = await criarBanco({
    antesDe: '20261122180000',
    prepararAntes: async (banco) => {
      const q = async (sql, args) => (await banco.query(sql, args)).rows[0]
      const ped = await q(`insert into pedidos (origem,status,cliente_nome,pago_em) values ('whatsapp','novo','A',now()) returning id`)
      const it = await q(`insert into pedido_itens (pedido_id,origem,nome,sku,qtd,preco,ordem) values ($1,'avulso','Anel','A1',1,50,1) returning id`, [ped.id])
      await banco.query("update pedido_itens set status='encontrado',conferido_em=now() where id=$1", [it.id])
      await banco.query("update pedidos set status='conferencia' where id=$1", [ped.id])
      await banco.query("update pedidos set status='etiquetagem' where id=$1", [ped.id])
      await banco.query("insert into pedido_eventos (pedido_id,item_id,tipo) values ($1,$2,'conferida'),($1,$2,'etiquetada'),($1,$2,'bipada')", [ped.id, it.id])
      await banco.query("insert into pedido_eventos (pedido_id,item_id,tipo,de,para) values ($1,$2,'item','pendente','encontrado'),($1,$2,'item','encontrado','falta')", [ped.id, it.id])
      ids = { ped: ped.id, it: it.id }
    },
  })
  try {
    assert.equal((await b.query('select status from pedidos where id=$1', [ids.ped])).rows[0].status, 'bipagem')
    assert.ok((await b.query('select etiquetado_em from pedido_itens where id=$1', [ids.it])).rows[0].etiquetado_em)
    const tipos = (await b.query("select tipo,para from pedido_eventos where pedido_id=$1 and tipo not in ('criado','status','pago') order by id", [ids.ped])).rows
    assert.deepEqual(tipos, [{ tipo: 'item', para: 'falta' }])
    await recusa_ok(b)
  } finally { await b.close() }
})
async function recusa_ok(b) {
  await assert.rejects(() => b.query("update pedidos set status='etiquetagem'"), /Etapa inválida|check|violates/)
}

// V96: "na fila" (novo) e "separando" (separacao) são etapas diferentes nas métricas: o tempo de cada uma vem dos eventos
// de status. Começa por "Começar separação" (atualiza o status) ou pelo primeiro "Achei" (marcar_pecas); dá no mesmo.
for (const caminho of ['botão Começar separação', 'primeiro Achei']) {
  test(`V96: fila e separação aparecem separadas em v_tempo_etapas (${caminho})`, async () => {
    const p = await montar()
    const [a] = await itens(p.id)
    await db.query("update pedido_eventos set created_at = created_at - interval '3 hours' where pedido_id=$1", [p.id])
    await entrar()
    if (caminho === 'botão Começar separação') await db.query("update pedidos set status='separacao' where id=$1", [p.id])
    else await marcar(p.id, [achei(a)])
    assert.equal(await status(p.id), 'separacao')
    const linhas = (await db.query("select etapa, em_andamento, proxima_etapa, horas_corridas::float h from v_tempo_etapas where pedido_id=$1 and etapa in ('novo','separacao') order by entrou_em, etapa", [p.id])).rows
    const novo = linhas.find((l) => l.etapa === 'novo'), sep = linhas.find((l) => l.etapa === 'separacao')
    assert.ok(novo && sep, 'as duas etapas existem')
    assert.equal(novo.em_andamento, false)
    assert.equal(novo.proxima_etapa, 'separacao')
    assert.ok(novo.h >= 2.9 && novo.h <= 3.1, `tempo na fila ≈ 3 h (veio ${novo.h})`)
    assert.equal(sep.em_andamento, true)
    assert.ok(sep.h < 0.1, `tempo separando recém começou (veio ${sep.h})`)
    // O evento de status leva quem começou (a pessoa do login).
    const ev = await one("select usuario_email from pedido_eventos where pedido_id=$1 and tipo='status' and para='separacao'", [p.id])
    assert.equal(ev.usuario_email, 'ana@arvenne.test')
  })
}
