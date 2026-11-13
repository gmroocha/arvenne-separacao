import {expect,test} from 'vitest'
import {db,one} from './suporte.mjs'
import {recusa} from './fixtures.mjs'

async function montar(status='novo'){
 const p=await one("insert into pedidos(origem,status,cliente_nome) values('whatsapp',$1,'Cliente') returning id",[status])
 const i=await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values($1,'avulso','Peça','P1',2,10) returning id",[p.id])
 await db.exec('set local role authenticated');return {p,i}
}
test('V57: a primeira peça encontrada tira da fila na mesma transação, sem depender de resposta ao navegador',async()=>{
 const {p,i}=await montar()
 await one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:"encontrado"})])
 expect((await one('select status from pedidos where id=$1',[p.id])).status).toBe('separacao')
 // Repetir a mesma ação não duplica o histórico da peça nem a mudança de etapa.
 await one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:"encontrado"})])
 expect(Number((await one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='status' and para='separacao'",[p.id])).n)).toBe(1)
})
test.each(['falta','defeito'])('V57: %s abre o desvio junto com a peça e preserva a etapa de origem',async status=>{
 const {p,i}=await montar('separacao')
 await one('select marcar_falta($1,1,$2)',[i.id,status])
 expect(await one('select status,etapa_antes_desvio from pedidos where id=$1',[p.id])).toEqual({status:'avisar_cliente',etapa_antes_desvio:'separacao'})
})


test('V57: falta parcial na Conferência guarda a Conferência, sem perder a origem durante a divisão',async()=>{
 const {p,i}=await montar()
 await one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:'encontrado'})])
 await db.query("update pedidos set status='conferencia' where id=$1",[p.id])
 await one("select marcar_falta($1,1,'falta')",[i.id])
 expect(await one('select status,etapa_antes_desvio from pedidos where id=$1',[p.id])).toEqual({status:'avisar_cliente',etapa_antes_desvio:'conferencia'})
})
test('V57: resolver a falta sai do desvio na mesma ação, sem segunda requisição',async()=>{
 const {p,i}=await montar('separacao')
 await one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:'falta'})])
 await one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:'encontrado'})])
 expect((await one('select status from pedidos where id=$1',[p.id])).status).toBe('separacao')
})


test('V57: a ação atômica só aceita campos da peça e não é pública',async()=>{
 const {i}=await montar()
 await recusa(()=>one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({pedido_id:'00000000-0000-0000-0000-000000000000'})]),/campo/)
 await db.exec('set local role anon')
 await recusa(()=>one('select alterar_item($1,$2::jsonb)',[i.id,JSON.stringify({status:'encontrado'})]),/permission denied/)
})
