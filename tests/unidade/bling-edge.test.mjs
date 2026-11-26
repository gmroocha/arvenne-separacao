import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

// Função Edge `bling` com Supabase e Bling de mentira: nada de rede, de login real nem de segredo.
const PEDIDO = '11111111-1111-4111-8111-111111111111'
const sim = vi.hoisted(() => ({ handler: null, gestor: true, tabelas: {}, doUsuario: {}, rpcs: {}, escritasUsuario: [], bling: [] }))

// Query builder em memória: o bastante para os encadeamentos que a função usa.
function consulta(banco, tabela, onEscrever) {
  const q = { op: 'select', dados: null, filtros: [], ordem: null, max: null, retorna: false, conflito: null }
  const linhas = () => {
    let r = (banco[tabela] ??= []).filter((l) => q.filtros.every((f) => f(l)))
    if (q.ordem) r = [...r].sort((a, b) => (a[q.ordem] < b[q.ordem] ? 1 : -1))
    return q.max ? r.slice(0, q.max) : r
  }
  const executar = () => {
    const alvo = (banco[tabela] ??= [])
    if (q.op === 'select') return { data: linhas().map((l) => ({ ...l })), error: null }
    if (q.op === 'update') {
      const r = linhas(); r.forEach((l) => Object.assign(l, q.dados)); onEscrever?.(['update', tabela, q.dados])
      return { data: q.retorna ? r.map((l) => ({ ...l })) : null, error: null }
    }
    if (q.op === 'insert') { alvo.push({ ...q.dados }); onEscrever?.(['insert', tabela, q.dados]); return { data: null, error: sim.falhaInsert?.[tabela] ?? null } }
    if (q.op === 'upsert') {
      for (const d of [].concat(q.dados)) {
        const chave = tabela === 'bling_codigos' ? 'sku' : 'id'
        const l = alvo.find((x) => x[chave] === d[chave])
        if (l) Object.assign(l, d); else alvo.push({ ...d })
      }
      onEscrever?.(['upsert', tabela, q.dados]); return { data: null, error: null }
    }
    if (q.op === 'delete') { banco[tabela] = alvo.filter((l) => !q.filtros.every((f) => f(l))); onEscrever?.(['delete', tabela]); return { data: null, error: null } }
  }
  const b = {
    select: () => { if (q.op !== 'select') q.retorna = true; return b },
    update: (d) => { q.op = 'update'; q.dados = d; return b },
    insert: (d) => { q.op = 'insert'; q.dados = d; return b },
    upsert: (d) => { q.op = 'upsert'; q.dados = d; return b },
    delete: () => { q.op = 'delete'; return b },
    eq: (c, v) => { q.filtros.push((l) => l[c] === v); return b },
    gt: (c, v) => { q.filtros.push((l) => l[c] > v); return b },
    in: (c, v) => { q.filtros.push((l) => v.includes(l[c])); return b },
    order: (c) => { q.ordem = c; return b },
    limit: (n) => { q.max = n; return b },
    maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    then: (ok, ruim) => Promise.resolve(executar()).then(ok, ruim),
  }
  return b
}

vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  cors: {},
  json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
  comoUsuario: () => ({
    rpc: async (nome) => (nome === 'sou_gestor' ? { data: sim.gestor, error: null } : { data: sim.rpcs[nome] ?? null, error: null }),
    from: (t) => consulta(sim.doUsuario, t, (e) => sim.escritasUsuario.push(e)),
  }),
  admin: () => ({ from: (t) => consulta(sim.tabelas, t) }),
}))

const AGORA = Date.now()
const mais = (h) => new Date(AGORA + h * 3600_000).toISOString()

// Bling falso: responde por rota e guarda o que recebeu.
function blingFalso(rotas) {
  return vi.fn(async (url, init) => {
    const u = new URL(url)
    sim.bling.push({ metodo: init?.method ?? 'GET', caminho: u.pathname, consulta: u.searchParams, corpo: init?.body, auth: init?.headers?.Authorization })
    const chave = `${init?.method ?? 'GET'} ${u.pathname}`
    const r = rotas[chave]
    if (!r) throw new Error(`rota inesperada ${chave}`)
    const { status = 200, corpo } = typeof r === 'function' ? r(u, init) : r
    return new Response(JSON.stringify(corpo ?? null), { status })
  })
}
const PRODUTOS = { data: [{ id: 11, codigo: 'ANEL-001', nome: 'Anel Liso', preco: 12.5 }, { id: 12, codigo: 'BR-2', nome: 'Brinco', preco: 8 }] }
const ROTAS = {
  'GET /Api/v3/produtos': { corpo: PRODUTOS },
  'POST /Api/v3/pedidos/vendas': { status: 201, corpo: { data: { id: 555 } } },
  'GET /Api/v3/pedidos/vendas/555': { corpo: { data: { id: 555, numero: 1234 } } },
}

beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (fn) => { sim.handler = fn }, env: { get: (k) => (k === 'BLING_CLIENT_ID' ? 'id-ficticio' : k === 'BLING_CLIENT_SECRET' ? 'segredo-ficticio' : 'x') } })
  await import('../../supabase/functions/bling/index.ts')
})
afterAll(() => { vi.unstubAllGlobals() })
beforeEach(() => {
  sim.gestor = true; sim.bling = []; sim.escritasUsuario = []; sim.falhaInsert = {}
  sim.rpcs = { membro_atual: 'm1' }
  sim.tabelas = {
    bling_conexao: [{ id: true, access_token: 'tok', refresh_token: 'ref', expira_em: mais(5), contato_id: 77, contato_nome: 'Arvenne', estado_oauth: null, estado_expira: null }],
    bling_codigos: [{ sku: 'AN-1', codigo_bling: 'ANEL-001' }],
    bling_pedidos: [],
    equipe: [{ id: 'm1', nome: 'Ana' }],
  }
  sim.doUsuario = { pedidos: [{ id: PEDIDO, numero: 'W0007', cliente_nome: 'Maria', pedido_fornecedor_em: null }] }
  vi.stubGlobal('fetch', blingFalso(ROTAS))
})
const chamar = (corpo, jwt = 'Bearer jwt-de-teste') => sim.handler(new Request('https://edge.ficticia.test', {
  method: 'POST', headers: jwt ? { Authorization: jwt } : {}, body: JSON.stringify(corpo),
}))
const ler = async (r) => ({ status: r.status, ...(await r.json()) })
const conexao = () => sim.tabelas.bling_conexao[0]

test('sem login, recusa; método diferente de POST, recusa', async () => {
  expect((await chamar({ acao: 'preparar' }, '')).status).toBe(401)
  expect((await sim.handler(new Request('https://edge.ficticia.test', { method: 'GET' }))).status).toBe(405)
  expect(sim.bling).toHaveLength(0)
})

test('funcionária: sem pedido, conectar, contatos e códigos são só do gestor (nada chega ao Bling)', async () => {
  sim.gestor = false
  const itens = [{ sku: 'AN-1', qtd: 1 }]
  for (const corpo of [{ acao: 'preparar', itens }, { acao: 'gerar', itens }, { acao: 'conectar_inicio' }, { acao: 'contatos', busca: 'abc' },
    { acao: 'definir_contato', id: 1, nome: 'X' }, { acao: 'salvar_codigo', sku: 'A', codigo: 'B' }, { acao: 'apagar_codigo', sku: 'A' }]) {
    const r = await ler(await chamar(corpo))
    expect(r.status, JSON.stringify(corpo)).toBe(403)
    expect(r.erro).toMatch(/Só o gestor/)
  }
  expect(sim.bling).toHaveLength(0)
  expect(sim.tabelas.bling_pedidos).toHaveLength(0)
})

test('funcionária com pedido que NÃO vê (a RLS esconde): 403 sem chamar o Bling; vendo o pedido, passa', async () => {
  sim.gestor = false
  sim.doUsuario = { pedidos: [] }
  const r = await ler(await chamar({ acao: 'preparar', pedido_id: PEDIDO, itens: [{ sku: 'AN-1', qtd: 1 }] }))
  expect(r.status).toBe(403)
  expect(sim.bling).toHaveLength(0)
  sim.doUsuario = { pedidos: [{ id: PEDIDO, numero: 'W0007', cliente_nome: 'Maria', pedido_fornecedor_em: null }] }
  expect((await ler(await chamar({ acao: 'preparar', pedido_id: PEDIDO, itens: [{ sku: 'AN-1', qtd: 1 }] }))).status).toBe(200)
  expect((await ler(await chamar({ acao: 'preparar', pedido_id: 'nao-e-uuid', itens: [{ sku: 'AN-1', qtd: 1 }] }))).status).toBe(400)
})

