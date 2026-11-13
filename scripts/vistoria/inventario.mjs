// Inventário efetivo das migrations, sem rede nem dados reais.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { criarBanco } from '../../tests/banco/suporte.mjs'

const db = await criarBanco()
try {
  const funcoes = (await db.query(`select p.oid::regprocedure::text assinatura, p.proname nome,
    p.prosecdef definer, p.proconfig configuracao, pg_get_functiondef(p.oid) definicao,
    has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') equipe
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' order by p.proname,assinatura`)).rows
  const relacoes = (await db.query(`select c.relname nome,c.relkind tipo,c.relrowsecurity rls,
    c.reloptions opcoes,case when c.relkind='v' then pg_get_viewdef(c.oid,true) end definicao,
    has_table_privilege('anon',c.oid,'select') anon,
    has_table_privilege('authenticated',c.oid,'select') equipe,
    has_table_privilege('authenticated',c.oid,'delete') excluir
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v') order by c.relkind,c.relname`)).rows
  const gatilhos = (await db.query(`select c.relname tabela,t.tgname nome, pg_get_triggerdef(t.oid) definicao
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`)).rows
  const arquivos = readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()
  function ultima(nome, tipo) {
    const rx = new RegExp(`create\\s+(?:or\\s+replace\\s+)?${tipo}\\s+(?:public\\.)?${nome}\\s*\\(`,'i')
    return arquivos.filter(f=>rx.test(readFileSync(`supabase/migrations/${f}`,'utf8'))).at(-1) ?? 'ver catálogo'
  }
  const sha = x => createHash('sha256').update(x).digest('hex').slice(0,12)
  const lines = ['# Inventário efetivo — Vistoria 2','','Gerado por `node scripts/vistoria/inventario.mjs` em PGlite, aplicando todas as migrations locais. As marcas indicam revisão, não apenas existência. Regenerar sobrescreve este arquivo: preservar as marcas de revisão antes de regenerar.','','## Funções SQL',`\n${funcoes.length} funções ativas. Hash SHA-256 abreviado identifica o corpo efetivo.\n`,'| Revisado | Assinatura | Última definição local | Definer | anon/equipe | Hash |','| --- | --- | --- | --- | --- | --- |']
  for (const f of funcoes) lines.push(`| [ ] | \`${f.assinatura}\` | \`${ultima(f.nome,'function')}\` | ${f.definer} | ${f.anon}/${f.equipe} | ${sha(f.definicao)} |`)
  lines.push('','## Tabelas e views','','| Revisado | Nome | Tipo | RLS / opções | anon/equipe SELECT | equipe DELETE |','| --- | --- | --- | --- | --- | --- |')
  for(const r of relacoes) lines.push(`| [ ] | \`${r.nome}\` | ${r.tipo==='v'?'view':'tabela'} | ${r.rls} / ${JSON.stringify(r.opcoes)} | ${r.anon}/${r.equipe} | ${r.excluir} |`)
  lines.push('','## Gatilhos ativos','')
  for(const g of gatilhos) lines.push(`- [ ] \`${g.tabela}.${g.nome}\`: \`${g.definicao}\``)
  mkdirSync('docs',{recursive:true})
  writeFileSync('docs/VISTORIA-2-INVENTARIO.md',lines.join('\n')+'\n')
  writeFileSync('/tmp/arvenne-vistoria2-catalogo.json',JSON.stringify({funcoes,relacoes,gatilhos},null,2))
  console.log(JSON.stringify({funcoes:funcoes.length,relacoes:relacoes.length,gatilhos:gatilhos.length,migrations:arquivos.length}))
} finally { await db.close() }
