import { describe, expect, test } from "vitest"
import {
  aplicarCodigos, basicAuth, buscarContatos, buscarProdutos, corpoPedido, criarPedido, dataHoje, ErroBling, limparCodigo, observacaoPedido,
  precisaRenovar, renovarToken, totalDasLinhas, traduzirErro, trocarCodigo, urlAutorizar, type FetchFn,
} from "../../supabase/functions/_shared/bling.ts"

// `fetch` falso: nada de rede, de segredo nem de Bling de verdade.
type Chamada = { url: string; init?: RequestInit }
function falso(respostas: ((c: Chamada) => unknown)[]) {
  const chamadas: Chamada[] = []
  const f: FetchFn = async (url, init) => {
    const c = { url, init }
    chamadas.push(c)
    const r = respostas[chamadas.length - 1]?.(c) as { status?: number; corpo?: unknown } | undefined
    if (!r) throw new Error(`chamada inesperada ${chamadas.length}: ${url}`)
    return new Response(JSON.stringify(r.corpo ?? null), { status: r.status ?? 200 })
  }
  return { f, chamadas }
}
const AGORA = Date.parse("2026-11-26T12:00:00Z")

describe("autorização e token", () => {
  test("a URL de autorizar leva response_type=code, client_id e state", () => {
    const u = new URL(urlAutorizar("meu-id", "estado-123"))
    expect(u.origin + u.pathname).toBe("https://www.bling.com.br/Api/v3/oauth/authorize")
    expect(Object.fromEntries(u.searchParams)).toEqual({ response_type: "code", client_id: "meu-id", state: "estado-123" })
  })

  test("trocar o code: POST /oauth/token, Basic id:segredo, corpo form com grant_type=authorization_code", async () => {
    const { f, chamadas } = falso([() => ({ corpo: { access_token: "A", refresh_token: "R", expires_in: 21600 } })])
    const t = await trocarCodigo(f, "id", "segredo", "codigo-1", AGORA)
    expect(t).toEqual({ access_token: "A", refresh_token: "R", expira_em: new Date(AGORA + 21600 * 1000).toISOString() })
    const { url, init } = chamadas[0]
    expect(url).toBe("https://api.bling.com.br/Api/v3/oauth/token")
    expect(init?.method).toBe("POST")
    const h = init?.headers as Record<string, string>
    expect(h.Authorization).toBe(`Basic ${btoa("id:segredo")}`)
    expect(h.Authorization).toBe(basicAuth("id", "segredo"))
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded")
    expect(Object.fromEntries(new URLSearchParams(init?.body as string))).toEqual({ grant_type: "authorization_code", code: "codigo-1" })
  })

  test("renovar: grant_type=refresh_token com o refresh guardado", async () => {
    const { f, chamadas } = falso([() => ({ corpo: { access_token: "A2", refresh_token: "R2", expires_in: 21600 } })])
    await renovarToken(f, "id", "segredo", "R1", AGORA)
    expect(Object.fromEntries(new URLSearchParams(chamadas[0].init?.body as string))).toEqual({ grant_type: "refresh_token", refresh_token: "R1" })
  })

  test("refresh vencido (invalid_grant) pede para conectar de novo; credencial errada diz qual segredo conferir", async () => {
    const vencido = falso([() => ({ status: 400, corpo: { error: { type: "invalid_grant", message: "invalid_grant" } } })])
    await expect(renovarToken(vencido.f, "id", "s", "R", AGORA)).rejects.toMatchObject({ reconectar: true, message: expect.stringMatching(/Conectar ao Bling/) })
    const cliente = falso([() => ({ status: 401, corpo: { error: { type: "invalid_client" } } })])
    await expect(trocarCodigo(cliente.f, "id", "s", "c", AGORA)).rejects.toMatchObject({ message: expect.stringMatching(/BLING_CLIENT_ID/) })
  })

  test("renova só quando faltam menos de 5 minutos (ou sem data)", () => {
    const em = (min: number) => new Date(AGORA + min * 60_000).toISOString()
    expect(precisaRenovar(em(6), AGORA)).toBe(false)
    expect(precisaRenovar(em(4), AGORA)).toBe(true)
    expect(precisaRenovar(em(-1), AGORA)).toBe(true)
    expect(precisaRenovar(null, AGORA)).toBe(true)
    expect(precisaRenovar("lixo", AGORA)).toBe(true)
  })
})

