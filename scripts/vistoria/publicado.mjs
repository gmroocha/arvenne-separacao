// Conferência real só de leitura. Credenciais nunca saem do processo; capturas ficam ignoradas.
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { instalarRedeSemGravacao } from '../simulacao/rede.mjs'
process.loadEnvFile('.env.local')
const baseUrl=process.env.APP_URL ?? 'https://arvenne-separacao.gmroocha.workers.dev'
const supabaseUrl=process.env.VITE_SUPABASE_URL
if(!process.env.E2E_EMAIL || !process.env.E2E_SENHA || !supabaseUrl) throw Error('Credenciais de teste ausentes (valores omitidos)')
const nav=await chromium.launch()
const medidas=[], bloqueadas=[]
mkdirSync('capturas/vistoria2',{recursive:true})
try {
  const ctx=await nav.newContext({viewport:{width:390,height:844},colorScheme:'dark',serviceWorkers:'block'})
  await instalarRedeSemGravacao(ctx,{baseUrl,supabaseUrl,aoBloquear:req=>bloqueadas.push({metodo:req.method(),path:new URL(req.url()).pathname})})
  // Única escrita de autenticação autorizada: login de teste. A barreira continua nas demais requisições.
  await ctx.route(`${supabaseUrl}/auth/v1/token?grant_type=password`, async route=> {
    if(route.request().method()!=='POST') return route.abort()
    const resposta=await route.fetch()
    await route.fulfill({response:resposta})
  },{times:1})
  await ctx.addInitScript(()=>{
    window.__vistoria={lcp:0,cls:0}
    new PerformanceObserver(l=>{ for(const e of l.getEntries()) window.__vistoria.lcp=e.startTime }).observe({type:'largest-contentful-paint',buffered:true})
    new PerformanceObserver(l=>{ for(const e of l.getEntries()) if(!e.hadRecentInput) window.__vistoria.cls+=e.value }).observe({type:'layout-shift',buffered:true})
  })
  const p=await ctx.newPage()
  await p.goto(`${baseUrl}/login`)
  await p.locator('#email').fill(process.env.E2E_EMAIL)
  await p.locator('#senha').fill(process.env.E2E_SENHA)
  await p.locator('button[type=submit]').click()
  await p.waitForURL(u=>u.pathname==='/',{timeout:30000})
  await p.waitForLoadState('networkidle')
  // Só identificadores necessários à navegação; não escrever tokens públicos no relatório.
  const pedido=await p.evaluate(async ({sb,key})=>{
    const k=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'))
    const s=JSON.parse(localStorage.getItem(k))
    const r=await fetch(`${sb}/rest/v1/pedidos?select=id,token_publico&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${s.access_token}`}})
    return r.ok?(await r.json())[0]:null
  },{sb:supabaseUrl,key:process.env.VITE_SUPABASE_ANON_KEY}).catch(()=>null)
  // Os links do próprio app evitam consulta extra usando a chave pública.
  const href=await p.locator('a[href^="/pedidos/"]').first().getAttribute('href').catch(()=>null)
  const rotas=[['expedicao','/'],['vendas','/vendas'],['arquivo','/arquivo'],['clube','/clube'],['repetidas','/repetidas'],['feedbacks','/feedbacks']]
  if(href)rotas.push(['pedido',href])
  if(pedido?.token_publico)rotas.push(['romaneio',`/r/${pedido.token_publico}`])
  for(const [nome,rota] of rotas){
    const erros=[],falhas=[];let requisicoes=0
    const onError=()=>erros.push('pageerror'),onReq=()=>requisicoes++,onRes=r=>{if(r.status()>=400)falhas.push({status:r.status(),path:new URL(r.url()).pathname})}
    p.on('pageerror',onError);p.on('request',onReq);p.on('response',onRes)
    const inicio=performance.now()
    await p.goto(baseUrl+rota)
    await p.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{})
    const abertura=performance.now()-inicio
    const metricas=await p.evaluate(()=>({...window.__vistoria,overflow:document.documentElement.scrollWidth-innerWidth,recursos:performance.getEntriesByType('resource').length}))
    medidas.push({nome,aberturaMs:Math.round(abertura),requisicoes,...metricas,erros:erros.length,falhas})
    await p.screenshot({path:`capturas/vistoria2/publicado-${nome}-390-dark.png`,fullPage:true})
    p.off('pageerror',onError);p.off('request',onReq);p.off('response',onRes)
  }
  await ctx.close()
} finally {await nav.close()}
const resultado={ambiente:'publicado, Chromium, 390px, sem throttling; laboratório (não INP de campo)',medidas,bloqueadas}
writeFileSync('/tmp/arvenne-vistoria2-publicado.json',JSON.stringify(resultado,null,2))
console.log(JSON.stringify(resultado))
