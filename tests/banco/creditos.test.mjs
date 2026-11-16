import assert from "node:assert/strict"
import { test } from "vitest"
import { db, one } from "./suporte.mjs"
import { fixture, recusa } from "./fixtures.mjs"

const num = (v) => Number(v)
// Pedido pago com troca concluída como crédito: saldo a favor da cliente de R$ 80,00.
async function comCredito(email = "ana@example.test") {
  const f = await fixture({ desconto: 20 })
  await db.query("update pedidos set cliente_email=$2 where id=$1", [f.pedido.id, email])
  await one("select troca_aprovar($1,$2,'credito',null)", [f.troca.id, f.pecas[0].id])
  assert.equal(num((await one("select saldo from v_pedido_acerto where pedido_id=$1", [f.pedido.id])).saldo), -80)
  return f
}
const credito = (pedidoId) => one("select * from v_creditos_cliente where pedido_id=$1", [pedidoId])

test("reembolso em 2 passos: pendente, reembolsado e desfazer", async () => {
  const f = await comCredito()
  const id = (await one("select registrar_credito($1,'reembolso') as id", [f.troca.id])).id
  let c = await credito(f.pedido.id)
  assert.deepEqual([c.id, c.destino, num(c.valor), c.situacao], [id, "reembolso", 80, "reembolso_pendente"])
  // O acerto e o movimento financeiro são os mesmos de antes (crédito registrado de R$ 80,00).
  assert.equal((await one("select acerto_status from trocas where id=$1", [f.troca.id])).acerto_status, "credito_registrado")
  assert.equal(num((await one("select valor from movimentos_financeiros where troca_id=$1 and tipo='troca_credito'", [f.troca.id])).valor), -80)
  await one("select marcar_reembolsado($1)", [id])
  c = await credito(f.pedido.id)
  assert.equal(c.situacao, "reembolsado")
  assert.notEqual(c.reembolsado_em, null)
  // Já reembolsado: o acerto não pode voltar para pendente sem desfazer o reembolso.
  await recusa(() => one("select troca_acerto($1,'pendente')", [f.troca.id]), /já foi reembolsado ou usado/)
  await one("select marcar_reembolsado($1,true)", [id])
  assert.equal((await credito(f.pedido.id)).situacao, "reembolso_pendente")
  await recusa(() => one("select usar_credito($1,$2)", [id, f.pedido.id]), /de reembolso/)
  const ev = await db.query("select texto from pedido_eventos where pedido_id=$1 and tipo='troca_acerto' order by id", [f.pedido.id])
  assert.ok(ev.rows.some((e) => /Crédito para reembolsar: R\$ 80,00/.test(e.texto)))
  assert.ok(ev.rows.some((e) => /Reembolsado à cliente: R\$ 80,00/.test(e.texto)))
})

test("desfazer o acerto cancela o crédito sem apagar e permite registrar de novo", async () => {
  const f = await comCredito()
  await one("select registrar_credito($1,'reembolso')", [f.troca.id])
  await one("select troca_acerto($1,'pendente')", [f.troca.id])
  assert.equal(await credito(f.pedido.id), undefined)
  assert.equal(num((await one("select count(*) n from creditos_cliente where pedido_id=$1 and cancelado_em is not null", [f.pedido.id])).n), 1)
  await one("select registrar_credito($1,'proximo_pedido')", [f.troca.id])
  assert.equal((await credito(f.pedido.id)).situacao, "credito_guardado")
  await recusa(() => one("select registrar_credito($1,'reembolso')", [f.troca.id]), /já foi registrado/)
})

test("crédito para o próximo pedido aparece só para a mesma cliente e pode ser usado e desfeito", async () => {
  const f = await comCredito()
  const id = (await one("select registrar_credito($1,'proximo_pedido') as id", [f.troca.id])).id
  const novo = await one("insert into pedidos (origem,status,cliente_nome,cliente_email) values ('whatsapp','em_aberto','Ana','ANA@example.test ') returning id")
  const outra = await one("insert into pedidos (origem,status,cliente_nome,cliente_email) values ('whatsapp','em_aberto','Bia','bia@example.test') returning id")
  const disp = (await db.query("select * from creditos_do_pedido($1)", [novo.id])).rows
  assert.deepEqual(disp.map((d) => [d.id, num(d.valor), d.situacao, d.usado_aqui]), [[id, 80, "credito_guardado", false]])
  assert.deepEqual((await db.query("select * from creditos_do_pedido($1)", [outra.id])).rows, [])
  assert.deepEqual((await db.query("select * from creditos_do_pedido($1)", [f.pedido.id])).rows, []) // o próprio pedido não usa
  await recusa(() => one("select usar_credito($1,$2)", [id, outra.id]), /outra cliente/)
  await one("select usar_credito($1,$2)", [id, novo.id])
  const c = await credito(f.pedido.id)
  assert.deepEqual([c.situacao, c.usado_pedido_id], ["credito_usado", novo.id])
  assert.deepEqual((await db.query("select usado_aqui from creditos_do_pedido($1)", [novo.id])).rows, [{ usado_aqui: true }])
  await recusa(() => one("select usar_credito($1,$2)", [id, novo.id]), /já foi usado/)
  await recusa(() => one("select troca_acerto($1,'pendente')", [f.troca.id]), /já foi reembolsado ou usado/)
  await one("select usar_credito($1,$2,true)", [id, novo.id])
  assert.equal((await credito(f.pedido.id)).situacao, "credito_guardado")
})

test("mesma cliente por telefone ou CPF, com máscara diferente", async () => {
  const f = await comCredito(null)
  await db.query("update pedidos set cliente_telefone='+55 (11) 98765-4321', cliente_cpf='123.456.789-09' where id=$1", [f.pedido.id])
  await one("select registrar_credito($1,'proximo_pedido')", [f.troca.id])
  const tel = await one("insert into pedidos (origem,status,cliente_nome,cliente_telefone) values ('whatsapp','em_aberto','A','11987654321') returning id")
  const cpf = await one("insert into pedidos (origem,status,cliente_nome,cliente_cpf) values ('whatsapp','em_aberto','A','12345678909') returning id")
  assert.equal((await db.query("select * from creditos_do_pedido($1)", [tel.id])).rows.length, 1)
  assert.equal((await db.query("select * from creditos_do_pedido($1)", [cpf.id])).rows.length, 1)
})

test("sem saldo a favor não registra crédito; destino inválido é recusado", async () => {
  const f = await fixture({ desconto: 20 })
  await one("select troca_aprovar($1,$2,'opcao',$3)", [f.troca.id, f.pecas[0].id, f.opcoes[0].id]) // opção mais cara: cliente paga
  await recusa(() => one("select registrar_credito($1,'reembolso')", [f.troca.id]), /Não há crédito/)
  await recusa(() => one("select registrar_credito($1,'pix')", [f.troca.id]), /inválido/)
  assert.equal(num((await one("select count(*) n from creditos_cliente")).n), 0)
})

test("equipe só lê créditos; escrita só pelas funções e anon não acessa", async () => {
  const f = await comCredito()
  await db.exec("set local role authenticated")
  const id = (await one("select registrar_credito($1,'reembolso') as id", [f.troca.id])).id
  await recusa(() => db.query("update creditos_cliente set valor=1 where id=$1", [id]), /permission denied/)
  await recusa(() => db.query("delete from creditos_cliente where id=$1", [id]), /permission denied/)
  await db.exec("reset role; set local role anon")
  await recusa(() => db.query("select * from v_creditos_cliente"), /permission denied/)
  await recusa(() => one("select marcar_reembolsado($1)", [id]), /permission denied/)
})
