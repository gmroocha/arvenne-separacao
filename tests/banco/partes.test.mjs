import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { somaFixture, num, recusa } from './fixtures.mjs'

async function adicional({ origem='whatsapp', tipo='opcao', cobertura=0 }={}) {
  const f=await somaFixture({ principal:{origem} })
  if (origem==='shopify') {
    await db.query('update pedidos set valor_total=90 where id=$1',[f.p.id])
    await db.query("update pedido_itens set origem='shopify',preco_pago=45 where pedido_id=$1",[f.p.id])
  }
  await db.query("update pedido_itens set qtd=2,preco=50 where id=$1",[f.i1.id])
  await db.query("update pedido_itens set status='removido',observacao='removida na venda' where id=$1",[f.i2.id])
  await db.query("update pedidos set desconto_tipo='percentual',desconto_valor=20 where id=$1",[f.w.id])
  await one("select somar_venda($1,'Cartão',80)",[f.w.id])
  await db.query("update pedido_itens set status='falta' where id=$1",[f.i1.id])
  const t=await one('insert into trocas(pedido_id,cobrir_ate) values ($1,$2) returning *',[f.p.id,cobertura])
  const tp=await one('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning *',[t.id,f.i1.id])
  const o=await one("insert into troca_opcoes(troca_peca_id,origem,nome,sku,preco) values ($1,'site','Substituta','NOVA',75) returning *",[tp.id])
  await db.query("update trocas set status='enviada' where id=$1",[t.id])
  await one('select troca_escolher($1,$2,$3,$4)',[t.token,f.i1.id,tipo,tipo==='opcao'?o.id:null])
  return {...f,t,tp,o}
}

test.each([
  ['whatsapp','opcao',0,210],['shopify','opcao',0,210],
  ['whatsapp','credito',0,90],['shopify','credito',0,90],
  ['whatsapp','opcao',10,200],['shopify','opcao',10,200],
])('V03: troca de adicional conserva cada parte (%s, %s, cobertura %s)', async (origem,tipo,cobertura,esperado) => {
  const f=await adicional({origem,tipo,cobertura})
  const antes=await one('select total,total_geral from v_pedidos where id=$1',[f.p.id])
  assert.equal(num(antes.total_geral),170)
  const anunciado=await one('select diferenca_total from v_troca_resumo where troca_id=$1',[f.t.id])
  await one('select troca_aprovar($1,$2,$3,$4)',[f.t.id,f.tp.id,tipo,tipo==='opcao'?f.o.id:null])
  const p=await one('select total,total_geral,valor_somado,partes from v_pedidos where id=$1',[f.p.id])
  assert.equal(num(p.total),90)
  assert.equal(num(p.total_geral),esperado)
  assert.equal(num(p.total_geral),num(antes.total_geral)+num(anunciado.diferenca_total))
  assert.equal(num(p.partes[0].somada_valor),esperado-90)
  const origemPublica=(await one('select romaneio_publico($1) as r',[f.w.token_publico])).r
  assert.equal(origemPublica.total,80)
  if (tipo==='opcao') {
    const nova=await one("select adicional,venda_origem_id from pedido_itens where pedido_id=$1 and status='pendente' and sku='NOVA'",[f.p.id])
    assert.deepEqual(nova,{adicional:true,venda_origem_id:f.w.id})
  }
  const ac=await one('select novo_total from v_pedido_acerto where troca_id=$1',[f.t.id])
  assert.equal(num(ac.novo_total),esperado)
})

test('V03: dividir a adicional preserva seu valor exato e troca só a quantidade em falta', async () => {
  const f=await adicional()
  const n=(await one('select marcar_falta($1,1) as id',[f.i1.id])).id
  assert.equal(num((await one('select valor_pago_linha from pedido_itens where id=$1',[n])).valor_pago_linha),40)
  await one("select troca_aprovar($1,$2,'opcao',$3)",[f.t.id,f.tp.id,f.o.id])
  assert.equal(num((await one('select total_geral from v_pedidos where id=$1',[f.p.id])).total_geral),190)
  assert.equal((await one('select venda_origem_id from pedido_itens where id=$1',[n])).venda_origem_id,f.w.id)
})

test('V03: segunda troca de adicional com cobertura anterior não duplica o abatimento', async () => {
  const f=await adicional({cobertura:10})
  await one("select troca_aprovar($1,$2,'opcao',$3)",[f.t.id,f.tp.id,f.o.id])
  await one("select troca_acerto($1,'recebido')",[f.t.id])
  const i=await one("select id from pedido_itens where pedido_id=$1 and sku='NOVA' and status='pendente'",[f.p.id])
  await db.query("update pedido_itens set status='falta' where id=$1",[i.id])
  const t=await one('insert into trocas(pedido_id) values ($1) returning *',[f.p.id])
  const tp=await one('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning *',[t.id,i.id])
  const o=await one("insert into troca_opcoes(troca_peca_id,origem,nome,preco) values ($1,'site','Segunda',100) returning *",[tp.id])
  await one("select troca_aprovar($1,$2,'opcao',$3)",[t.id,tp.id,o.id])
  const p=await one('select total,total_geral,valor_somado from v_pedidos where id=$1',[f.p.id])
  assert.equal(num(p.total),90)
  assert.equal(num(p.valor_somado),146.66)
  assert.equal(num(p.total_geral),236.66)
})

test('V03: cobertura em troca mista é repartida sem perder centavos nem mudar a outra parte', async () => {
  const f=await adicional({cobertura:50})
  const original=await one("select id from pedido_itens where pedido_id=$1 and not adicional and status<>'removido'",[f.p.id])
  await db.query("update pedido_itens set status='falta' where id=$1",[original.id])
  const tp=await one('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning *',[f.t.id,original.id])
  const o=await one("insert into troca_opcoes(troca_peca_id,origem,nome,preco) values ($1,'site','Outra',75) returning *",[tp.id])
  await one("select troca_aprovar($1,$2,'opcao',$3)",[f.t.id,tp.id,o.id])
  await one("select troca_aprovar($1,$2,'opcao',$3)",[f.t.id,f.tp.id,f.o.id])
  const p=await one('select total,total_geral,valor_somado from v_pedidos where id=$1',[f.p.id])
  assert.equal(num(p.total),108.53)
  assert.equal(num(p.valor_somado),96.47)
  assert.equal(num(p.total_geral),205)
  assert.equal(num((await one('select sum(coberto) as n from v_cobertura_troca_peca where troca_id=$1',[f.t.id])).n),50)
})


test('base financeira é imutável e só o banco pode iniciar o retrato', async () => {
  const f=await adicional()
  await recusa(() => db.query("update pedidos set financeiro_retrato='{}' where id=$1",[f.p.id]),/histórico/)
  await recusa(() => one('select fechar_financeiro($1)',[f.p.id]),/permission denied/)
  await recusa(() => one(`insert into pedidos(origem,status,financeiro_retrato)
    values ('whatsapp','em_aberto','{"mercadorias":999}') returning id`),/operação autorizada/)
})
