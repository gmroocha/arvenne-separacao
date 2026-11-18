import {test,expect} from '@playwright/test'
import {criarSimulacao,SUPABASE_FICTICIO} from '../../scripts/simulacao/banco.mjs'
let sim

let outro
test.afterEach(async()=>{await outro?.close();outro=null;await sim?.fechar();sim=null})

test('duplo clique em dois navegadores conserva a peça e a etapa muda uma vez só',async({browser,context,page,baseURL})=>{
 sim=await criarSimulacao();await sim.instalar(context,baseURL)
 outro=await browser.newContext({baseURL,viewport:page.viewportSize(),colorScheme:'dark',serviceWorkers:'block'})
 await sim.instalar(outro,baseURL);const segunda=await outro.newPage()
 await Promise.all([page.goto(`/pedidos/${sim.pedido.id}`),segunda.goto(`/pedidos/${sim.pedido.id}`)])
 await Promise.all([page.getByRole('button',{name:'Achei',exact:true}).dblclick(),segunda.getByRole('button',{name:'Achei',exact:true}).dblclick()])
 await expect.poll(async()=> (await sim.one('select status from pedido_itens where id=$1',[sim.item.id])).status).toBe('encontrado')
 await expect.poll(async()=> (await sim.one('select status from pedidos where id=$1',[sim.pedido.id])).status).toBe('conferencia')
 await sim.ocioso()
 const item=await sim.one('select status,qtd,qtd_bipada from pedido_itens where id=$1',[sim.item.id])
 expect(item).toEqual({status:'encontrado',qtd:2,qtd_bipada:0})
 // Valores absolutos: as duas telas mandam o mesmo "encontrado" e o banco muda a etapa uma vez; achei não vira evento.
 expect(Number((await sim.one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='status' and para='conferencia'",[sim.pedido.id])).n)).toBe(1)
 expect(Number((await sim.one("select count(*) n from pedido_eventos where item_id=$1 and tipo='item'",[sim.item.id])).n)).toBe(0)
 await Promise.all([page.reload(),segunda.reload()])
 await expect(page.getByRole('button',{name:'Conferida',exact:true})).toBeVisible()
 await expect(segunda.getByRole('button',{name:'Conferida',exact:true})).toBeVisible()
 expect(sim.bloqueadas).toEqual([])
})

test('V57: resposta perdida depois da gravação é repetida sem contar duas vezes nem repetir o evento',async({context,page,baseURL})=>{
 sim=await criarSimulacao();await sim.instalar(context,baseURL)
 await page.goto(`/pedidos/${sim.pedido.id}`);await page.waitForLoadState('networkidle');await sim.ocioso()
 let perdeu=false,chamadas=0
 await context.route(u=>u.origin===SUPABASE_FICTICIO&&u.pathname==='/rest/v1/rpc/marcar_pecas',async route=>{
  chamadas++
  if(perdeu)return route.fallback()
  const corpo=route.request().postDataJSON()
  expect(corpo.p_marcas).toEqual([{item:sim.item.id,campo:'status',valor:'encontrado'}])
  // Executa a escrita real no banco fictício, mas perde a resposta de sucesso após o commit.
  await sim.banco.exec('begin; set local role authenticated')
  try{await sim.banco.query('select marcar_pecas($1,$2::jsonb)',[sim.pedido.id,JSON.stringify(corpo.p_marcas)]);await sim.banco.exec('commit')}
  catch(e){await sim.banco.exec('rollback');throw e}
  perdeu=true
  await route.fulfill({status:502,json:{message:'Resposta perdida após gravar (simulação)'}})
 })
 await page.getByRole('button',{name:'Achei',exact:true}).click()
 // A tela não desfaz e a fila repete as mesmas marcas (valores absolutos): o resultado é o mesmo da primeira vez.
 await expect.poll(()=>chamadas,{timeout:15000}).toBeGreaterThanOrEqual(2)
 await expect(page.getByRole('button',{name:'Conferida',exact:true})).toBeVisible()
 expect((await sim.one('select status from pedidos where id=$1',[sim.pedido.id])).status).toBe('conferencia')
 expect((await sim.one('select qtd from pedido_itens where id=$1',[sim.item.id])).qtd).toBe(2)
 expect(Number((await sim.one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='status' and para='conferencia'",[sim.pedido.id])).n)).toBe(1)
 expect(sim.bloqueadas).toEqual([])
})

test('HTML, emoji e textos longos são tratados como texto sem execução nem overflow',async({context,page,baseURL})=>{
 sim=await criarSimulacao();await sim.instalar(context,baseURL)
 const entrada='<img src="https://ataque.ficticia.test/x" onerror="window.__executouVistoria=true">😀'+ 'X'.repeat(8000)
 await sim.banco.query('update pedidos set cliente_nome=$2 where id=$1',[sim.pedido.id,entrada])
 await sim.banco.query('update pedido_itens set nome=$2,sku=$3 where id=$1',[sim.item.id,entrada,'SKU😀'+'Z'.repeat(2000)])
 for(const rota of [`/pedidos/${sim.pedido.id}`,`/r/${sim.pedido.token_publico}`]){
  await page.goto(rota);await page.waitForLoadState('networkidle')
  expect(await page.evaluate(()=>window.__executouVistoria)).toBeUndefined()
  await expect(page.locator('img[src*="ataque.ficticia.test"]')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0)
 }
 expect(sim.bloqueadas).toEqual([])
})
