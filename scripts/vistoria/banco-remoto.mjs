// Metadados, vigia e planos reais: o CLI sempre usa transação somente leitura.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdirSync,readdirSync,writeFileSync} from 'node:fs'
import {criarBanco} from '../../tests/banco/suporte.mjs'
const exec=promisify(execFile)
const query=async sql=>{
 const {stdout}=await exec('npx',['supabase','db','query','--remote','--read-only',sql],{maxBuffer:8*1024*1024})
 return JSON.parse(stdout.slice(stdout.indexOf('{'))).rows
}
const qFuncoes=`select p.oid::regprocedure::text assinatura,p.prosrc fonte,p.proconfig config,p.prosecdef definer,
 has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') equipe
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by assinatura`
const qRelacoes=`select c.relname nome,c.relkind tipo,c.relrowsecurity rls,c.reloptions opcoes,
 case when c.relkind='v' then pg_get_viewdef(c.oid,true) end definicao,
 has_table_privilege('anon',c.oid,'select,insert,update,delete') anon,
 has_table_privilege('authenticated',c.oid,'select') equipe,
 has_table_privilege('authenticated',c.oid,'delete') excluir
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') order by nome`
const qPoliticas=`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`
const qGatilhos=`select c.relname tabela,t.tgname nome,pg_get_triggerdef(t.oid) definicao
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal order by tabela,nome`
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)
const db=await criarBanco(),comparacao={}
try{
 for(const[nome,sql]of Object.entries({funcoes:qFuncoes,relacoes:qRelacoes,politicas:qPoliticas,gatilhos:qGatilhos})){
  const local=(await db.query(sql)).rows,remoto=await query(sql)
  comparacao[nome]={locais:local.length,remotas:remoto.length,iguais:canon(local)===canon(remoto)}
 }
}finally{await db.close()}
const locais=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort().map(x=>x.slice(0,14))
const remotas=(await query('select version from supabase_migrations.schema_migrations order by version')).map(x=>x.version)
comparacao.migrations={locais:locais.length,remotas:remotas.length,iguais:JSON.stringify(locais)===JSON.stringify(remotas)}
const inconsistencias=await query('select regra,count(*)::int quantidade,array_agg(numero order by numero) pedidos from listar_inconsistencias() group by regra order by regra')
const pedido="(select id from public.pedidos order by created_at desc limit 1)"
const trocaPedido="(select pedido_id from public.trocas where status in ('rascunho','enviada','respondida') order by created_at desc limit 1)"
const item="(select tp.item_id from public.troca_pecas tp join public.pedido_itens i on i.id=tp.item_id where i.status in ('falta','defeito') order by tp.created_at desc limit 1)"
const consultas={
 expedicao:"select * from public.v_pedidos where status in ('novo','separacao','avisar_cliente','aguardando_cliente','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') order by prazo nulls last limit 300",
 detalhe:`select * from public.v_pedidos where id=${pedido}`,
 v_pedidos:'select * from public.v_pedidos',
 troca_painel:`select public.troca_painel(${trocaPedido})`,
 sugerir_troca:`select * from public.sugerir_troca(${item})`,
 alteracoes:`select * from public.v_pedido_alteracoes where pedido_id=${trocaPedido}`,
}
const planos={}
for(const[nome,sql]of Object.entries(consultas)){
 const amostras=[]
 for(let n=0;n<3;n++){
  const r=await query(`explain (analyze,buffers,format json) ${sql}`),plano=r[0]['QUERY PLAN'][0]
  amostras.push({planejamentoMs:plano['Planning Time'],execucaoMs:plano['Execution Time'],linhas:plano.Plan['Actual Rows']})
 }
 planos[nome]={amostras,medianaMs:amostras.map(a=>a.execucaoMs).sort((a,b)=>a-b)[1]}
}
const resultado={comparacao,inconsistencias,planos}
mkdirSync('.playwright',{recursive:true});writeFileSync('.playwright/vistoria2-banco-depois.json',JSON.stringify(resultado,null,2))
console.log(JSON.stringify(resultado,null,2))
if(Object.values(comparacao).some(x=>!x.iguais))process.exitCode=1