test('preparar: aplica o código lembrado, busca os produtos numa chamada só e devolve o total calculado no servidor', async () => {
  const r = await ler(await chamar({ acao: 'preparar', itens: [{ sku: 'AN-1', qtd: 2 }, { sku: 'BR-2', qtd: 3 }, { sku: 'ZZ-9', qtd: 1 }] }))
  expect(r.status).toBe(200)
  expect(r.linhas).toEqual([
    { sku: 'AN-1', codigo: 'ANEL-001', qtd: 2, lembrado: true, achou: true, descricao: 'Anel Liso', valor: 12.5, valor_bling: 12.5 },
    { sku: 'BR-2', codigo: 'BR-2', qtd: 3, lembrado: false, achou: true, descricao: 'Brinco', valor: 8, valor_bling: 8 },
    { sku: 'ZZ-9', codigo: 'ZZ-9', qtd: 1, lembrado: false, achou: false, descricao: null, valor: null, valor_bling: null },
  ])
  expect(r.total).toBe(49) // 2 x 12,50 + 3 x 8; a peça não achada não entra
  expect(r.ja_gerado).toBeNull()
  const produtos = sim.bling.filter((c) => c.caminho.endsWith('/produtos'))
  expect(produtos).toHaveLength(1)
  expect(produtos[0].consulta.getAll('codigos[]')).toEqual(['ANEL-001', 'BR-2', 'ZZ-9'])
  expect(produtos[0].auth).toBe('Bearer tok')
})

test('preparar: preço editado vale no total; quantidade e preço inválidos são recusados', async () => {
  const r = await ler(await chamar({ acao: 'preparar', itens: [{ sku: 'BR-2', qtd: 2, valor: 10 }] }))
  expect(r.total).toBe(20)
  expect(r.linhas[0]).toMatchObject({ valor: 10, valor_bling: 8 })
  for (const item of [{ sku: 'A', qtd: 0 }, { sku: 'A', qtd: 1.5 }, { sku: 'A', qtd: 'x' }, { sku: 'A', qtd: 1, valor: -1 }, { sku: 'A', qtd: 1, valor: 'abc' }])
    expect((await ler(await chamar({ acao: 'preparar', itens: [item] }))).status, JSON.stringify(item)).toBe(400)
  expect((await ler(await chamar({ acao: 'preparar', itens: [] }))).status).toBe(400)
})

test('gerar com pedido: cria no Bling, grava o histórico, marca o passo com o login da pessoa e lembra o código trocado', async () => {
  const r = await ler(await chamar({
    acao: 'gerar', pedido_id: PEDIDO, itens: [{ sku: 'AN-1', codigo: 'ANEL-001', qtd: 2, valor: 12.5 }, { sku: 'BR-X', codigo: 'BR-2', qtd: 1, valor: 8 }],
    lembrar: [{ sku: 'BR-X', codigo: 'BR-2' }, { sku: 'IGUAL', codigo: 'IGUAL' }],
  }))
  expect(r).toMatchObject({ status: 200, ok: true, numero: '1234', bling_id: 555, total: 33, avisos: [] })
  const post = sim.bling.find((c) => c.metodo === 'POST')
  const corpo = JSON.parse(post.corpo)
  expect(corpo.contato).toEqual({ id: 77 })
  expect(corpo.observacoes).toBe('Arvenne – pedido nº W0007 – cliente Maria')
  expect(corpo.itens).toEqual([
    { codigo: 'ANEL-001', descricao: 'Anel Liso', quantidade: 2, valor: 12.5, produto: { id: 11 } },
    { codigo: 'BR-2', descricao: 'Brinco', quantidade: 1, valor: 8, produto: { id: 12 } },
  ])
  expect(sim.tabelas.bling_pedidos).toHaveLength(1)
  expect(sim.tabelas.bling_pedidos[0]).toMatchObject({ pedido_id: PEDIDO, bling_id: 555, bling_numero: '1234', total: 33, criado_por: 'Ana' })
  expect(sim.tabelas.bling_codigos.map((c) => [c.sku, c.codigo_bling])).toEqual([['AN-1', 'ANEL-001'], ['BR-X', 'BR-2']])
  // O passo é marcado com o login de quem chamou (não com o service_role): vale a RLS e o histórico.
  expect(sim.escritasUsuario).toHaveLength(1)
  expect(sim.escritasUsuario[0][0]).toBe('update')
  expect(sim.escritasUsuario[0][2]).toMatchObject({ pedido_fornecedor_numero: '1234' })
  expect(sim.escritasUsuario[0][2].pedido_fornecedor_em).toBeTruthy()
})

