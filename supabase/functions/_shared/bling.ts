// Lógica pura da integração com o Bling (API v3) da LR. Sem Deno, sem Supabase, sem segredo no arquivo:
// quem chama passa o `fetch`, o relógio e as credenciais. É o que os testes de unidade exercitam com `fetch` falso.
//
// Conferido na referência oficial (developer.bling.com.br, OpenAPI, 26/11/2026):
//  - Base da API https://api.bling.com.br/Api/v3; autorizar em https://www.bling.com.br/Api/v3/oauth/authorize
//    (response_type=code, client_id, state); trocar o code (vale 30 s) e renovar em POST /oauth/token com
//    `Authorization: Basic base64(id:segredo)` e corpo x-www-form-urlencoded; o redirect_uri NÃO é exigido (vale o do cadastro).
//  - GET /produtos aceita `codigos[]` (SKUs), `criterio` (2 = ativos), `limite`; devolve data[].{id, nome, codigo, preco}.
//  - GET /contatos aceita `pesquisa` (nome, CPF/CNPJ...) e `criterio` (1 = todos); devolve data[].{id, nome, numeroDocumento, situacao}.
//  - POST /pedidos/vendas: obrigatórios contato.id, data, dataSaida, dataPrevista, itens[].{quantidade, valor, descricao};
//    responde 201 com data.id (SEM o número); o número vem de GET /pedidos/vendas/{id} (data.numero).
// Presumido (a documentação marca como obrigatório, mas não dá para testar sem a conta): `parcelas` (precisaria do id da
// forma de pagamento) NÃO é enviado; se o Bling recusar, a mensagem dele aparece na tela traduzida.

export const BLING_API = "https://api.bling.com.br/Api/v3"
export const BLING_AUTORIZAR = "https://www.bling.com.br/Api/v3/oauth/authorize"
export const BLING_TOKEN = `${BLING_API}/oauth/token`
export const MARGEM_RENOVAR_MS = 5 * 60 * 1000 // renova quando faltam menos de 5 min
export const LOTE_CODIGOS = 100 // o Bling lista até 100 por página
export const MAX_LOTES = 3 // limite do Bling: 3 chamadas por segundo
export const MAX_LINHAS = LOTE_CODIGOS * MAX_LOTES

export type Linha = { sku?: string | null; codigo: string; qtd: number; valor?: number | null }
export type ProdutoBling = { id: number; codigo: string; nome: string; preco: number }
export type Conexao = {
  access_token: string | null
  refresh_token: string | null
  expira_em: string | null
}
export type Tokens = { access_token: string; refresh_token: string; expira_em: string }
export type Resposta = { ok: boolean; status: number; json: unknown }
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export class ErroBling extends Error {
  status: number
  reconectar: boolean
  constructor(mensagem: string, status = 502, reconectar = false) {
    super(mensagem)
    this.status = status
    this.reconectar = reconectar
  }
}

export const REFAZER_CONEXAO = "O Bling pediu para conectar de novo. Abra a aba PDV LR e toque em Conectar ao Bling."

export function urlAutorizar(clientId: string, estado: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: clientId, state: estado })
  return `${BLING_AUTORIZAR}?${p.toString()}`
}

export const basicAuth = (id: string, segredo: string) => `Basic ${btoa(`${id}:${segredo}`)}`

// Código do produto: sem espaços nas pontas e sem caracteres invisíveis de quem copia e cola.
export const limparCodigo = (s: unknown) => String(s ?? "").replace(/[​-‍﻿]/g, "").trim()

// Aplica os códigos lembrados (SKU do app -> código no Bling). Quem já tem `codigo` preenchido e diferente do SKU
// (a pessoa editou) é respeitado; sem código, usa o lembrado ou o próprio SKU.
export function aplicarCodigos<T extends { sku?: string | null; codigo?: string | null }>(linhas: T[], mapa: Record<string, string>): (T & { codigo: string })[] {
  return linhas.map((l) => {
    const sku = limparCodigo(l.sku)
    const escrito = limparCodigo(l.codigo)
    const codigo = escrito && escrito !== sku ? escrito : (sku && mapa[sku]) || escrito || sku
    return { ...l, codigo }
  })
}

