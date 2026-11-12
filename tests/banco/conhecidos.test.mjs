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
test.fails("V08: diferença recebida entra no total pago", async () => {
  const f = await fixture({ desconto: 0 })
  await db.query("update pedidos set valor_pago=100 where id=$1", [f.pedido.id])
  await escolher(f); await concluir(f)
  await one("select troca_acerto($1,'recebido')", [f.troca.id])
  expect(num((await one("select total_pago from v_pedidos where id=$1", [f.pedido.id])).total_pago)).toBe(150)
})
test.fails("V11: opção e carrinho anunciam o mesmo valor para várias unidades", async () => {
  const f = await fixture({ desconto: 10, tipoDesconto: "percentual" })
  await db.query("update pedido_itens set qtd=3,preco=1 where id=$1", [f.itens[0].id])
  await db.query("update troca_opcoes set preco=0.05 where id=$1", [f.opcoes[0].id])
  await escolher(f)
  const v = await one("select valor_opcao from v_troca_valores where opcao_id=$1", [f.opcoes[0].id])
  const c = await one("select valor_escolhido from v_troca_carrinho where troca_peca_id=$1", [f.pecas[0].id])
  expect(num(v.valor_opcao)).toBe(num(c.valor_escolhido))
})
test.fails("V14: banco impede envio com peça pendente", async () => {
  const { p } = await somaFixture()
  await db.query("update pedido_itens set status='pendente' where pedido_id=$1", [p.id])
  await recusa(() => db.query("update pedidos set status='enviado' where id=$1", [p.id]), /etapa|pendente|separad/i)
})
test.fails("V15: peça que deixou de faltar não impede encerrar a troca", async () => {
  const f = await fixture({ quantidade: 2 })
  await db.query("update pedido_itens set status='pendente' where id=$1", [f.itens[1].id])
  await escolher(f); await concluir(f)
  expect((await one("select status from trocas where id=$1", [f.troca.id])).status).toBe("concluida")
})
test.fails("V28: valor de opção concluída não pode reescrever o histórico", async () => {
  const f = await fixture()
  await escolher(f); await concluir(f)
  await recusa(() => db.query("update troca_opcoes set preco=100 where id=$1", [f.opcoes[0].id]), /concluída|histórico/i)
})