test('gerar: pedido que já tem um gerado só repete com confirmação', async () => {
  sim.tabelas.bling_pedidos = [{ pedido_id: PEDIDO, bling_id: 1, bling_numero: '999', criado_em: mais(-1) }]
  const corpo = { acao: 'gerar', pedido_id: PEDIDO, itens: [{ sku: 'BR-2', codigo: 'BR-2', qtd: 1, valor: 8 }] }
  const prep = await ler(await chamar({ acao: 'preparar', pedido_id: PEDIDO, itens: [{ sku: 'BR-2', qtd: 1 }] }))
  expect(prep.ja_gerado).toMatchObject({ numero: '999' })
  const recusa = await ler(await chamar(corpo))
  expect(recusa.status).toBe(409)
  expect(recusa.erro).toMatch(/já foi gerado.*999/)
  expect(sim.bling.filter((c) => c.metodo === 'POST')).toHaveLength(0)
  const ok = await ler(await chamar({ ...corpo, confirmar_repetido: true }))
  expect(ok.status).toBe(200)
  expect(sim.tabelas.bling_pedidos).toHaveLength(2)
})

test('gerar: código que o Bling não acha não cria nada; sem cliente escolhido também não', async () => {
  const sem = await ler(await chamar({ acao: 'gerar', itens: [{ sku: 'ZZ', codigo: 'ZZ-9', qtd: 1, valor: 1 }] }))
  expect(sem.status).toBe(400)
  expect(sem.erro).toMatch(/ZZ-9/)
  conexao().contato_id = null
  const semContato = await ler(await chamar({ acao: 'gerar', itens: [{ sku: 'BR-2', codigo: 'BR-2', qtd: 1, valor: 8 }] }))
  expect(semContato.status).toBe(409)
  expect(semContato.erro).toMatch(/cliente Arvenne/)
  expect(sim.bling.filter((c) => c.metodo === 'POST')).toHaveLength(0)
  expect(sim.tabelas.bling_pedidos).toHaveLength(0)
})

test('gerar da página PDV LR (sem pedido): não mexe em pedido algum', async () => {
  const r = await ler(await chamar({ acao: 'gerar', itens: [{ sku: 'BR-2', codigo: 'BR-2', qtd: 1, valor: 8 }] }))
  expect(r.status).toBe(200)
  expect(sim.tabelas.bling_pedidos[0].pedido_id).toBeNull()
  expect(sim.escritasUsuario).toHaveLength(0)
  expect(JSON.parse(sim.bling.find((c) => c.metodo === 'POST').corpo).observacoes).toBe('Arvenne')
})

test('token vencendo (menos de 5 min): renova antes de chamar e grava o par novo; token bom não renova', async () => {
  conexao().expira_em = mais(0.05)
  vi.stubGlobal('fetch', blingFalso({
    ...ROTAS,
    'POST /Api/v3/oauth/token': { corpo: { access_token: 'tok2', refresh_token: 'ref2', expires_in: 21600 } },
  }))
  await chamar({ acao: 'preparar', itens: [{ sku: 'BR-2', qtd: 1 }] })
  expect(sim.bling[0].caminho).toBe('/Api/v3/oauth/token')
  expect(new URLSearchParams(sim.bling[0].corpo).get('refresh_token')).toBe('ref')
  expect(sim.bling[0].auth).toBe(`Basic ${btoa('id-ficticio:segredo-ficticio')}`)
  expect(sim.bling[1].auth).toBe('Bearer tok2')
  expect(conexao()).toMatchObject({ access_token: 'tok2', refresh_token: 'ref2' })
  sim.bling = []
  await chamar({ acao: 'preparar', itens: [{ sku: 'BR-2', qtd: 1 }] })
  expect(sim.bling.map((c) => c.caminho)).toEqual(['/Api/v3/produtos'])
})

