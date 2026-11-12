import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one, criarBanco } from './suporte.mjs'
import { fixture, escolher, concluir, recusa, num } from './fixtures.mjs'

async function troca() {
  const f=await fixture({desconto:0})
  await escolher(f); await concluir(f)
  return f
}

test('V08: recebimento repetido, estorno e novo recebimento preservam o dinheiro e o histórico', async () => {
  const f=await troca()
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  const pago=async()=>num((await one('select total_pago from v_pedidos where id=$1',[f.pedido.id])).total_pago)
  assert.equal(await pago(),150)
  assert.equal((await one('select count(*)::int n from movimentos_financeiros where pedido_id=$1',[f.pedido.id])).n,1)
  await one("select troca_acerto($1,'pendente')",[f.troca.id])
  await one("select troca_acerto($1,'pendente')",[f.troca.id])
  assert.equal(await pago(),100)
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  assert.equal(await pago(),150)
  const m=(await db.query('select tipo,valor,estorna_id from movimentos_financeiros where pedido_id=$1 order by id',[f.pedido.id])).rows
  assert.deepEqual(m.map(x=>num(x.valor)),[50,-50,50])
  assert.ok(m[1].estorna_id)
  await recusa(()=>db.query('delete from movimentos_financeiros where pedido_id=$1',[f.pedido.id]),/permission denied/)
})

test('V08: retirar substituta após receber a diferença devolve apenas o que foi recebido', async () => {
  const f=await troca()
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where pedido_id=$1 and status<>'removido'",[f.pedido.id])
  assert.equal(num((await one('select a_devolver from v_pedidos where id=$1',[f.pedido.id])).a_devolver),150)
  await one('select marcar_devolvido($1)',[f.pedido.id])
  assert.equal(num((await one('select total_pago from v_pedidos where id=$1',[f.pedido.id])).total_pago),0)
  await recusa(()=>one("select troca_acerto($1,'pendente')",[f.troca.id]),/já foi devolvido/)
  await one('select marcar_devolvido($1,true)',[f.pedido.id])
  const p=await one('select total_pago,a_devolver from v_pedidos where id=$1',[f.pedido.id])
  assert.deepEqual([num(p.total_pago),num(p.a_devolver)],[150,150])
})

test('V08: mudar para crédito antes de pagar a diferença compensa a cobrança e limita o crédito ao pago', async () => {
  const f=await troca()
  const i=await one("select id from pedido_itens where pedido_id=$1 and status='pendente'",[f.pedido.id])
  await db.query("update pedido_itens set status='falta' where id=$1",[i.id])
  const t=await one('insert into trocas(pedido_id) values ($1) returning *',[f.pedido.id])
  const tp=await one('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning *',[t.id,i.id])
  await one("select troca_aprovar($1,$2,'credito',null)",[t.id,tp.id])
  const ac=await one('select troca_id,saldo from v_pedido_acerto where pedido_id=$1',[f.pedido.id])
  assert.equal(ac.troca_id,t.id)
  assert.equal(num(ac.saldo),-100)
  await one("select troca_acerto($1,'credito_registrado')",[t.id])
  assert.equal(num((await one('select total_pago from v_pedidos where id=$1',[f.pedido.id])).total_pago),0)
  assert.equal((await one('select acerto_status from trocas where id=$1',[f.troca.id])).acerto_status,'sem_diferenca')
  assert.equal(num((await one('select valor from movimentos_financeiros where troca_id=$1',[t.id])).valor),-100)
})


test('V08: equipe não altera movimentos; estorno precisa corresponder ao original', async () => {
  const f=await troca()
  await one("select troca_acerto($1,'recebido')",[f.troca.id])
  const m=await one('select * from movimentos_financeiros where troca_id=$1',[f.troca.id])
  await recusa(()=>db.query("insert into movimentos_financeiros(pedido_id,tipo,valor) values ($1,'troca_recebida',999)",[f.pedido.id]),/permission denied/)
  await db.exec('reset role')
  await recusa(()=>db.query('update movimentos_financeiros set valor=999 where id=$1',[m.id]),/estorno/)
  await recusa(()=>db.query("insert into movimentos_financeiros(pedido_id,troca_id,tipo,valor,estorna_id) values ($1,$2,'estorno',-1,$3)",[f.pedido.id,f.troca.id,m.id]),/exatamente/)
  await db.exec('set local role anon')
  await recusa(()=>one('select * from movimentos_financeiros'),/permission denied/)
})

