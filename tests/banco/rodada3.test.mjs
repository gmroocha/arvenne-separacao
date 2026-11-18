import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { escolher, fixture, recusa } from './fixtures.mjs'

const inconsistencias = async (pedidoId, regra) =>
  (await db.query('select regra from listar_inconsistencias() where pedido_id=$1 and regra=$2', [pedidoId, regra])).rows.length

// V100: "Voltar a pendente" deixava a troca esperando uma peça que já não faltava. "Encontrada" tira a peça da troca
// ainda aberta e a marca como encontrada, na mesma transação.
test('V100: "Voltar a pendente" deixa a troca pendurada (o problema que a nova ação resolve)', async () => {
  const f = await fixture({ quantidade: 1 })
  await one("select alterar_item($1,$2::jsonb)", [f.itens[0].id, JSON.stringify({ status: 'pendente', observacao: null })])
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(1)
})

test('V100: encontrar_peca tira a única peça da troca, cancela a troca vazia e leva a peça para a Conferência', async () => {
  const f = await fixture({ quantidade: 1 })
  await one('select encontrar_peca($1)', [f.itens[0].id])
  expect((await one('select status from pedido_itens where id=$1', [f.itens[0].id])).status).toBe('encontrado')
  expect((await one('select status from trocas where id=$1', [f.troca.id])).status).toBe('cancelada')
  expect((await one('select count(*)::int n from troca_pecas where troca_id=$1', [f.troca.id])).n).toBe(0)
  // Única peça do pedido achada de novo: o desvio acaba e o pedido segue (a peça já está na Conferência).
  expect((await one('select status from pedidos where id=$1', [f.pedido.id])).status).toBe('conferencia')
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(0)
})

test('V100: com outras peças na troca, ela continua e vira "respondida" se as outras já escolheram', async () => {
  const f = await fixture({ quantidade: 2 })
  await escolher(f, 0)
  expect((await one('select status from trocas where id=$1', [f.troca.id])).status).toBe('enviada')
  await one('select encontrar_peca($1)', [f.itens[1].id])
  const t = await one('select status from trocas where id=$1', [f.troca.id])
  expect(t.status).toBe('respondida')
  expect((await one('select count(*)::int n from troca_pecas where troca_id=$1', [f.troca.id])).n).toBe(1)
  // A outra peça segue em falta: o pedido continua no desvio.
  expect((await one('select status from pedidos where id=$1', [f.pedido.id])).status).toBe('aguardando_cliente')
  expect(await inconsistencias(f.pedido.id, 'troca_inativa_pendente')).toBe(0)
})

test('V100: encontrar_peca só vale para peça em falta e não é pública', async () => {
  const f = await fixture({ quantidade: 1 })
  await one('select encontrar_peca($1)', [f.itens[0].id])
  await recusa(() => one('select encontrar_peca($1)', [f.itens[0].id]), /em falta/)
  await db.exec('set local role anon')
  await recusa(() => one('select encontrar_peca($1)', [f.itens[0].id]), /permission denied/)
})

// V106: enviar a troca só marca a troca como enviada; o pedido segue em "Avisar cliente" até "Cliente avisada".
test('V106: enviar_troca não leva o pedido a "Aguardando cliente"; o botão "Cliente avisada" leva', async () => {
  const p = await one("insert into pedidos(origem,status,cliente_nome,etapa_antes_desvio) values('whatsapp','avisar_cliente','Cliente','separacao') returning id")
  const i = await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status) values($1,'avulso','Anel','AN-1',1,50,'falta') returning id", [p.id])
  await db.exec('set local role authenticated')
  const troca = (await one('select garantir_troca($1, array[$2]::uuid[]) as id', [p.id, i.id])).id
  expect((await one('select status from trocas where id=$1', [troca])).status).toBe('rascunho')
  await one('select enviar_troca($1)', [troca])
  const t = await one('select status, enviada_em from trocas where id=$1', [troca])
  expect(t.status).toBe('enviada')
  expect(t.enviada_em).not.toBeNull()
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('avisar_cliente')
  // Reenviar não muda nada.
  await one('select enviar_troca($1)', [troca])
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('avisar_cliente')
  // "Cliente avisada" (a tela grava o status) é o que move o pedido.
  await db.query("update pedidos set status='aguardando_cliente' where id=$1", [p.id])
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('aguardando_cliente')
  await recusa(() => one('select enviar_troca($1)', ['00000000-0000-0000-0000-000000000000']), /não encontrada/)
})
