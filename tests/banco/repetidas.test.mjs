import { expect, test } from "vitest"
import { db, one } from "./suporte.mjs"
import { recusa } from "./fixtures.mjs"

// Três pedidos com o mesmo anel (A1); só o 1 e o 2 também têm o brinco (B1).
async function cenario() {
  const ids = []
  for (const [n, pago] of [[1, "2026-11-10 12:00-03"], [2, "2026-11-06 12:00-03"], [3, null]]) {
    const p = await one(`insert into pedidos (origem, status, cliente_nome, numero, pago_em, pedido_em)
      values ('shopify', 'novo', $1, $2, $3, now() - $4 * interval '1 hour') returning id`, [`Cliente ${n}`, `ARV-${n}`, pago, n])
    ids.push(p.id)
    await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status, ordem)
      values ($1, 'shopify', 'Anel', 'A1', $2, 10, 'pendente', 0)`, [p.id, n])
    if (n < 3) await db.query(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status, ordem)
      values ($1, 'shopify', 'Brinco', 'B1', 1, 10, 'pendente', 1)`, [p.id])
  }
  return ids
}
const linhas = async (sel) => (await db.query("select * from pecas_repetidas($1) order by chave", [sel])).rows

test("sem seleção, repetidas são as mesmas da view do selo", async () => {
  await cenario()
  const todas = await linhas(null)
  expect(todas.map((r) => [r.chave, r.qtd_total, r.qtd_pedidos])).toEqual([["A1", 6, 3], ["B1", 2, 2]])
  expect(Number((await one("select count(*) n from v_pecas_em_varios_pedidos")).n)).toBe(2)
})

test("seleção conta só os pedidos escolhidos e some peça que deixa de repetir", async () => {
  const [p1, , p3] = await cenario()
  const sel = await linhas([p1, p3])
  expect(sel.map((r) => [r.chave, r.qtd_total, r.qtd_pedidos])).toEqual([["A1", 4, 2]])
  expect(await linhas([p1])).toEqual([])
  expect(await linhas([])).toEqual([])
})

test("cada pedido traz o prazo de envio e vem do mais urgente para o menos", async () => {
  const [p1, p2, p3] = await cenario()
  const a1 = (await linhas(null)).find((r) => r.chave === "A1")
  expect(a1.pedidos.map((p) => p.pedido_id)).toEqual([p2, p1, p3])
  const esperado = (await one("select prazo_envio($1) as v", ["2026-11-06 12:00-03"])).v
  expect(new Date(a1.pedidos[0].prazo).getTime()).toBe(new Date(esperado).getTime())
  // Sem data de pagamento: mesma regra do v_pedidos (prazo_envio conta a partir de agora).
  expect(new Date(a1.pedidos[2].prazo).getTime()).toBe(new Date((await one("select prazo from v_pedidos where id=$1", [p3])).prazo).getTime())
  expect(Object.keys(a1.pedidos[0])).toContain("prazo_horas_uteis")
})

test("só a equipe logada consulta as repetidas", async () => {
  await cenario()
  await db.exec("set local role authenticated")
  expect((await linhas(null)).length).toBe(2)
  await db.exec("reset role; set local role anon")
  await recusa(() => linhas(null), /permission denied/)
})
