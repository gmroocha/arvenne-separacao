import {afterAll,beforeAll,beforeEach,expect,test,vi} from 'vitest'
const sim=vi.hoisted(()=>({handler:null,consultas:[],respostas:[]}))
vi.mock('../../supabase/functions/_shared/http.ts',()=>({cors:{},exigirEquipe:async()=>null,json:(x,status=200)=>new Response(JSON.stringify(x),{status})}))
vi.mock('../../supabase/functions/_shared/shopify.ts',()=>({shopify:async(q,v)=>{sim.consultas.push({q,v});const r=sim.respostas.shift();if(r instanceof Error)throw r;return r}}))
beforeAll(async()=>{vi.stubGlobal('Deno',{serve:fn=>{sim.handler=fn}});await import('../../supabase/functions/shopify-clientes/index.ts')})
afterAll(()=>vi.unstubAllGlobals())
beforeEach(()=>{sim.consultas=[];sim.respostas=[]})
const chamar=async q=>(await sim.handler(new Request('https://edge.ficticia.test',{method:'POST',body:JSON.stringify({q})}))).json()
const cliente={legacyResourceId:'123',displayName:'Cliente fictícia',email:'cliente@ficticia.test',phone:null,defaultAddress:null}

test('contrato clientes: busca curta não chama a Shopify',async()=>{
 expect(await chamar('An')).toEqual({clientes:[]});expect(sim.consultas).toEqual([])
})
test.each(['+55 (11) 99999-9999','(11) 99999-9999'])('contrato clientes: telefone %s vira consulta E.164',async q=>{
 sim.respostas.push({customers:{nodes:[]}})
 expect(await chamar(q)).toEqual({clientes:[]})
 expect(sim.consultas[0].v.q).toBe('phone:+5511999999999')
})
test('contrato clientes: dado da cliente permanece disponível se o campo opcional de CPF falhar',async()=>{
 sim.respostas.push({customers:{nodes:[cliente]}},new Error('Campo indisponível'))
 const r=await chamar('cliente@ficticia.test')
 expect(r.clientes).toHaveLength(1);expect(r.clientes[0].nome).toBe('Cliente fictícia');expect(r.clientes[0].cpf).toBeNull()
})
test('contrato clientes: erro da busca é informado, sem resultado de sucesso falso',async()=>{
 sim.respostas.push(new Error('Shopify indisponível. Tente novamente.'))
 const r=await chamar('Cliente');expect(r.erro).toContain('Tente novamente');expect(r.clientes).toBeUndefined()
})
// V68: CPF gravado no cadastro da cliente (metacampo "CPF/CNPJ" da Shopify) não vinha; só o do último pedido.
test('V68 contrato clientes: CPF do metacampo do cadastro, mesmo sem pedido',async()=>{
 sim.respostas.push({customers:{nodes:[cliente]}},{nodes:[{legacyResourceId:'123',metafields:{nodes:[
  {namespace:'custom',key:'data_nascimento',value:'1990-01-01',definition:{name:'Data de nascimento'}},
  {namespace:'custom',key:'cpf_cnpj',value:'529.982.247-25',definition:{name:'CPF/CNPJ'}},
 ]},orders:{nodes:[]}}]})
 const r=await chamar('cliente@ficticia.test')
 expect(r.clientes[0].cpf).toBe('52998224725')
})
test('V68 contrato clientes: metacampo do cadastro vence o CPF do último pedido; sem ele, usa o do pedido',async()=>{
 const pedido={nodes:[{localizedFields:{nodes:[{key:'TAX_CREDENTIAL_BR',value:'111.444.777-35'}]}}]}
 sim.respostas.push({customers:{nodes:[cliente,{...cliente,legacyResourceId:'456'}]}},{nodes:[
  {legacyResourceId:'123',metafields:{nodes:[{namespace:'app',key:'documento',value:'11.222.333/0001-81',definition:null}]},orders:pedido},
  {legacyResourceId:'456',metafields:{nodes:[{namespace:'custom',key:'tipo_cadastro',value:'PF',definition:{name:'Tipo de cadastro'}}]},orders:pedido},
 ]})
 const r=await chamar('cliente@ficticia.test')
 expect(r.clientes.map(c=>c.cpf)).toEqual(['11222333000181','11144477735'])
})
