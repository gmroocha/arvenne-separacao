const LEITURAS_RPC = new Set(["troca_painel", "sugerir_troca", "troca_valor_pago", "categorias_catalogo", "troca_publica", "romaneio_publico"])
const TABELAS = new Set([
  "v_pedidos", "pedidos", "pedido_itens", "pedido_eventos", "trocas", "troca_pecas", "troca_opcoes",
  "troca_escolhas", "v_troca_valores", "v_troca_resumo", "v_troca_carrinho", "v_pedido_acerto",
  "v_pedido_alteracoes", "v_pecas_em_varios_pedidos", "catalogo_site", "catalogo_sincronizacao", "pecas_clube", "clientes", "feedbacks", "v_vistoria_resumo",
])

export function permitirLeitura(url, metodo, { baseUrl, supabaseUrl }) {
  const u = new URL(url), base = new URL(baseUrl), sb = new URL(supabaseUrl)
  const leitura = metodo === "GET" || metodo === "HEAD"
  if (u.origin === base.origin) return leitura
  if (u.origin === "https://cdn.shopify.com") return leitura
  if (u.origin !== sb.origin) return false
  if (leitura && u.pathname === "/auth/v1/user") return true
  if (leitura && /^\/storage\/v1\/(object|render\/image)\/public\/fotos\//.test(u.pathname)) return true
  const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
  if (rpc) return metodo === "POST" && LEITURAS_RPC.has(rpc)
  const tabela = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1]
  return leitura && TABELAS.has(tabela)
}

// Uma barreira para o simulador e os testes. O responder só devolve dados fictícios: nunca recebe
// route.continue/fetch. Requisição desconhecida é bloqueada, inclusive Edge, Storage e renovação de login.
export async function instalarRedeSemGravacao(context, opcoes) {
  await context.routeWebSocket("**/*", () => {})
  await context.route("**/*", async (route) => {
    const req = route.request()
    const simulada = await opcoes.responder?.(req)
    if (simulada) return route.fulfill(simulada)
    if (!permitirLeitura(req.url(), req.method(), opcoes)) {
      opcoes.aoBloquear?.(req)
      return route.fulfill({ status: 403, json: { message: "Simulação: gravação bloqueada", erro: "Simulação: gravação bloqueada" } })
    }
    if (opcoes.transformar && new URL(req.url()).origin === new URL(opcoes.supabaseUrl).origin && new URL(req.url()).pathname.startsWith("/rest/v1/")) {
      const resposta = await route.fetch()
      const body = await resposta.text()
      if (!body || !resposta.ok()) return route.fulfill({ response: resposta })
      const json = await opcoes.transformar(req, JSON.parse(body))
      return route.fulfill({ response: resposta, json })
    }
    return route.continue()
  })
}
