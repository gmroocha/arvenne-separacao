// Pedido de venda da LR direto no Bling (API v3). O navegador nunca vê token do Bling: tudo passa por aqui.
//
// Entrada (POST, só quem está logado): { acao, ... }
//   conectar_inicio  (gestor)                       → { url } do Bling para autorizar o aplicativo
//   conectar_fim     (gestor) code, state           → troca o code por tokens e grava
//   contatos         (gestor) busca                 → contatos do Bling da LR (para escolher a Arvenne)
//   definir_contato  (gestor) id, nome              → grava qual contato é a Arvenne
//   salvar_codigo    (gestor) sku, codigo           → lembra "SKU do app → código no Bling"
//   apagar_codigo    (gestor) sku
//   preparar         pedido_id?, itens[{sku?,codigo?,qtd,valor?}]   → confere no Bling: código, nome, preço, total
//   gerar            pedido_id?, itens[{sku?,codigo,qtd,valor?}], lembrar[{sku,codigo}], confirmar_repetido?
// Com pedido_id, vale quem VÊ o pedido (RLS, com o login de quem chamou); sem ele, só o gestor.
// Saída: { ok: true, ... } ou { erro } em português simples, com status 4xx/5xx.
// Segredos (só no painel do Supabase): BLING_CLIENT_ID e BLING_CLIENT_SECRET.

import { admin, comoUsuario, cors, json } from "../_shared/http.ts"
import {
  aplicarCodigos, buscarContatos, buscarProdutos, corpoPedido, criarPedido, dataHoje, ErroBling, limparCodigo, MAX_LINHAS,
  observacaoPedido, precisaRenovar, renovarToken, totalDasLinhas, trocarCodigo, urlAutorizar, type Conexao, type FetchFn,
} from "../_shared/bling.ts"

type Item = { sku?: unknown; codigo?: unknown; qtd?: unknown; valor?: unknown }
type Corpo = {
  acao?: string; code?: string; state?: string; busca?: string; id?: unknown; nome?: unknown; sku?: unknown; codigo?: unknown
  pedido_id?: string; itens?: Item[]; lembrar?: { sku?: unknown; codigo?: unknown }[]; confirmar_repetido?: boolean
}
type LinhaOk = { sku: string | null; codigo: string; qtd: number; valor: number | null }

const f: FetchFn = (url, init) => fetch(url, init)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function credenciais() {
  const id = Deno.env.get("BLING_CLIENT_ID"), segredo = Deno.env.get("BLING_CLIENT_SECRET")
  if (!id || !segredo) throw new ErroBling("Faltam os segredos BLING_CLIENT_ID e BLING_CLIENT_SECRET no painel do Supabase (Edge Functions > Secrets).", 500)
  return { id, segredo }
}

// Token do Bling pronto para usar. Renova sozinho quando faltam menos de 5 min. O refresh_token do Bling vale uma vez só:
// se duas chamadas renovam juntas, quem perde a corrida usa o par que a vencedora gravou.
async function tokenValido(sb: ReturnType<typeof admin>): Promise<string> {
  const ler = async () => ((await sb.from("bling_conexao").select("*").eq("id", true).maybeSingle()).data ?? null) as Conexao | null
  const c = await ler()
  if (!c?.refresh_token) throw new ErroBling("O Bling ainda não está conectado. Abra a aba PDV LR e toque em Conectar ao Bling.", 409, true)
  if (c.access_token && !precisaRenovar(c.expira_em, Date.now())) return c.access_token
  const { id, segredo } = credenciais()
  try {
    const novo = await renovarToken(f, id, segredo, c.refresh_token, Date.now())
    const { data } = await sb.from("bling_conexao").update(novo).eq("id", true).eq("refresh_token", c.refresh_token).select("id")
    if (data?.length) return novo.access_token
    const atual = await ler() // outra chamada renovou antes
    if (atual?.access_token) return atual.access_token
    return novo.access_token
  } catch (e) {
    if (e instanceof ErroBling && e.reconectar) {
      const atual = await ler()
      if (atual?.refresh_token && atual.refresh_token !== c.refresh_token && atual.access_token) return atual.access_token // outra chamada já renovou
      await sb.from("bling_conexao").update({ access_token: null, refresh_token: null, expira_em: null }).eq("id", true).eq("refresh_token", c.refresh_token)
    }
    throw e
  }
}

