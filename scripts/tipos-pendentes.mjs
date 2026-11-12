import { readFileSync, writeFileSync } from "node:fs"
import { criarBanco } from "../tests/banco/suporte.mjs"

// Supabase gen types representa o remoto. Este complemento vem da introspecção das migrations
// ainda locais, para conferir o código ANTES da autorização de aplicar no remoto. Não escrever à mão.
const baseAplicada = "20261118210000"
const tipo = (sql) => {
  const t = sql.replace(/^public\./, "")
  if (t.endsWith("[]")) return `(${tipo(t.slice(0, -2))})[]`
  if (/^(smallint|integer|bigint|numeric|real|double precision|int[248]|float[48])$/.test(t)) return "number"
  if (t === "boolean" || t === "bool") return "boolean"
  if (t === "json" || t === "jsonb") return "Json"
  if (t === "void") return "undefined"
  return "string"
}
async function inspecionar(banco) {
  const relacoes = (await banco.query(`select c.relname as nome,c.relkind,
    jsonb_agg(jsonb_build_object('nome',a.attname,'tipo',format_type(a.atttypid,null),'nulo',not a.attnotnull,
      'opcional',a.atthasdef or a.attidentity <> '') order by a.attnum) as campos
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','v') group by c.relname,c.relkind order by c.relname`)).rows
  const funcoes = (await banco.query(`select p.proname as nome,format_type(p.prorettype,null) as retorno,p.proretset,
    coalesce((select jsonb_agg(jsonb_build_object('nome',p.proargnames[a.n],'tipo',format_type(a.t,null),
      'opcional',a.n>p.pronargs-p.pronargdefaults) order by a.n)
      from unnest(p.proargtypes) with ordinality a(t,n)), '[]'::jsonb) as entradas,
    coalesce((select jsonb_agg(jsonb_build_object('nome',p.proargnames[a.n],'tipo',format_type(a.t,null)) order by a.n)
      from unnest(p.proallargtypes) with ordinality a(t,n) where p.proargmodes[a.n]='t'), '[]'::jsonb) as saidas
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname`)).rows
  return { relacoes, funcoes }
}

export async function gerarTiposPendentes() {
  const anterior = await criarBanco({ ate: baseAplicada })
  let base
  try { base = await inspecionar(anterior) } finally { await anterior.close() }
  const atual = await criarBanco()
  let novo
  try { novo = await inspecionar(atual) } finally { await atual.close() }
  const colecoes = { Tables: [], Views: [], Functions: [] }
  for (const r of novo.relacoes) {
    if (JSON.stringify(r) === JSON.stringify(base.relacoes.find((x) => x.nome === r.nome))) continue
    const campos = (modo) => r.campos.map((c) => `        ${c.nome}${modo === "Update" || (modo === "Insert" && (c.opcional || c.nulo)) ? "?" : ""}: ${tipo(c.tipo)}${c.nulo ? " | null" : ""}`).join("\n")
    const registro = r.relkind === "r"
      ? `      Row: {\n${campos("Row")}\n      }\n      Insert: {\n${campos("Insert")}\n      }\n      Update: {\n${campos("Update")}\n      }`
      : `      Row: {\n${campos("Row")}\n      }`
    colecoes[r.relkind === "r" ? "Tables" : "Views"].push(`    ${r.nome}: {\n${registro}\n      Relationships: []\n    }`)
  }
  for (const f of novo.funcoes) {
    if (base.funcoes.some((x) => x.nome === f.nome)) continue
    const args = f.entradas.length ? `{ ${f.entradas.map((c) => `${c.nome}${c.opcional ? "?" : ""}: ${tipo(c.tipo)} | null`).join("; ")} }` : "Record<PropertyKey, never>"
    const retorno = f.saidas.length ? `{ ${f.saidas.map((c) => `${c.nome}: ${tipo(c.tipo)} | null`).join("; ")} }[]` : tipo(f.retorno) + (f.proretset ? "[]" : " | null")
    colecoes.Functions.push(`    ${f.nome}: { Args: ${args}; Returns: ${retorno} }`)
  }
  const corpo = Object.values(colecoes).flat().join("\n")
  const importaJson = /\bJson\b/.test(corpo) ? ", Json" : ""
  return `// GERADO por npm run tipos:local a partir das migrations posteriores a ${baseAplicada}.\n// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.\nimport type { Database as Remoto${importaJson} } from './database.types'\n\ntype Adicoes = {\n${Object.entries(colecoes).map(([k, v]) => `  ${k}: {\n${v.join("\n")}\n  }`).join("\n")}\n}\n\nexport type Database = Omit<Remoto, 'public'> & {\n  public: Omit<Remoto['public'], keyof Adicoes> & {\n    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]\n  }\n}\n`
}

const destino = "src/lib/gerado/database.local.types.ts"
const gerado = await gerarTiposPendentes()
if (process.argv.includes("--check")) {
  if (readFileSync(destino, "utf8") !== gerado) {
    console.error("Tipos das migrations locais desatualizados. Rode npm run tipos:local.")
    process.exitCode = 1
  }
} else {
  writeFileSync(destino, gerado)
  console.log("Tipos das migrations locais gerados sem acessar o banco remoto.")
}
