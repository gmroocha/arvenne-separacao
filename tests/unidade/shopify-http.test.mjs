import {afterEach,beforeEach,expect,test,vi} from 'vitest'
let consulta
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
 vi.stubGlobal('Deno',{env:{get:n=>({SHOPIFY_STORE_DOMAIN:'loja.ficticia.test',SHOPIFY_CLIENT_ID:'cliente-ficticio',SHOPIFY_CLIENT_SECRET:'segredo-ficticio'})[n]}})
 ;({consulta}=await import('../../supabase/functions/_shared/shopify.ts'))
})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
const json=(x,status=200)=>new Response(JSON.stringify(x),{status})
const token=()=>json({access_token:'token-ficticio',expires_in:3600})

test('V51: HTTP 429 repete a leitura dentro do prazo e reaproveita o token',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(json({erro:'limite'},429)).mockResolvedValueOnce(json({data:{ok:true}}))
 vi.stubGlobal('fetch',fetch)
 const resultado=consulta('query { shop { name } }').then(x=>({x}),e=>({e:e.message}))
 await vi.runAllTimersAsync()
 expect(await resultado).toEqual({x:{ok:true}})
 expect(fetch).toHaveBeenCalledTimes(3)
})

test('V51: repetições respeitam o prazo total informado pelo chamador',async()=>{
 const fetch=vi.fn().mockImplementation(async url=>url.includes('/oauth/')?token():json({errors:[{message:'THROTTLED'}]}))
 vi.stubGlobal('fetch',fetch)
 let terminado=false
 const r=consulta('query { shop { name } }',{}, {limite:Date.now()+5000}).catch(e=>{terminado=true;return e.message})
 await vi.advanceTimersByTimeAsync(5001)
 expect(terminado).toBe(true)
 expect(await r).toMatch(/tempo|demorou/i)
 expect(fetch.mock.calls.filter(([u])=>u.endsWith('/graphql.json')).length).toBeLessThanOrEqual(3)
})

test('contrato Shopify: não repete erro permanente de permissão',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(token()).mockResolvedValue(json({errors:[{message:'ACCESS_DENIED'}]}))
 vi.stubGlobal('fetch',fetch)
 await expect(consulta('query { shop { name } }')).rejects.toThrow('ACCESS_DENIED')
 expect(fetch).toHaveBeenCalledTimes(2)
})
