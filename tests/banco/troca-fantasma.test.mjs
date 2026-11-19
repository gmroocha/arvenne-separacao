import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { concluir, escolher, fixture, pedidoWhats, recusa, entrarComo } from './fixtures.mjs'

const entrar = () => entrarComo('ana@arvenne.test')
const status = async (id) => (await one('select status from pedidos where id=$1', [id])).status
const ativas = async (id) =>
  (await one("select count(*)::int n from trocas where pedido_id=$1 and status in ('rascunho','enviada','respondida')", [id])).n

// V112: concluída a troca com a janela aberta, a tela pedia garantir_troca com a lista velha (a peça trocada já
// estava removida) e o banco abria uma troca nova, vazia, que travava o "Concluir etapa".
test('V112: garantir_troca com peça já trocada não abre troca fantasma nem trava o mover de etapa', async () => {
  const f = await fixture({ desconto: 0 })
  await escolher(f)
  await concluir(f)
  assert.equal((await one('select status from trocas where id=$1', [f.troca.id])).status, 'concluida')
  assert.equal((await one('select status from pedido_itens where id=$1', [f.itens[0].id])).status, 'removido')
  const nova = (await one('select garantir_troca($1, $2::uuid[]) as id', [f.pedido.id, [f.itens[0].id]])).id
  assert.equal(nova, null)
  assert.equal(await ativas(f.pedido.id), 0)
  // Peça nova da troca (pendente): o pedido anda pela esteira sem "troca em andamento".
  await db.exec('reset role')
  await db.query("update pedido_itens set status='encontrado' where pedido_id=$1 and status='pendente'", [f.pedido.id])
  await entrar()
  assert.equal((await one("select mover_etapa($1,'bipagem') s", [f.pedido.id])).s, 'bipagem')
})

test('V112: garantir_troca só põe na troca peça em falta ou com defeito', async () => {
  const p = await pedidoWhats('avisar_cliente')
  const [a, c] = (await db.query('select id from pedido_itens where pedido_id=$1 order by ordem', [p.id])).rows.map((r) => r.id)
  await db.query("update pedido_itens set status='falta' where id=$1", [a])
  await entrar()
  const t = (await one('select garantir_troca($1, $2::uuid[]) as id', [p.id, [a, c]])).id
  assert.ok(t)
  const pecas = (await db.query('select item_id from troca_pecas where troca_id=$1', [t])).rows.map((r) => r.item_id)
  assert.deepEqual(pecas, [a])
  // Com a troca aberta, a peça que não falta continua de fora e a troca é a mesma.
  assert.equal((await one('select garantir_troca($1, $2::uuid[]) as id', [p.id, [c]])).id, t)
  assert.equal((await one('select count(*)::int n from troca_pecas where troca_id=$1', [t])).n, 1)
  await recusa(() => one('select garantir_troca($1, $2::uuid[])', [p.id, ['00000000-0000-0000-0000-000000000000']]), /não pertence/)
})

// V113: o acerto pendente (peça tirada depois de pago) travava o mover de etapa já na Conferência, onde o cartão
// "A devolver" não aparece. Como no avanço automático, o acerto só é exigido a partir da Embalagem.
test('V113: devolução pendente não trava Conferência → Bipagem; trava a Embalagem e não trava voltar', async () => {
  const p = await pedidoWhats('conferencia')
  await db.query('update pedidos set valor_pago=(select total from v_pedidos where id=$1) where id=$1', [p.id])
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where pedido_id=$1 and sku='C1'", [p.id])
  const v = await one('select acerto_pendente, a_devolver from v_pedidos where id=$1', [p.id])
  assert.equal(v.acerto_pendente, true)
  assert.equal(Number(v.a_devolver), 30)
  await entrar()
  assert.equal((await one("select mover_etapa($1,'bipagem') s", [p.id])).s, 'bipagem')
  assert.equal((await one("select mover_etapa($1,'faturamento') s", [p.id])).s, 'faturamento')
  await recusa(() => one("select mover_etapa($1,'embalagem')", [p.id]), /acerto ou devolução pendente/)
  assert.equal(await status(p.id), 'faturamento')
  assert.equal((await one("select mover_etapa($1,'conferencia') s", [p.id])).s, 'conferencia')
})
