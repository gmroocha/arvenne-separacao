import {test,expect} from '@playwright/test'
import {criarSimulacao} from '../../scripts/simulacao/banco.mjs'
let sim
test.afterEach(async()=>{await sim?.fechar();sim=null})
for(const tema of ['light','dark']){
 test(`regressão visual das páginas da cliente (${tema})`,async({context,page,baseURL})=>{
  await context.addInitScript(t=>localStorage.setItem('theme',t),tema)
  sim=await criarSimulacao({troca:true});await sim.instalar(context,baseURL,{logado:false})
  for(const [nome,rota]of [['romaneio',`/r/${sim.pedido.token_publico}`],['troca',`/t/${sim.troca.token}`]]){
   await page.goto(rota);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready)
   await expect(page).toHaveScreenshot(`${nome}-${tema}.png`,{fullPage:true,animations:'disabled'})
  }
  expect(sim.bloqueadas).toEqual([])
 })
}

test('desempenho: pedido e troca pública abrem dentro do limite local',async({context,page,baseURL},info)=>{
 sim=await criarSimulacao({troca:true});await sim.instalar(context,baseURL)
 const medidas=[]
 for(const [nome,rota,pronto]of [
  ['pedido',`/pedidos/${sim.pedido.id}`,()=>page.getByText('Cliente de teste',{exact:true}).first()],
  ['troca',`/t/${sim.troca.token}`,()=>page.getByRole('button',{name:'Quero esta',exact:true})],
 ]){
  const inicio=performance.now();await page.goto(rota);await expect(pronto()).toBeVisible()
  const ms=Math.round(performance.now()-inicio);medidas.push({nome,ms})
  expect(ms,`${nome}: limite inclui navegador e PostgreSQL em memória`).toBeLessThan(7000)
 }
 await info.attach('desempenho',{body:JSON.stringify(medidas),contentType:'application/json'})
})
