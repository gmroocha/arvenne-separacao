import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
const sim=vi.hoisted(()=>({handler:null,respostas:[],consultas:[]}))
vi.mock('../../supabase/functions/_shared/http.ts',()=>({cors:{},exigirEquipe:async()=>null,json:(body,status=200)=>new Response(JSON.stringify(body),{status})}))
vi.mock('../../supabase/functions/_shared/shopify.ts',()=>({consulta:async(q,v)=>{sim.consultas.push({q,v});const r=sim.respostas.shift();if(r instanceof Error)throw r;return r}}))
beforeAll(async()=>{vi.stubGlobal('Deno',{serve:fn=>{sim.handler=fn}});await import('../../supabase/functions/carrinho-ler/index.ts')})
afterAll(()=>vi.unstubAllGlobals())
beforeEach(()=>{sim.respostas=[];sim.consultas=[]})
const token='abcdefghij12345'
const item=n=>({quantity:n,variant:{legacyResourceId:String(n)}})
const checkout=(nodes,pageInfo={hasNextPage:false,endCursor:null})=>({id:'gid://shopify/AbandonedCheckout/1',abandonedCheckoutUrl:`https://loja.test/checkouts/ac/${token}/recover`,lineItems:{nodes,pageInfo}})
const pagina=nodes=>({abandonedCheckouts:{nodes,pageInfo:{hasNextPage:false,endCursor:null}}})
const chamar=async()=>sim.handler(new Request('https://edge.ficticia.test',{method:'POST',body:JSON.stringify({url:`https://loja.test/checkouts/ac/${token}/recover`})}))

test('V43: checkout com mais de 100 linhas só retorna depois de ler todas as páginas',async()=>{
 const primeiro = checkout(Array.from({length:100},(_,i)=>item(i+1)),{hasNextPage:true,endCursor:'p1'})
 sim.respostas.push(pagina([primeiro]), {node:{lineItems:primeiro.lineItems}}, {node:{lineItems:{nodes:[item(101)],pageInfo:{hasNextPage:false,endCursor:'p2'}}}})
 const r=await chamar();expect(r.status).toBe(200)
 expect((await r.json()).itens).toHaveLength(101)
 expect(sim.consultas[0].q).not.toContain('lineItems(')
 expect(sim.consultas[1].v).toEqual({id:'gid://shopify/AbandonedCheckout/1',cursor:null})
 expect(sim.consultas[2].v).toEqual({id:'gid://shopify/AbandonedCheckout/1',cursor:'p1'})
})
test('V43: token parecido em outra parte da URL não escolhe o checkout errado',async()=>{
 const errado={...checkout([item(1)]),abandonedCheckoutUrl:`https://loja.test/checkouts/ac/outrotoken12345/recover?key=${token}`}
 sim.respostas.push(pagina([errado,checkout([item(2)])]),{node:{lineItems:checkout([item(2)]).lineItems}})
 expect((await (await chamar()).json()).itens).toEqual([{variantId:'2',qtd:2}])
})
test('V43: falha no restante das linhas não devolve um carrinho truncado',async()=>{
 sim.respostas.push(pagina([checkout([item(1)],{hasNextPage:true,endCursor:'p1'})]),new Error('Shopify indisponível'))
 const r=await chamar();expect(r.status).toBe(500);expect((await r.json()).itens).toBeUndefined()
})
