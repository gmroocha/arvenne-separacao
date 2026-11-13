import {expect,test} from 'vitest'
import fc from 'fast-check'
import {db,one} from './suporte.mjs'

// Oráculo baseado no trabalho de cada peça, independente dos contadores/agregados da view.
const peca=fc.record({status:fc.constantFrom('pendente','encontrado','falta','defeito','removido'),qtd:fc.integer({min:1,max:4}),conferida:fc.boolean(),etiquetada:fc.boolean(),bipada:fc.boolean()})
const cenario=fc.record({itens:fc.array(peca,{maxLength:5}),nota:fc.boolean(),frete:fc.boolean(),fornecedor:fc.boolean(),embalado:fc.boolean(),postado:fc.boolean()})
test('propriedade: nenhuma combinação de peças ou documentos libera etapa sem os pré-requisitos',async()=>{
 await fc.assert(fc.asyncProperty(cenario,async c=>{
  await db.exec('savepoint maquina')
  try{
   const p=await one("insert into pedidos(origem,status) values('whatsapp','separacao') returning id")
   for(const i of c.itens)await db.query(`insert into pedido_itens(pedido_id,origem,nome,qtd,preco,status,conferido_em,etiquetado_em,qtd_bipada)
    values($1,'avulso','Peça', $2,10,$3,$4,$5,$6)`,[p.id,i.qtd,i.status,i.conferida?'2026-11-12T12:00:00Z':null,i.etiquetada?'2026-11-12T12:00:00Z':null,i.bipada?i.qtd:0])
   await db.query(`update pedidos set nf_emitida_em=$2,frete_gerado_em=$3,pedido_fornecedor_em=$4,embalado_em=$5,postado_em=$6 where id=$1`,[p.id,...['nota','frete','fornecedor','embalado','postado'].map(k=>c[k]?'2026-11-12T12:00:00Z':null)])
   const vivas=c.itens.filter(i=>i.status!=='removido')
   const separado=vivas.length>0&&vivas.every(i=>i.status==='encontrado')
   const conferido=separado&&vivas.every(i=>i.conferida)
   const etiquetado=conferido&&vivas.every(i=>i.etiquetada)
   const bipado=etiquetado&&vivas.every(i=>i.bipada)
   const faturado=bipado&&c.nota&&c.frete&&c.fornecedor
   const embalado=faturado&&c.embalado
   const esperado={conferencia:separado,etiquetagem:conferido,bipagem:etiquetado,faturamento:bipado,embalagem:faturado,pronto_envio:embalado,enviado:embalado&&c.postado}
   const regras=(await one('select etapas_permitidas e from v_pedidos where id=$1',[p.id])).e
   await db.exec('set local role authenticated')
   for(const [destino,pode]of Object.entries(esperado)){
    expect(regras[destino]===null,`${destino}: regra informada à interface`).toBe(pode)
    await db.exec('savepoint destino')
    let aceito=true
    try{await db.query('update pedidos set status=$2 where id=$1',[p.id,destino])}catch(e){expect(e.message).toMatch(/peças|separação|Confira|Etiquete|Bipe|nota fiscal|embalagem|postagem/);aceito=false}
    await db.exec('rollback to savepoint destino')
    expect(aceito,`${destino}: proteção real do gatilho`).toBe(pode)
   }
  }finally{await db.exec('rollback to savepoint maquina; reset role')}
 }),{numRuns:60,seed:20261113,verbose:true})
},120000)