test('V08: saldo de recebimento legado não é presumido nem pode ser liberado por edição da flag', async () => {
  let pid,tid
  const legado=await criarBanco({antesDe:'20261118190000',prepararAntes:async b=>{
    const q=async(sql,args=[]) => (await b.query(sql,args)).rows[0]
    pid=(await q("insert into pedidos(origem,status,valor_pago) values ('whatsapp','aguardando_cliente',100) returning id")).id
    const i=await q("insert into pedido_itens(pedido_id,origem,nome,qtd,preco,status) values ($1,'avulso','Legada',2,50,'falta') returning id",[pid])
    const t=await q('insert into trocas(pedido_id) values ($1) returning id',[pid]);tid=t.id
    const tp=await q('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning id',[tid,i.id])
    const o=await q("insert into troca_opcoes(troca_peca_id,origem,nome,preco) values ($1,'site','Nova',75) returning id",[tp.id])
    await q("select troca_aprovar($1,$2,'opcao',$3)",[tid,tp.id,o.id])
    await q("select troca_acerto($1,'recebido')",[tid])
  }})
  try {
    assert.equal((await legado.query('select total_pago from v_pedidos where id=$1',[pid])).rows[0].total_pago,null)
    const avisos=(await legado.query('select regra from listar_inconsistencias() where pedido_id=$1',[pid])).rows
    assert.ok(avisos.some(a=>a.regra==='pagamento_sem_conferencia'))
    await legado.exec('begin; set local role authenticated;')
    await legado.query('update trocas set acerto_controle_novo=true where id=$1',[tid])
    assert.equal((await legado.query('select acerto_controle_novo from trocas where id=$1',[tid])).rows[0].acerto_controle_novo,false)
    await assert.rejects(()=>legado.query("select troca_acerto($1,'pendente')",[tid]),/anterior ao controle/)
    await legado.exec('rollback')
  } finally {await legado.close()}
})


test('V08: incoerência antiga não autoriza receber ou devolver dinheiro pelo saldo inválido', async () => {
  const f=await fixture({shopify:true})
  await escolher(f);await concluir(f)
  await db.query('update pedidos set valor_total=-100 where id=$1',[f.pedido.id])
  await recusa(()=>one("select troca_acerto($1,'recebido')",[f.troca.id]),/Confira o pagamento/)
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where pedido_id=$1 and status='pendente'",[f.pedido.id])
  await recusa(()=>one('select marcar_devolvido($1)',[f.pedido.id]),/incoerentes/)
  assert.equal((await one('select count(*)::int n from movimentos_financeiros where pedido_id=$1',[f.pedido.id])).n,0)
})

test('segunda troca sem diferença não apaga a diferença ainda não recebida da primeira', async () => {
  const p=await one("insert into pedidos(origem,status,cliente_nome,forma_pagamento,valor_pago,pago_em) values ('whatsapp','separacao','C','Cartão',100,now()) returning id")
  const i=await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values ($1,'clube','Anel','A',1,100) returning id",[p.id])
  await db.exec('set local role authenticated')
  const trocar=async (item,preco)=>{
    await db.query("update pedido_itens set status='falta' where id=$1",[item])
    const t=await one('insert into trocas(pedido_id) values ($1) returning id',[p.id])
    const tp=await one('insert into troca_pecas(troca_id,item_id) values ($1,$2) returning id',[t.id,item])
    const o=await one("insert into troca_opcoes(troca_peca_id,origem,nome,sku,preco) values ($1,'clube','Nova','NOVA',$2) returning id",[tp.id,preco])
    await db.query("update trocas set status='enviada' where id=$1",[t.id])
    await one("select troca_aprovar($1,$2,'opcao',$3)",[t.id,tp.id,o.id])
    return t.id
  }
  await trocar(i.id,150)
  const nova=await one("select id from pedido_itens where pedido_id=$1 and status='pendente'",[p.id])
  const t2=await trocar(nova.id,150)
  const v=await one('select total_geral,total_pago,acerto_pendente from v_pedidos where id=$1',[p.id])
  assert.deepEqual([num(v.total_geral),num(v.total_pago),v.acerto_pendente],[150,100,true])
  const alvo=await one('select acerto_troca_id from pedidos where id=$1',[p.id])
  assert.equal(alvo.acerto_troca_id,t2)
  await one("select troca_acerto($1,'recebido')",[t2])
  assert.equal(num((await one('select total_pago from v_pedidos where id=$1',[p.id])).total_pago),150)
})
