import {test,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {criarSimulacao} from '../../scripts/simulacao/banco.mjs'
import {mkdirSync} from 'node:fs'
let sim
test.afterEach(async()=>{await sim?.fechar();sim=null})
for(const tema of ['light','dark']){
 test(`V50: acessibilidade e layout das telas no tema ${tema}`,async({context,page,baseURL},info)=>{
  test.setTimeout(120000)
  await context.addInitScript(t=>localStorage.setItem('theme',t),tema)
  sim=await criarSimulacao({troca:true});await sim.instalar(context,baseURL)
  const erros=[];page.on('pageerror',e=>erros.push(e.message))
  const rotas=[['expedicao','/'],['vendas','/vendas'],['arquivo','/arquivo'],['repetidas','/repetidas'],['clube','/clube'],['feedbacks','/feedbacks'],['pedido',`/pedidos/${sim.pedido.id}`],['romaneio',`/r/${sim.pedido.token_publico}`],['troca',`/t/${sim.troca.token}`]]
  const problemas=[]
  mkdirSync('capturas/vistoria2',{recursive:true})
  for(const [nome,rota]of rotas){
   await page.goto(rota);await page.waitForLoadState('networkidle')
   await expect(page.locator('html')).toHaveClass(tema==='dark'?/dark/:/light/)
   const resultado=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
   if(resultado.violations.length)problemas.push({tela:nome,violacoes:resultado.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({alvo:n.target,motivo:n.failureSummary}))}))})
   expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),nome).toBe(0)
   await page.screenshot({path:`capturas/vistoria2/${nome}-${info.project.name}-${tema}.png`,fullPage:true,animations:'disabled'})
  }
  await info.attach('acessibilidade',{body:JSON.stringify(problemas,null,2),contentType:'application/json'})
  expect(erros).toEqual([])
  expect(problemas).toEqual([])
 })
}
