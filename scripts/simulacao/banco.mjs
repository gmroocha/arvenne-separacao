import { criarBanco } from "../../tests/banco/suporte.mjs"
import { instalarRedeSemGravacao } from "./rede.mjs"

export const SUPABASE_FICTICIO = "https://simulacao.supabase.test"
export const CHAVE_FICTICIA = "chave-publica-ficticia-sem-acesso"
const citar = (s) => `"${s.replaceAll('"', '""')}"`
const headers = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }

async function semear(banco, { status, troca, aviso, somada }) {
  const one = async (sql, args = []) => (await banco.query(sql, args)).rows[0]
  const agora = new Date().toISOString()
  const p = await one(`insert into pedidos(origem,status,cliente_nome,forma_pagamento,valor_pago,pago_em,desconto_tipo,desconto_valor,
    frete_tipo,frete_pago_por,frete_cobrado)
    values ('whatsapp',$1,'Cliente de teste','Cartão',$2,$3,'valor',$4,'PAC','arvenne',0) returning *`,
  [troca ? "aguardando_cliente" : status, status === "em_aberto" ? null : 100, status === "em_aberto" ? null : agora, troca ? 20 : 0])
  const i = await one(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,status)
    values ($1,'avulso','Anel de teste','AN-1',2,50,$2) returning *`, [p.id, troca ? "falta" : "pendente"])
  let t, vendaSomada
  if (somada) {
    vendaSomada = await one(`insert into pedidos(origem,status,cliente_nome,somar_em,desconto_tipo,desconto_valor)
      values ('whatsapp','em_aberto','Cliente de teste',$1,'valor',10) returning *`, [p.id])
    await banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
      values ($1,'avulso','Brinco somado','BR-2',2,25,1),($1,'avulso','Colar somado','CO-1',1,20,2)`, [vendaSomada.id])
    await one("select somar_venda($1,'Cartão',60)", [vendaSomada.id])
  }
  if (troca) {
    t = await one("insert into trocas(pedido_id) values ($1) returning *", [p.id])
    const tp = await one("insert into troca_pecas(troca_id,item_id) values ($1,$2) returning *", [t.id, i.id])
    await one("insert into troca_opcoes(troca_peca_id,origem,nome,sku,preco) values ($1,'site','Anel novo','NOVO-1',75)", [tp.id])
    await banco.query("update trocas set status='enviada',enviada_em=now() where id=$1", [t.id])
  }
  if (aviso) {
    await banco.query("update pedidos set status='faturamento' where id=$1", [p.id])
    await one("select registrar_vistoria()")
  }
  return {p,i,t,vendaSomada}
}

