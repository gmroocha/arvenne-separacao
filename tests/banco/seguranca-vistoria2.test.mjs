import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, publica, recusa } from './fixtures.mjs'

test('Vistoria 2: todas as tabelas têm RLS e anon não lê nem grava relações internas', async()=>{
 const {rows}=await db.query(`select c.relname nome,c.relkind tipo,c.relrowsecurity rls,c.reloptions opcoes,
 has_table_privilege('anon',c.oid,'select,insert,update,delete') anon
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v')`)
 expect(rows.length).toBeGreaterThan(20)
 for(const r of rows){
  expect(r.anon,r.nome).toBe(false)
  if(r.tipo==='r')expect(r.rls,r.nome).toBe(true)
  else expect(r.opcoes,r.nome).toContain('security_invoker=true')
 }
 for(const nome of ['pedidos','pedido_itens','movimentos_financeiros','pedido_eventos']){
  expect((await one("select has_table_privilege('authenticated',$1,'delete') pode",[nome])).pode,nome).toBe(false)
 }
})

test('Vistoria 2: V45: todo definer fixa search_path e só quatro funções definer são públicas por token',async()=>{
 const {rows}=await db.query(`select p.proname nome,p.proconfig config,has_function_privilege('anon',p.oid,'execute') anon
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`)
 for(const r of rows)expect(r.config?.some(x=>/^search_path=public, pg_temp$/.test(x)),r.nome).toBe(true)
 expect(rows.filter(r=>r.anon).map(r=>r.nome).sort()).toEqual(['romaneio_publico','troca_carrinho','troca_escolher','troca_publica'])
})

test('Vistoria 2: páginas públicas não expõem dados pessoais nem dados brutos, mesmo nas estruturas aninhadas',async()=>{
 const f=await fixture()
 await db.query(`update pedidos set cliente_cpf='12345678901',cliente_email='privado@ficticio.test',
 cliente_telefone='11999999999',entrega_logradouro='Endereço sigiloso' where id=$1`,[f.pedido.id])
 const romaneio=(await one('select romaneio_publico($1) r',[f.pedido.token_publico])).r
 const troca=await publica(f)
 const conferir=obj=>{
  if(!obj || typeof obj!=='object')return
  for(const [k,v]of Object.entries(obj)){
   expect(k).not.toMatch(/cpf|email|telefone|entrega_|endereco|shopify_bruto|custo/i)
   if(v&&typeof v==='object')conferir(v)
   if(typeof v==='string')expect(['12345678901','privado@ficticio.test','11999999999','Endereço sigiloso']).not.toContain(v)
  }
 }
 conferir(romaneio);conferir(troca)
})

test('Vistoria 2: token de uma troca não escolhe peça ou opção de outra',async()=>{
 const a=await fixture(),b=await fixture()
 await db.exec('set local role anon')
 await recusa(()=>one("select troca_escolher($1,$2,'opcao',$3)",[a.troca.token,b.itens[0].id,b.opcoes[0].id]),/peça|Peça|pertence/)
 await recusa(()=>one("select troca_carrinho($1,$2,$3,1)",[a.troca.token,a.itens[0].id,b.opcoes[0].id]),/opção|Opção|pertence/)
})


test('V45: tabela temporária não desvia o histórico de escolha executado pelo definer',async()=>{
 const f=await fixture()
 // Um nome temporário tem precedência implícita quando pg_temp não está no search_path explícito.
 await db.exec('create temporary table pedido_eventos (like public.pedido_eventos including defaults including identity)')
 await one("select troca_escolher($1,$2,'opcao',$3)",[f.troca.token,f.itens[0].id,f.opcoes[0].id])
 expect((await one("select count(*)::int n from public.pedido_eventos where pedido_id=$1 and tipo='troca_respondida'",[f.pedido.id])).n).toBe(1)
 expect((await one('select count(*)::int n from pg_temp.pedido_eventos')).n).toBe(0)
})