test('refresh vencido: pede para conectar de novo e desliga a conexão (o botão some do pedido)', async () => {
  conexao().expira_em = mais(-1)
  vi.stubGlobal('fetch', blingFalso({ 'POST /Api/v3/oauth/token': { status: 400, corpo: { error: { type: 'invalid_grant' } } } }))
  const r = await ler(await chamar({ acao: 'preparar', itens: [{ sku: 'BR-2', qtd: 1 }] }))
  expect(r.status).toBe(409)
  expect(r.reconectar).toBe(true)
  expect(r.erro).toMatch(/Conectar ao Bling/)
  expect(conexao().refresh_token).toBeNull()
})

test('sem conexão: mensagem clara, sem chamar o Bling', async () => {
  conexao().refresh_token = null
  const r = await ler(await chamar({ acao: 'preparar', itens: [{ sku: 'BR-2', qtd: 1 }] }))
  expect(r.status).toBe(409)
  expect(r.erro).toMatch(/ainda não está conectado/)
  expect(sim.bling).toHaveLength(0)
})

test('conectar: o estado vale uma vez e por 10 minutos; troca o code por tokens e guarda quem conectou', async () => {
  conexao().refresh_token = null; conexao().access_token = null
  const ini = await ler(await chamar({ acao: 'conectar_inicio' }))
  const url = new URL(ini.url)
  expect(url.searchParams.get('client_id')).toBe('id-ficticio')
  const estado = url.searchParams.get('state')
  expect(estado).toBe(conexao().estado_oauth)
  expect(JSON.stringify(ini)).not.toContain('segredo-ficticio')

  vi.stubGlobal('fetch', blingFalso({ 'POST /Api/v3/oauth/token': { corpo: { access_token: 'novo', refresh_token: 'novo-ref', expires_in: 21600 } } }))
  expect((await ler(await chamar({ acao: 'conectar_fim', code: 'c1', state: 'outro' }))).status).toBe(409) // estado errado
  expect(sim.bling).toHaveLength(0)
  const fim = await ler(await chamar({ acao: 'conectar_fim', code: 'c1', state: estado }))
  expect(fim.status).toBe(200)
  expect(conexao()).toMatchObject({ access_token: 'novo', refresh_token: 'novo-ref', conectado_por: 'Ana', estado_oauth: null })
  expect(new URLSearchParams(sim.bling[0].corpo).get('code')).toBe('c1')
  expect((await ler(await chamar({ acao: 'conectar_fim', code: 'c1', state: estado }))).status).toBe(409) // reuso
})

test('contatos e cliente: busca no Bling, grava qual é a Arvenne; códigos lembrados salvam e apagam', async () => {
  vi.stubGlobal('fetch', blingFalso({ 'GET /Api/v3/contatos': { corpo: { data: [{ id: 77, nome: 'Arvenne Pratas', numeroDocumento: '1', situacao: 'A' }] } } }))
  expect((await ler(await chamar({ acao: 'contatos', busca: 'a' }))).status).toBe(400)
  const c = await ler(await chamar({ acao: 'contatos', busca: 'Arvenne' }))
  expect(c.contatos).toEqual([{ id: 77, nome: 'Arvenne Pratas', documento: '1' }])
  expect((await ler(await chamar({ acao: 'definir_contato', id: 77, nome: 'Arvenne Pratas' }))).status).toBe(200)
  expect(conexao()).toMatchObject({ contato_id: 77, contato_nome: 'Arvenne Pratas' })
  expect((await ler(await chamar({ acao: 'definir_contato', id: 'x', nome: '' }))).status).toBe(400)
  await chamar({ acao: 'salvar_codigo', sku: 'CO-3', codigo: 'COLAR-3' })
  expect(sim.tabelas.bling_codigos.find((x) => x.sku === 'CO-3').codigo_bling).toBe('COLAR-3')
  await chamar({ acao: 'apagar_codigo', sku: 'CO-3' })
  expect(sim.tabelas.bling_codigos.find((x) => x.sku === 'CO-3')).toBeUndefined()
})

test('segredos faltando: erro claro, sem vazar nada', async () => {
  vi.stubGlobal('Deno', { serve: () => {}, env: { get: () => undefined } })
  const r = await ler(await chamar({ acao: 'conectar_inicio' }))
  expect(r.status).toBe(500)
  expect(r.erro).toMatch(/BLING_CLIENT_ID/)
  vi.stubGlobal('Deno', { serve: () => {}, env: { get: (k) => (k === 'BLING_CLIENT_ID' ? 'id-ficticio' : k === 'BLING_CLIENT_SECRET' ? 'segredo-ficticio' : 'x') } })
})