async function nomeDeQuem(req: Request, sb: ReturnType<typeof admin>): Promise<string | null> {
  const { data: membro } = await comoUsuario(req).rpc("membro_atual")
  if (!membro) return null
  const { data } = await sb.from("equipe").select("nome").eq("id", membro as string).maybeSingle()
  return (data as { nome?: string } | null)?.nome ?? null
}

// Valida as linhas que chegam do navegador. Nada de confiar no que veio: quantidade inteira, valor número, código texto.
function linhasDe(itens: Item[] | undefined): LinhaOk[] {
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroBling("Coloque pelo menos uma peça no pedido.", 400)
  if (itens.length > MAX_LINHAS) throw new ErroBling(`Peças demais para uma vez só (máximo ${MAX_LINHAS} linhas).`, 400)
  return itens.map((i, n) => {
    const qtd = Number(i.qtd)
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 9999) throw new ErroBling(`A quantidade da linha ${n + 1} precisa ser um número inteiro de 1 a 9999.`, 400)
    const valor = i.valor == null || i.valor === "" ? null : Number(i.valor)
    if (valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000)) throw new ErroBling(`O preço da linha ${n + 1} não é válido.`, 400)
    const sku = limparCodigo(i.sku) || null
    return { sku, codigo: limparCodigo(i.codigo) || sku || "", qtd, valor: valor == null ? null : Math.round(valor * 100) / 100 }
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405)

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!jwt) return json({ erro: "Entre no app para fazer isso." }, 401)
  const eu = comoUsuario(req)
  const { data: gestor, error: erroGestor } = await eu.rpc("sou_gestor")
  if (erroGestor) return json({ erro: "Entre no app para fazer isso." }, 401)
  const ehGestor = gestor === true

  try {
    const corpo = (await req.json().catch(() => ({}))) as Corpo
    const acao = corpo.acao ?? ""
    const sb = admin()
    const soGestor = () => { if (!ehGestor) throw new ErroBling("Só o gestor pode fazer isso.", 403) }

    if (acao === "conectar_inicio") {
      soGestor()
      const { id } = credenciais()
      const estado = crypto.randomUUID()
      const { error } = await sb.from("bling_conexao").upsert({ id: true, estado_oauth: estado, estado_expira: new Date(Date.now() + 10 * 60_000).toISOString() })
      if (error) throw new Error(error.message)
      return json({ ok: true, url: urlAutorizar(id, estado) })
    }

    if (acao === "conectar_fim") {
      soGestor()
      const code = limparCodigo(corpo.code), state = limparCodigo(corpo.state)
      if (!code || !state) return json({ erro: "O Bling não devolveu o código de autorização. Toque em Conectar ao Bling de novo." }, 400)
      // O estado vale uma vez só: o primeiro que o apaga é quem segue (evita refazer com o mesmo retorno).
      const { data: usado } = await sb.from("bling_conexao").update({ estado_oauth: null, estado_expira: null })
        .eq("id", true).eq("estado_oauth", state).gt("estado_expira", new Date().toISOString()).select("id")
      if (!usado?.length) return json({ erro: "A conexão expirou ou já foi usada. Toque em Conectar ao Bling de novo." }, 409)
      const { id, segredo } = credenciais()
      const tokens = await trocarCodigo(f, id, segredo, code, Date.now())
      const { error } = await sb.from("bling_conexao").update({ ...tokens, conectado_por: await nomeDeQuem(req, sb), conectado_em: new Date().toISOString() }).eq("id", true)
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (acao === "contatos") {
      soGestor()
      const busca = limparCodigo(corpo.busca)
      if (busca.length < 2) return json({ erro: "Digite pelo menos 2 letras do nome ou o CNPJ." }, 400)
      return json({ ok: true, contatos: await buscarContatos(f, await tokenValido(sb), busca) })
    }

    if (acao === "definir_contato") {
      soGestor()
      const id = Number(corpo.id), nome = limparCodigo(corpo.nome)
      if (!Number.isInteger(id) || id <= 0 || !nome) return json({ erro: "Escolha um contato da lista." }, 400)
      const { error } = await sb.from("bling_conexao").update({ contato_id: id, contato_nome: nome.slice(0, 200) }).eq("id", true)
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (acao === "salvar_codigo" || acao === "apagar_codigo") {
      soGestor()
      const sku = limparCodigo(corpo.sku)
      if (!sku) return json({ erro: "Informe o código do app." }, 400)
      if (acao === "apagar_codigo") {
        const { error } = await sb.from("bling_codigos").delete().eq("sku", sku)
        if (error) throw new Error(error.message)
        return json({ ok: true })
      }
      const codigo = limparCodigo(corpo.codigo)
      if (!codigo) return json({ erro: "Informe o código do Bling." }, 400)
      const { error } = await sb.from("bling_codigos").upsert({ sku, codigo_bling: codigo, atualizado_por: await nomeDeQuem(req, sb), atualizado_em: new Date().toISOString() })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    if (acao === "preparar" || acao === "gerar") {
      // Quem pode: com pedido, quem vê o pedido (a RLS responde pela própria pessoa); sem pedido, o gestor.
      let pedido: { id: string; numero: string | null; cliente_nome: string | null; pedido_fornecedor_em: string | null } | null = null
      if (corpo.pedido_id != null) {
        if (!UUID.test(corpo.pedido_id)) return json({ erro: "Pedido inválido." }, 400)
        const { data, error } = await eu.from("pedidos").select("id, numero, cliente_nome, pedido_fornecedor_em").eq("id", corpo.pedido_id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return json({ erro: "Você não tem acesso a este pedido." }, 403)
        pedido = data as typeof pedido
      } else soGestor()

      const linhas = linhasDe(corpo.itens)
      const anterior = pedido
        ? ((await sb.from("bling_pedidos").select("bling_numero, bling_id, criado_em").eq("pedido_id", pedido.id).order("criado_em", { ascending: false }).limit(1)).data?.[0] ?? null) as
            { bling_numero: string | null; bling_id: number; criado_em: string } | null
        : null

      const token = await tokenValido(sb)
      const skus = [...new Set(linhas.map((l) => l.sku).filter((s): s is string => !!s))]
      const mapa: Record<string, string> = {}
      if (skus.length) {
        const { data } = await sb.from("bling_codigos").select("sku, codigo_bling").in("sku", skus)
        for (const r of (data ?? []) as { sku: string; codigo_bling: string }[]) mapa[r.sku] = r.codigo_bling
      }
      // No preparar o código editado vence o lembrado; no gerar o código já veio conferido, então só confirmamos.
      const comCodigo = aplicarCodigos(linhas, acao === "preparar" ? mapa : {})
      const vistas = comCodigo.map((l) => ({ ...l, lembrado: !!(l.sku && mapa[l.sku] && l.codigo === mapa[l.sku]) }))
      const produtos = await buscarProdutos(f, token, vistas.map((l) => l.codigo))
      const resolvidas = vistas.map((l) => {
        const p = produtos.get(l.codigo.toLowerCase())
        return { ...l, produto: p ?? null, valor_final: l.valor ?? p?.preco ?? 0 }
      })

      if (acao === "preparar") {
        return json({
          ok: true,
          ja_gerado: anterior ? { numero: anterior.bling_numero, bling_id: anterior.bling_id, criado_em: anterior.criado_em } : null,
          linhas: resolvidas.map((l) => ({
            sku: l.sku, codigo: l.codigo, qtd: l.qtd, lembrado: l.lembrado, achou: !!l.produto,
            descricao: l.produto?.nome ?? null, valor: l.produto ? l.valor_final : null, valor_bling: l.produto?.preco ?? null,
          })),
          total: totalDasLinhas(resolvidas.filter((l) => l.produto).map((l) => ({ qtd: l.qtd, valor: l.valor_final }))),
        })
      }

      // gerar
      if (anterior && corpo.confirmar_repetido !== true) {
        return json({ erro: `Este pedido já foi gerado no Bling (nº ${anterior.bling_numero ?? anterior.bling_id}). Confirme para gerar outro.` }, 409)
      }
      const faltam = resolvidas.filter((l) => !l.produto).map((l) => l.codigo)
      if (faltam.length) return json({ erro: `Não achei no Bling: ${faltam.join(", ")}. Corrija o código e confira de novo.` }, 400)
      const { data: con } = await sb.from("bling_conexao").select("contato_id").eq("id", true).maybeSingle()
      const contatoId = (con as { contato_id?: number | null } | null)?.contato_id
      if (!contatoId) return json({ erro: "Escolha o cliente Arvenne na aba PDV LR antes de gerar pedidos." }, 409)

      const itens = resolvidas.map((l) => ({ produtoId: l.produto!.id, codigo: l.produto!.codigo, descricao: l.produto!.nome, qtd: l.qtd, valor: l.valor_final }))
      const total = totalDasLinhas(itens)
      const criado = await criarPedido(f, token, corpoPedido({
        contatoId, hoje: dataHoje(new Date()), itens, observacoes: observacaoPedido({ numeroPedido: pedido?.numero, cliente: pedido?.cliente_nome }),
      }))
      const numero = criado.numero ?? String(criado.id)
      const quem = await nomeDeQuem(req, sb)
      const avisos: string[] = []

      const { error: erroRegistro } = await sb.from("bling_pedidos").insert({
        pedido_id: pedido?.id ?? null, bling_id: criado.id, bling_numero: criado.numero, total, criado_por: quem,
        itens: resolvidas.map((l) => ({ sku: l.sku, codigo: l.codigo, descricao: l.produto!.nome, qtd: l.qtd, valor: l.valor_final })),
      })
      if (erroRegistro) { console.error("bling registro", erroRegistro.message); avisos.push("O pedido foi criado no Bling, mas não ficou no histórico do app.") }

      const lembrar = (Array.isArray(corpo.lembrar) ? corpo.lembrar : [])
        .map((l) => ({ sku: limparCodigo(l.sku), codigo: limparCodigo(l.codigo) })).filter((l) => l.sku && l.codigo && l.sku !== l.codigo).slice(0, MAX_LINHAS)
      if (lembrar.length) {
        const { error } = await sb.from("bling_codigos").upsert(lembrar.map((l) => ({ sku: l.sku, codigo_bling: l.codigo, atualizado_por: quem, atualizado_em: new Date().toISOString() })))
        if (error) { console.error("bling codigos", error.message); avisos.push("Não consegui lembrar os códigos trocados.") }
      }

      // Com o login da pessoa: vale a RLS, o histórico (pedido_lr) e o avanço automático da etapa no gatilho do banco.
      if (pedido) {
        const campos: Record<string, string> = { pedido_fornecedor_numero: numero }
        if (!pedido.pedido_fornecedor_em) campos.pedido_fornecedor_em = new Date().toISOString()
        const { error } = await eu.from("pedidos").update(campos).eq("id", pedido.id)
        if (error) { console.error("bling pedido", error.message); avisos.push("O pedido foi criado no Bling, mas não consegui marcar o passo como feito. Marque à mão.") }
      }
      return json({ ok: true, bling_id: criado.id, numero, total, avisos })
    }

    return json({ erro: "Ação desconhecida." }, 400)
  } catch (e) {
    if (e instanceof ErroBling) return json({ erro: e.message, reconectar: e.reconectar || undefined }, e.status)
    console.error("bling", e instanceof Error ? e.message : e)
    return json({ erro: "Não foi possível concluir agora. Tente de novo em instantes." }, 500)
  }
})
