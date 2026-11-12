import { expect, test } from "vitest"
import { db, one, criarBanco } from "./suporte.mjs"
import { fixture, recusa, somaFixture, escolher, concluir } from "./fixtures.mjs"

test("V20: restrição impede mais bipagens que unidades, inclusive por atualização direta", async () => {
  const f = await fixture()
  await db.exec("set local role authenticated")
  await recusa(() => db.query("update pedido_itens set qtd_bipada=qtd+1 where id=$1", [f.itens[0].id]), /pedido_itens_bipagem_limite/)
  expect((await one("select qtd_bipada from pedido_itens where id=$1", [f.itens[0].id])).qtd_bipada).toBe(0)
})
test("adicional e venda de origem precisam ser gravadas juntas", async () => {
  const { i1 } = await somaFixture()
  await recusa(() => db.query("update pedido_itens set adicional=true where id=$1", [i1.id]), /pedido_itens_vinculo_adicional/)
})
test("V27: nem o auxiliar pode ligar opção de outra peça no carrinho", async () => {
  const f = await fixture({ quantidade: 2 })
  await recusa(() => one("select troca_carrinho_definir($1,$2)", [f.pecas[0].id, f.opcoes[1].id]), /não pertence a esta peça/)
  expect(Number((await one("select count(*) as n from troca_escolhas")).n)).toBe(0)
})
test("V27: auxiliar não muda escolha de peça já concluída", async () => {
  const f = await fixture()
  await escolher(f); await concluir(f)
  await recusa(() => one("select troca_carrinho_definir($1,$2)", [f.pecas[0].id, f.opcoes[0].id]), /concluída ou cancelada/)
})
test("V35: gatilhos antigos não são RPCs públicas", async () => {
  const p = await one(`select has_function_privilege('anon','public.tg_itens_depois()','execute') as itens,
    has_function_privilege('anon','public.tg_pedidos_depois()','execute') as pedidos`)
  expect(p).toEqual({ itens: false, pedidos: false })
})
test("vigia encontra dado legado de etapa sem alterar pedidos", async () => {
  let id
  const legado=await criarBanco({antesDe:'20261118160000',prepararAntes: async (b) => {
    id=(await b.query("insert into pedidos(origem,status) values ('shopify','faturamento') returning id")).rows[0].id
    await b.query("insert into pedido_itens(pedido_id,origem,nome,qtd,preco) values ($1,'avulso','Legada',1,10)",[id])
  }})
  try {
    const antes=(await legado.query('select to_jsonb(p) as dado from pedidos p where id=$1',[id])).rows[0].dado
    const alertas=(await legado.query('select * from listar_inconsistencias() where pedido_id=$1',[id])).rows
    expect(alertas.map(a=>a.regra)).toContain('etapa_adiantada')
    expect((await legado.query('select to_jsonb(p) as dado from pedidos p where id=$1',[id])).rows[0].dado).toEqual(antes)
  } finally { await legado.close() }
})
test("vigia grava uma fotografia por execução, inclusive sem ocorrências, e mantém as anteriores", async () => {
  const a = await one("select registrar_vistoria() as id")
  const antes = await one("select * from v_vistoria_resumo")
  expect(antes.id).toBe(a.id)
  expect(antes.qtd_ocorrencias).toBe(0)
  await db.query("insert into pedidos(origem,status,valor_total) values ('shopify','novo',-1)")
  const b = await one("select registrar_vistoria() as id")
  const atual = await one("select * from v_vistoria_resumo")
  expect(atual.id).toBe(b.id)
  expect(atual.qtd_ocorrencias).toBeGreaterThan(0)
  expect((await one("select qtd_ocorrencias from vistoria_execucoes where id=$1", [a.id])).qtd_ocorrencias).toBe(0)
})
test("equipe só lê o vigia; anon não lê nem executa; ninguém do app dispara sua escrita", async () => {
  await db.exec("set local role authenticated")
  await one("select * from v_vistoria_resumo")
  await recusa(() => one("select registrar_vistoria()"), /permission denied/)
  await recusa(() => db.query("insert into vistoria_execucoes(ocorrencias,qtd_ocorrencias) values ('[]',0)"), /permission denied/)
  await recusa(() => db.query("delete from vistoria_execucoes"), /permission denied/)
  await db.exec("set local role anon")
  await recusa(() => one("select * from v_vistoria_resumo"), /permission denied/)
  await recusa(() => one("select * from listar_inconsistencias()"), /permission denied/)
  await recusa(() => one("select registrar_vistoria()"), /permission denied/)
})
test("agendamento diário aponta para a função de observação, sem credencial ou chamada Edge", async () => {
  const j = await one("select schedule,command from cron.job where jobname='arvenne-vistoria-diaria'")
  expect(j).toEqual({ schedule: "0 6 * * *", command: "select public.registrar_vistoria();" })
})