describe("códigos", () => {
  test("aplica o código lembrado; o editado à mão vence; sem nada, o próprio SKU", () => {
    const mapa = { "AN-1": "ANEL-001" }
    const r = aplicarCodigos([{ sku: "AN-1", codigo: "AN-1" }, { sku: "BR-2", codigo: "BR-2" }, { sku: "AN-1", codigo: "ANEL-999" }, { sku: " CO-3 ", codigo: "" }], mapa)
    expect(r.map((l) => l.codigo)).toEqual(["ANEL-001", "BR-2", "ANEL-999", "CO-3"])
  })
  test("limparCodigo tira espaços e caracteres invisíveis", () => {
    expect(limparCodigo("  AN-1​ ")).toBe("AN-1")
    expect(limparCodigo(null)).toBe("")
  })
})

describe("produtos e contatos", () => {
  test("busca por codigos[] numa chamada só, só ativos, e acha sem diferenciar maiúsculas", async () => {
    const { f, chamadas } = falso([() => ({ corpo: { data: [{ id: 11, codigo: "AN-1", nome: "Anel", preco: 12.5 }, { id: 12, codigo: "br-2", nome: "Brinco", preco: 8 }] } })])
    const achados = await buscarProdutos(f, "tok", ["AN-1", "BR-2", "AN-1"])
    expect(chamadas).toHaveLength(1)
    const u = new URL(chamadas[0].url)
    expect(u.pathname).toBe("/Api/v3/produtos")
    expect(u.searchParams.getAll("codigos[]")).toEqual(["AN-1", "BR-2"])
    expect(u.searchParams.get("criterio")).toBe("2")
    expect(((chamadas[0].init?.headers ?? {}) as Record<string, string>).Authorization).toBe("Bearer tok")
    expect(achados.get("br-2")).toEqual({ id: 12, codigo: "br-2", nome: "Brinco", preco: 8 })
    expect(achados.get("an-1")?.preco).toBe(12.5)
    expect(achados.get("co-3")).toBeUndefined()
  })

  test("mais de 100 códigos viram lotes (no máximo 3 chamadas) e passar disso é recusado antes de chamar", async () => {
    const codigos = Array.from({ length: 250 }, (_, n) => `C${n}`)
    const { f, chamadas } = falso([() => ({ corpo: { data: [] } }), () => ({ corpo: { data: [] } }), () => ({ corpo: { data: [] } })])
    await buscarProdutos(f, "t", codigos)
    expect(chamadas).toHaveLength(3)
    const vazio = falso([])
    await expect(buscarProdutos(vazio.f, "t", Array.from({ length: 301 }, (_, n) => `C${n}`))).rejects.toBeInstanceOf(ErroBling)
    expect(vazio.chamadas).toHaveLength(0)
  })

  test("contatos: pesquisa por nome/CNPJ e esconde os excluídos", async () => {
    const { f, chamadas } = falso([() => ({ corpo: { data: [{ id: 1, nome: "Arvenne", numeroDocumento: "123", situacao: "A" }, { id: 2, nome: "Arvenne velha", situacao: "E" }] } })])
    expect(await buscarContatos(f, "t", "Arvenne")).toEqual([{ id: 1, nome: "Arvenne", documento: "123" }])
    expect(new URL(chamadas[0].url).searchParams.get("pesquisa")).toBe("Arvenne")
  })
})

