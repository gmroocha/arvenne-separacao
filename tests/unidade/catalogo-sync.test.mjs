import { afterAll, beforeAll, expect, test, vi } from "vitest"

// Função Edge catalogo-sync com Shopify e Supabase simulados: nada sai da máquina.
const sim = vi.hoisted(() => ({ respostas: [], gravado: [], apagado: [], marcador: null, handler: null }))
vi.mock("../../supabase/functions/_shared/http.ts", () => ({
  admin: () => ({
    from: (tabela) => ({
      upsert: async (linhas) => {
        if (tabela === "catalogo_sincronizacao") sim.marcador = linhas
        else sim.gravado.push(...linhas)
        return { error: null }
      },
      delete: () => ({
        in: async (_c, ids) => { sim.apagado.push(...ids); return { error: null } },
        lt: () => ({ select: async () => ({ data: [], error: null }) }),
      }),
    }),
  }),
  cors: {}, exigirEquipe: async () => null,
  json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
}))
vi.mock("../../supabase/functions/_shared/shopify.ts", () => ({ consulta: async (q, v) => sim.respostas.shift()(q, v) }))
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn) => { sim.handler = fn }, env: { get: () => "" } })
  await import("../../supabase/functions/catalogo-sync/index.ts")
})
afterAll(() => vi.unstubAllGlobals())
const chamar = async (corpo) => (await sim.handler(new Request("http://x", { method: "POST", body: JSON.stringify(corpo) }))).json()
const variante = (id) => ({ legacyResourceId: String(id), sku: `S${id}`, title: "M", price: "10.00", inventoryPolicy: "DENY", image: null })
const produto = { legacyResourceId: "1", title: "Anel", status: "ACTIVE", featuredMedia: null }

test("V24: variante apagada na Shopify sai do cache; marcador do catálogo não muda", async () => {
  sim.marcador = null; sim.apagado = []
  sim.respostas.push(() => ({ nodes: [{ ...variante(10), product: produto }, null] }))
  const r = await chamar({ variantIds: ["10", "11"] })
  expect(r).toEqual({ modo: "variantes", variantes: 1, removidas: 1 })
  expect(sim.apagado).toEqual([11])
  expect(sim.marcador).toBeNull()
})

test("V26 e V23: produto com mais de 100 variantes lê todas as páginas e só então marca o catálogo", async () => {
  sim.gravado = []; sim.marcador = null
  sim.respostas.push(() => ({ productVariants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }))
  sim.respostas.push(() => ({ products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
    id: "gid://shopify/Product/1", ...produto,
    variants: { pageInfo: { hasNextPage: true, endCursor: "c1" }, nodes: Array.from({ length: 100 }, (_, n) => variante(n + 1)) } }] } }))
  sim.respostas.push((q, v) => {
    expect(v).toEqual({ id: "gid://shopify/Product/1", cursor: "c1" })
    return { product: { variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [variante(101)] } } }
  })
  const r = await chamar({ desde: "2026-11-12T10:00:00Z" })
  expect(r.variantes).toBe(101)
  expect(sim.gravado.map((l) => l.variant_id)).toContain(101)
  expect(sim.marcador.modo).toBe("incremental")
  expect(sim.marcador.variantes).toBe(101)
})

test.each([
 ['produto desapareceu',null],
 ['cursor repetido',{variants:{nodes:[variante(101)],pageInfo:{hasNextPage:true,endCursor:'c1'}}}],
 ['cursor ausente',{variants:{nodes:[variante(101)],pageInfo:{hasNextPage:true,endCursor:null}}}],
])('V46: não avança o marcador do catálogo quando %s na paginação',async(_nome,proxima)=>{
 sim.gravado=[];sim.marcador=null;sim.respostas=[]
 sim.respostas.push(()=>({productVariants:{pageInfo:{hasNextPage:false,endCursor:null},nodes:[]}}))
 sim.respostas.push(()=>({products:{pageInfo:{hasNextPage:false,endCursor:null},nodes:[{
  id:'gid://shopify/Product/1',...produto,variants:{pageInfo:{hasNextPage:true,endCursor:'c1'},nodes:[variante(1)]}
 }]}}))
 sim.respostas.push(()=>({product:proxima}))
 sim.respostas.push(()=>({product:null})) // a implementação antiga quebrava o loop como se tivesse terminado
 const r=await chamar({desde:'2026-11-12T10:00:00Z'})
 expect(r.erro).toMatch(/variantes|paginação/)
 expect(sim.marcador).toBeNull()
 expect(sim.gravado).toEqual([])
})

test('V46: incremental não aninha 25 produtos por 100 variantes em uma consulta',async()=>{
 sim.marcador=null;sim.respostas=[]
 sim.respostas.push(()=>({productVariants:{pageInfo:{hasNextPage:false,endCursor:null},nodes:[]}}))
 sim.respostas.push(q=>{
  expect(q).toMatch(/products\(first: 3,/)
  return {products:{pageInfo:{hasNextPage:false,endCursor:null},nodes:[]}}
 })
 const r=await chamar({desde:'2026-11-12T10:00:00Z'})
 expect(r.erro).toBeUndefined()
 expect(sim.marcador).not.toBeNull()
})
