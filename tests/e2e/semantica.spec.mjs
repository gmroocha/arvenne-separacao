import {test,expect} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {criarSimulacao} from '../../scripts/simulacao/banco.mjs'
import {mkdirSync} from 'node:fs'
let sim
test.afterEach(async()=>{await sim?.fechar();sim=null})
for(const tema of ['light','dark']){
 test(`V49: abas e progresso têm nome e vínculo acessíveis (${tema})`,async({context,page,baseURL},info)=>{
  test.setTimeout(60000)
  await context.addInitScript(t=>localStorage.setItem('theme',t),tema)
  sim=await criarSimulacao();await sim.instalar(context,baseURL)
  mkdirSync('capturas/vistoria2',{recursive:true})
  for(const [nome,rota]of [['vendas','/vendas'],['feedbacks','/feedbacks'],['pedido',`/pedidos/${sim.pedido.id}`]]){
   await page.goto(rota);await page.waitForLoadState('networkidle')
   const r=await new AxeBuilder({page}).withRules(['aria-valid-attr-value','aria-progressbar-name']).analyze()
   expect(r.violations,nome).toEqual([])
   if(nome!=='pedido'){
    const aba=page.getByRole('tab').first();await aba.focus();await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected','true')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    const ativa=page.getByRole('tab',{selected:true})
    await expect(ativa).toHaveAttribute('aria-controls',await page.getByRole('tabpanel').getAttribute('id'))
   }else {
    const barra=page.getByRole('progressbar',{name:'Separação'})
    await expect(barra).toBeVisible();await expect(barra).toHaveAttribute('aria-valuenow','0')
   }
   await page.screenshot({path:`capturas/vistoria2/semantica-${nome}-${info.project.name}-${tema}.png`,fullPage:true,animations:'disabled'})
  }
 })
}

for(const tema of ['light','dark']){
 test(`V59: login tem região principal para leitores de tela (${tema})`,async({context,page,baseURL},info)=>{
  await context.addInitScript(t=>localStorage.setItem('theme',t),tema)
  sim=await criarSimulacao();await sim.instalar(context,baseURL)
  await page.goto('/login');await page.waitForLoadState('networkidle')
  const r=await new AxeBuilder({page}).withRules(['landmark-one-main']).analyze()
  expect(r.violations).toEqual([])
  await expect(page.getByRole('main')).toContainText('Separação Arvenne')
  mkdirSync('capturas/vistoria2',{recursive:true})
  await page.screenshot({path:`capturas/vistoria2/login-landmark-${info.project.name}-${tema}.png`,fullPage:true,animations:'disabled'})
  expect(sim.bloqueadas).toEqual([])
 })
}
