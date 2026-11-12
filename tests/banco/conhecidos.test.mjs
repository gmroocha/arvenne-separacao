import { expect, test } from "vitest"
import { db, one } from "./suporte.mjs"
import { fixture, escolher, concluir, recusa, somaFixture, num } from "./fixtures.mjs"

// Reproduções abertas da vistoria, NÃO correções. test.fails exige que o comportamento esperado ainda
// falhe; ao corrigir o bug, remova .fails no mesmo commit para virar uma trava permanente.
// Não transformar falhas novas/desconhecidas em .fails para deixar a integração verde.
test.fails("V04: retirar adicional paga gera devolução", async () => {
  const { p, w, i1 } = await somaFixture()
  await one("select somar_venda($1,'Cartão',45)", [w.id])
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where id=$1", [i1.id])
  expect(num((await one("select a_devolver from v_pedidos where id=$1", [p.id])).a_devolver)).toBe(27)
})
test.fails("V28: valor de opção concluída não pode reescrever o histórico", async () => {
  const f = await fixture()
  await escolher(f); await concluir(f)
  await recusa(() => db.query("update troca_opcoes set preco=100 where id=$1", [f.opcoes[0].id]), /concluída|histórico/i)
})
