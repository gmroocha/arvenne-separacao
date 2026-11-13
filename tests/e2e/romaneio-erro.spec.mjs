import {test,expect} from '@playwright/test'
import {criarSimulacao,SUPABASE_FICTICIO} from '../../scripts/simulacao/banco.mjs'
import {mkdirSync} from 'node:fs'
let sim
test.afterEach(async()=>{await sim?.fechar();sim=null})
for(const tema of ['light','dark']){
 test(`V53: falha de rede no romaneio permite tentar novamente (${tema})`,async({context,page,baseURL},info)=>{
  await context.addInitScript(t=>localStorage.setItem('theme',t),tema)
  sim=await criarSimulacao();await sim.instalar(context,baseURL,{logado:false})
  await context.route(`${SUPABASE_FICTICIO}/rest/v1/rpc/romaneio_publico`,route=>route.fulfill({status:503,json:{message:'Falha fictícia temporária'}}),{times:1})
  await page.goto(`/r/${sim.pedido.token_publico}`)
  await expect(page.getByText(/Não foi possível carregar o romaneio/)).toBeVisible()
  await expect(page.getByText('Romaneio não encontrado',{exact:true})).toBeHidden()
  mkdirSync('capturas/vistoria2',{recursive:true})
  await page.screenshot({path:`capturas/vistoria2/romaneio-erro-${info.project.name}-${tema}.png`,fullPage:true})
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
  await expect(page.getByRole('heading',{name:/Pedido W/})).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
 })
}
