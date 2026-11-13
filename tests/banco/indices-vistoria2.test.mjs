import {expect,test} from 'vitest'
import {db} from './suporte.mjs'

test('V48: toda chave estrangeira pública tem índice de apoio nas colunas iniciais',async()=>{
 const {rows}=await db.query(`select c.conrelid::regclass::text tabela,c.conname restricao
 from pg_constraint c join pg_namespace n on n.oid=c.connamespace
 where n.nspname='public' and c.contype='f' and not exists(
 select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and (i.indpred is null or exists(select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k where pg_get_expr(i.indpred,i.indrelid)=format('(%I IS NOT NULL)',a.attname)))
 and i.indnkeyatts>=cardinality(c.conkey)
 and (select array_agg(k order by ord) from unnest(i.indkey) with ordinality a(k,ord) where ord<=cardinality(c.conkey))=c.conkey
 ) order by tabela,restricao`)
 expect(rows).toEqual([])
})