// Pequeno adaptador PostgREST só para testes: operações usam as migrations e o PostgreSQL em memória.
// Não há cálculo financeiro copiado para o simulador, conexão remota ou credencial real.
export async function criarSimulacao({ status = "novo", troca = false, aviso = false, somada = false } = {}) {
  let legado
  const opcoes={status,troca,aviso,somada}
  // Caso de dados antigos: semeia a incoerência ANTES da migration que passa a impedi-la.
  const banco = await criarBanco(aviso ? { antesDe: '20261118160000', prepararAntes: async (b) => { legado=await semear(b,opcoes) } } : {})
  const {p,i,t,vendaSomada}=legado ?? await semear(banco,opcoes)
  const one = async (sql, args = []) => (await banco.query(sql, args)).rows[0]
  const relacoes = (await banco.query(`select table_name,column_name from information_schema.columns where table_schema='public'`)).rows
  const campos = new Map()
  for (const r of relacoes) campos.set(r.table_name, new Set([...(campos.get(r.table_name) ?? []), r.column_name]))
  const funcoes = (await banco.query(`select p.proname,p.proretset,format_type(p.prorettype,null) as retorno,
    coalesce((select jsonb_object_agg(p.proargnames[a.n],format_type(a.t,null)) from unnest(p.proargtypes) with ordinality a(t,n)), '{}'::jsonb) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows
  const user = { id: "00000000-0000-0000-0000-000000000001", email: "teste@example.test", aud: "authenticated", role: "authenticated" }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ ...user, sub: user.id, exp })).toString("base64url"), "ficticio"].join(".")
  const sessao = { access_token: jwt, refresh_token: "ficticio", expires_in: 3600, expires_at: exp, token_type: "bearer", user }
  const requisicoes = [], bloqueadas = []
  let fila = Promise.resolve()
  let falharEscolha = false

  function filtros(url, tabela, valores) {
    const colunas = campos.get(tabela)
    const condicoes = []
    function condicao(nome, operacao) {
      if (!colunas.has(nome)) throw new Error(`Filtro desconhecido: ${nome}`)
      const [op, ...resto] = operacao.split(".")
      const valor = resto.join(".")
      if (op === "is" && valor === "null") return `${citar(nome)} is null`
      if (op === "not" && valor === "is.null") return `${citar(nome)} is not null`
      if (op === "in") {
        const lista = valor.slice(1, -1).split(",").filter(Boolean).map((x) => x.replace(/^"|"$/g, ""))
        if (!lista.length) return "false"
        return `${citar(nome)} in (${lista.map((v) => { valores.push(v); return `$${valores.length}` }).join(",")})`
      }
      const operadores = { eq: "=", neq: "<>", lt: "<", gt: ">", lte: "<=", gte: ">=", ilike: "ilike" }
      if (!operadores[op]) throw new Error(`Operação desconhecida: ${op}`)
      valores.push(valor)
      return `${citar(nome)} ${operadores[op]} $${valores.length}`
    }
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue
      if (k === "or") {
        condicoes.push(`(${v.slice(1, -1).split(",").map((x) => { const [coluna, ...outros] = x.split("."); return condicao(coluna, outros.join(".")) }).join(" or ")})`)
      } else condicoes.push(condicao(k, v))
    }
    return condicoes.length ? ` where ${condicoes.join(" and ")}` : ""
  }
  async function executar(req) {
    const url = new URL(req.url())
    // Descoberta Zebra fictícia: nenhuma impressora é consultada nem recebe etiquetas.
    if (req.method() === "GET" && url.href === "http://localhost:9100/default?type=printer") return { status: 200, json: {}, headers }
    if (url.origin !== SUPABASE_FICTICIO) return null
    requisicoes.push({ path: url.pathname, metodo: req.method() })
    if (url.pathname === "/auth/v1/user") return { status: 200, json: user, headers }
    if (!url.pathname.startsWith("/rest/v1/")) return null
    const nome = url.pathname.split("/").pop()
    const valores = []
    const body = req.postDataJSON?.() ?? null
    const autenticado = req.headers().authorization === `Bearer ${jwt}`
    await banco.exec(`begin; set local role ${autenticado ? "authenticated" : "anon"};`)
    try {
      if (url.pathname.includes("/rpc/")) {
        const f = funcoes.find((x) => x.proname === nome)
        if (!f) throw new Error(`RPC desconhecida: ${nome}`)
        if (nome === "troca_escolher" && falharEscolha) { falharEscolha = false; throw new Error("Falha simulada. Tente novamente.") }
        const args = Object.entries(body ?? {}).map(([k, v]) => {
          if (!Object.hasOwn(f.args, k)) throw new Error(`Argumento desconhecido: ${k}`)
          valores.push(f.args[k] === "jsonb" || f.args[k] === "json" ? JSON.stringify(v) : v)
          return `${citar(k)} => $${valores.length}::${f.args[k]}`
        })
        const chamada = `public.${citar(nome)}(${args.join(",")})`
        const r = f.proretset
          ? (await banco.query(`select to_jsonb(r) as dado from ${chamada} r`, valores)).rows.map((x) => x.dado)
          : (await one(`select to_jsonb(${chamada}) as dado`, valores)).dado
        await banco.exec("commit")
        return { status: 200, json: r ?? null, headers }
      }
      if (!campos.has(nome)) throw new Error(`Tabela desconhecida: ${nome}`)
      let rows
      if (req.method() === "GET" || req.method() === "HEAD") {
        const where = filtros(url, nome, valores)
        const ordem = (url.searchParams.get("order") ?? "").split(",").filter(Boolean).map((o) => {
          const [coluna, direcao, nulos] = o.split(".")
          if (!campos.get(nome).has(coluna)) throw new Error("Ordenação desconhecida")
          return `${citar(coluna)} ${direcao === "desc" ? "desc" : "asc"}${nulos === "nullslast" ? " nulls last" : nulos === "nullsfirst" ? " nulls first" : ""}`
        })
        const limite = Math.max(0, Math.min(1000, Number(url.searchParams.get("limit") ?? 1000)))
        const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0))
        rows = (await banco.query(`select to_jsonb(r) as dado from (select * from public.${citar(nome)}${where}${ordem.length ? ` order by ${ordem.join(",")}` : ""} limit ${limite} offset ${offset}) r`, valores)).rows.map((x) => x.dado)
        if (nome === "trocas" && url.searchParams.get("select")?.includes("troca_pecas")) {
          for (const row of rows) row.troca_pecas = (await banco.query(`select to_jsonb(tp)||jsonb_build_object(
            'troca_opcoes',coalesce((select jsonb_agg(to_jsonb(o)) from troca_opcoes o where o.troca_peca_id=tp.id),'[]'::jsonb),
            'troca_escolhas',coalesce((select jsonb_agg(to_jsonb(e)) from troca_escolhas e where e.troca_peca_id=tp.id),'[]'::jsonb)) as dado
            from troca_pecas tp where tp.troca_id=$1`, [row.id])).rows.map((x) => x.dado)
        }
      } else if (req.method() === "PATCH") {
        const set = Object.entries(body).map(([k, v]) => {
          if (!campos.get(nome).has(k)) throw new Error(`Campo desconhecido: ${k}`)
          valores.push(v); return `${citar(k)}=$${valores.length}`
        })
        const where = filtros(url, nome, valores)
        if (!where) throw new Error("Atualização sem filtro não permitida no simulador")
        rows = (await banco.query(`with r as (update public.${citar(nome)} set ${set.join(",")}${where} returning *) select to_jsonb(r) as dado from r`, valores)).rows.map((x) => x.dado)
      } else if (req.method() === "POST") {
        rows = []
        for (const linha of Array.isArray(body) ? body : [body]) {
          const nomes = Object.keys(linha)
          if (nomes.some((k) => !campos.get(nome).has(k))) throw new Error("Campo de inserção desconhecido")
          const r = await one(`with r as (insert into public.${citar(nome)}(${nomes.map(citar).join(",")}) values (${nomes.map((_, n) => `$${n + 1}`).join(",")}) returning *) select to_jsonb(r) as dado from r`, nomes.map((k) => linha[k]))
          rows.push(r.dado)
        }
      } else throw new Error("Operação não suportada no banco fictício")
      await banco.exec("commit")
      if (req.method() === "HEAD") return { status: 200, body: "", headers: { ...headers, "content-range": `0-0/${rows.length}` } }
      return { status: 200, json: req.headers().accept?.includes("application/vnd.pgrst.object+json") ? rows[0] ?? null : rows, headers }
    } catch (e) {
      await banco.exec("rollback")
      return { status: 400, json: { message: e.message, code: e.code ?? "SIMULACAO" }, headers }
    }
  }
  return {
    pedido: p, item: i, troca: t, vendaSomada, banco, one, requisicoes, bloqueadas,
    falharProximaEscolha: () => { falharEscolha = true },
    fechar: () => banco.close(),
    async instalar(context, baseUrl, { logado = true } = {}) {
      if (logado) await context.addInitScript((s) => localStorage.setItem("sb-simulacao-auth-token", JSON.stringify(s)), sessao)
      await instalarRedeSemGravacao(context, { baseUrl, supabaseUrl: SUPABASE_FICTICIO, aoBloquear: (r) => bloqueadas.push(r.url()),
        responder: (req) => { const r = fila.then(() => executar(req)); fila = r.catch(() => {}); return r } })
    },
  }
}