describe("pedido de venda", () => {
  test("corpo do pedido: contato, datas de hoje, itens com produto.id, quantidade e valor", () => {
    const corpo = corpoPedido({
      contatoId: 77, hoje: "2026-11-26", observacoes: "Arvenne – pedido nº W0007 – cliente Maria",
      itens: [{ produtoId: 11, codigo: "AN-1", descricao: "Anel", qtd: 2, valor: 12.5 }],
    })
    expect(corpo).toEqual({
      contato: { id: 77 }, data: "2026-11-26", dataSaida: "2026-11-26", dataPrevista: "2026-11-26",
      observacoes: "Arvenne – pedido nº W0007 – cliente Maria",
      itens: [{ codigo: "AN-1", descricao: "Anel", quantidade: 2, valor: 12.5, produto: { id: 11 } }],
    })
  })

  test("observação com nº e cliente; da página PDV sai só 'Arvenne'", () => {
    expect(observacaoPedido({ numeroPedido: "W0007", cliente: "Maria" })).toBe("Arvenne – pedido nº W0007 – cliente Maria")
    expect(observacaoPedido({})).toBe("Arvenne")
  })

  test("a data é a de São Paulo, mesmo logo depois da meia-noite UTC", () => {
    expect(dataHoje(new Date("2026-11-26T02:30:00Z"))).toBe("2026-11-25")
    expect(dataHoje(new Date("2026-11-26T12:00:00Z"))).toBe("2026-11-26")
  })

  test("total em centavos: 3 x 0,10 dá 0,30 (sem erro de ponto flutuante)", () => {
    expect(totalDasLinhas([{ qtd: 3, valor: 0.1 }])).toBe(0.3)
    expect(totalDasLinhas([{ qtd: 2, valor: 12.5 }, { qtd: 1, valor: 8.05 }])).toBe(33.05)
    expect(totalDasLinhas([])).toBe(0)
  })

  test("criar: POST /pedidos/vendas e depois lê o número em GET /pedidos/vendas/{id}", async () => {
    const { f, chamadas } = falso([() => ({ status: 201, corpo: { data: { id: 555 } } }), () => ({ corpo: { data: { id: 555, numero: 1234 } } })])
    expect(await criarPedido(f, "tok", { contato: { id: 1 } })).toEqual({ id: 555, numero: "1234" })
    expect(chamadas[0].init?.method).toBe("POST")
    expect(JSON.parse(chamadas[0].init?.body as string)).toEqual({ contato: { id: 1 } })
    expect(new URL(chamadas[1].url).pathname).toBe("/Api/v3/pedidos/vendas/555")
  })

  test("se ler o número falhar, o pedido já criado não se perde (número fica nulo)", async () => {
    const { f } = falso([() => ({ status: 201, corpo: { data: { id: 9 } } }), () => ({ status: 500, corpo: null })])
    expect(await criarPedido(f, "t", {})).toEqual({ id: 9, numero: null })
  })

  test("erro do Bling na criação vira mensagem com o campo recusado", async () => {
    const { f } = falso([() => ({ status: 400, corpo: { error: { type: "VALIDATION_ERROR", message: "x", description: "y", fields: [{ element: "itens[0].valor", msg: "valor inválido" }] } } })])
    await expect(criarPedido(f, "t", {})).rejects.toThrow(/itens\[0\]\.valor: valor inválido/)
  })
})

describe("erros em português simples", () => {
  test.each([
    [401, null, /Conectar ao Bling/],
    [403, null, /permissões do aplicativo/],
    [429, { error: { type: "TOO_MANY_REQUESTS" } }, /esperar um pouco/],
    [404, null, /não encontrou/],
    [503, null, /problema agora/],
    [400, { error: { description: "Contato inexistente" } }, /Contato inexistente/],
    [400, null, /recusou/],
  ])("%s", (status, corpo, esperado) => {
    expect(traduzirErro(status, corpo)).toMatch(esperado)
  })
})