export function precisaRenovar(expiraEm: string | null | undefined, agora: number): boolean {
  if (!expiraEm) return true
  const t = Date.parse(expiraEm)
  return Number.isNaN(t) || t - agora < MARGEM_RENOVAR_MS
}

export const dataHoje = (agora: Date) => {
  // Data de São Paulo (UTC-3, sem horário de verão desde 2019), no formato AAAA-MM-DD que o Bling pede.
  const d = new Date(agora.getTime() - 3 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

const arredondar = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Total do pedido (a tela não soma dinheiro): quantidade x valor de cada linha, em centavos.
export function totalDasLinhas(linhas: { qtd: number; valor: number }[]): number {
  return arredondar(linhas.reduce((s, l) => s + Math.round(l.valor * 100) * l.qtd, 0) / 100)
}

export type LinhaPedido = { produtoId: number; codigo: string; descricao: string; qtd: number; valor: number }

export function corpoPedido(a: { contatoId: number; hoje: string; itens: LinhaPedido[]; observacoes: string }) {
  return {
    contato: { id: a.contatoId },
    data: a.hoje,
    dataSaida: a.hoje,
    dataPrevista: a.hoje,
    observacoes: a.observacoes,
    itens: a.itens.map((i) => ({
      codigo: i.codigo,
      descricao: i.descricao,
      quantidade: i.qtd,
      valor: i.valor,
      produto: { id: i.produtoId },
    })),
  }
}

export const observacaoPedido = (a: { numeroPedido?: string | null; cliente?: string | null }) =>
  ["Arvenne", a.numeroPedido ? `pedido nº ${a.numeroPedido}` : null, a.cliente ? `cliente ${a.cliente}` : null].filter(Boolean).join(" – ")

type CorpoErro = { error?: { type?: string; message?: string; description?: string; fields?: { msg?: string; element?: string }[] } }

// Erro do Bling em português simples (o gestor lê isto na tela).
export function traduzirErro(status: number, corpo: unknown): string {
  const e = (corpo as CorpoErro | null)?.error
  const campos = (e?.fields ?? []).map((f) => [f.element, f.msg].filter(Boolean).join(": ")).filter(Boolean)
  if (status === 401 || e?.type === "UNAUTHORIZED" || e?.type === "invalid_token") return REFAZER_CONEXAO
  if (status === 403 || e?.type === "FORBIDDEN") return "O Bling não deixou fazer isso. Confira as permissões do aplicativo no Bling da LR."
  if (status === 429 || e?.type === "TOO_MANY_REQUESTS") return "O Bling pediu para esperar um pouco (muitas chamadas seguidas). Tente de novo em instantes."
  if (status === 404 || e?.type === "RESOURCE_NOT_FOUND") return "O Bling não encontrou o que foi pedido."
  if (status >= 500) return "O Bling está com problema agora. Tente de novo em instantes."
  if (campos.length) return `O Bling recusou o pedido: ${campos.join("; ")}`
  const texto = e?.description || e?.message
  return texto ? `O Bling recusou: ${texto}` : "O Bling recusou o pedido."
}

async function lerJson(r: Response): Promise<unknown> {
  const t = await r.text().catch(() => "")
  try {
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

async function pedirToken(f: FetchFn, id: string, segredo: string, corpo: Record<string, string>, agora: number): Promise<Tokens> {
  const r = await f(BLING_TOKEN, {
    method: "POST",
    headers: { Authorization: basicAuth(id, segredo), "Content-Type": "application/x-www-form-urlencoded", Accept: "1.0" },
    body: new URLSearchParams(corpo).toString(),
  })
  const j = (await lerJson(r)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: { type?: string; description?: string } } | null
  if (!r.ok || !j?.access_token || !j.refresh_token) {
    const tipo = j?.error?.type
    if (tipo === "invalid_grant" || tipo === "invalid_request") throw new ErroBling(REFAZER_CONEXAO, 409, true)
    if (tipo === "invalid_client") throw new ErroBling("As credenciais do aplicativo Bling (BLING_CLIENT_ID e BLING_CLIENT_SECRET) não conferem. Confira os segredos no Supabase.", 502)
    throw new ErroBling(traduzirErro(r.status || 502, j), 502)
  }
  return { access_token: j.access_token, refresh_token: j.refresh_token, expira_em: new Date(agora + (j.expires_in ?? 21600) * 1000).toISOString() }
}

export const trocarCodigo = (f: FetchFn, id: string, segredo: string, code: string, agora: number) =>
  pedirToken(f, id, segredo, { grant_type: "authorization_code", code }, agora)
export const renovarToken = (f: FetchFn, id: string, segredo: string, refresh: string, agora: number) =>
  pedirToken(f, id, segredo, { grant_type: "refresh_token", refresh_token: refresh }, agora)

export async function chamar(f: FetchFn, token: string, metodo: "GET" | "POST", caminho: string, opcoes: { consulta?: [string, string][]; corpo?: unknown } = {}): Promise<Resposta> {
  const url = new URL(`${BLING_API}${caminho}`)
  for (const [k, v] of opcoes.consulta ?? []) url.searchParams.append(k, v)
  const r = await f(url.toString(), {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(opcoes.corpo ? { "Content-Type": "application/json" } : {}) },
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  })
  return { ok: r.ok, status: r.status, json: await lerJson(r) }
}

export function exigir(r: Resposta): unknown {
  if (!r.ok) throw new ErroBling(traduzirErro(r.status, r.json), r.status === 401 ? 409 : 502, r.status === 401)
  return r.json
}

type ListaProdutos = { data?: { id?: number; codigo?: string; nome?: string; preco?: number }[] }

// Busca os produtos pelos códigos, no máximo MAX_LOTES chamadas. Devolve por código (minúsculo) o que o Bling tem.
export async function buscarProdutos(f: FetchFn, token: string, codigos: string[]): Promise<Map<string, ProdutoBling>> {
  const unicos = [...new Set(codigos.map(limparCodigo).filter(Boolean))]
  if (unicos.length > MAX_LINHAS) throw new ErroBling(`O pedido tem peças demais para uma vez só (máximo ${MAX_LINHAS} códigos diferentes).`, 400)
  const achados = new Map<string, ProdutoBling>()
  for (let i = 0; i < unicos.length; i += LOTE_CODIGOS) {
    const lote = unicos.slice(i, i + LOTE_CODIGOS)
    const consulta: [string, string][] = [["limite", String(LOTE_CODIGOS)], ["criterio", "2"], ...lote.map((c) => ["codigos[]", c] as [string, string])]
    const j = exigir(await chamar(f, token, "GET", "/produtos", { consulta })) as ListaProdutos | null
    for (const p of j?.data ?? []) {
      if (typeof p.id !== "number" || !p.codigo) continue
      achados.set(limparCodigo(p.codigo).toLowerCase(), { id: p.id, codigo: limparCodigo(p.codigo), nome: p.nome ?? p.codigo, preco: Number(p.preco ?? 0) })
    }
  }
  return achados
}

export async function buscarContatos(f: FetchFn, token: string, pesquisa: string) {
  const j = exigir(await chamar(f, token, "GET", "/contatos", { consulta: [["pesquisa", pesquisa], ["criterio", "1"], ["limite", "20"]] })) as {
    data?: { id?: number; nome?: string; numeroDocumento?: string; situacao?: string }[]
  } | null
  return (j?.data ?? [])
    .filter((c) => typeof c.id === "number" && c.situacao !== "E")
    .map((c) => ({ id: c.id as number, nome: c.nome ?? "", documento: c.numeroDocumento ?? "" }))
}

// Cria o pedido e lê o número (a criação só devolve o id).
export async function criarPedido(f: FetchFn, token: string, corpo: unknown): Promise<{ id: number; numero: string | null }> {
  const j = exigir(await chamar(f, token, "POST", "/pedidos/vendas", { corpo })) as { data?: { id?: number } } | null
  const id = j?.data?.id
  if (typeof id !== "number") throw new ErroBling("O Bling não devolveu o número do pedido. Confira no Bling da LR antes de tentar de novo.", 502)
  let numero: string | null = null
  try {
    const d = exigir(await chamar(f, token, "GET", `/pedidos/vendas/${id}`)) as { data?: { numero?: number | string } } | null
    if (d?.data?.numero != null) numero = String(d.data.numero)
  } catch {
    // O pedido já existe no Bling; sem o número, guardamos o id e a tela avisa.
  }
  return { id, numero }
}