test("V20: bipar confere o SKU da peça e recusa peça retirada", async () => {
  const p = await one("insert into pedidos (origem, status, cliente_nome) values ('whatsapp','separacao','C') returning id")
  const i = await one("insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status) values ($1,'clube','Anel','an 1',2,10,'encontrado') returning id", [p.id])
  await db.exec("set local role authenticated")
  await recusa(() => one("select bipar($1,$2,'OUTRO-SKU')", [p.id, i.id]), /não é o SKU/)
  expect((await one("select bipar($1,$2,' AN1 ') r", [p.id, i.id])).r).toBe("ok")
  await db.query("update pedido_itens set status='removido', observacao='cliente desistiu' where id=$1", [i.id])
  await recusa(() => one("select bipar($1,$2,'AN1')", [p.id, i.id]), /não está separada/)
  await recusa(() => one("select bipar_ajustar($1,1)", [i.id]), /não está separada/)
  expect((await one("select bipar_ajustar($1,-1) r", [i.id])).r).toBe(0)
})
test("V28: valor de opção concluída não pode reescrever o histórico", async () => {
  const f = await fixture()
  await escolher(f); await concluir(f)
  const antes = await one("select diferenca_total from v_troca_resumo where troca_id=$1", [f.troca.id])
  await recusa(() => db.query("update troca_opcoes set preco=100 where id=$1", [f.opcoes[0].id]), /histórico/)
  await recusa(() => db.query("insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco) values ($1,'site','X','X',1)", [f.pecas[0].id]), /histórico/)
  expect((await one("select diferenca_total from v_troca_resumo where troca_id=$1", [f.troca.id])).diferenca_total).toBe(antes.diferenca_total)
})
test("V36: calendário cobre até 2040 com a mesma regra e o vigia avisa quando estiver acabando", async () => {
  // Páscoa e feriados móveis batem com os anos já cadastrados à mão.
  for (const [ano, sexta] of [[2026, "2026-04-03"], [2027, "2027-03-26"], [2028, "2028-04-14"]])
    expect((await one("select (public.pascoa($1) - 2)::text d", [ano])).d).toBe(sexta)
  expect((await one("select count(*)::int n from feriados where extract(year from data)=2033")).n).toBe(13)
  expect((await one("select max(data)::text d from feriados")).d).toBe("2040-12-25")
  // Pagamento em 29/12/2028 às 15h: 01/01/2029 agora é feriado e o prazo vai para 03/01 (antes: 02/01).
  expect((await one("select to_char(prazo_envio('2028-12-29 15:00-03') at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') p")).p).toBe("2029-01-03 15:00")
  const aviso = async () => (await db.query("select regra from listar_inconsistencias() where regra='calendario_feriados'")).rows.length
  expect(await aviso()).toBe(0)
  await db.query("delete from feriados where data > current_date + 200")
  expect(await aviso()).toBe(1)
})
