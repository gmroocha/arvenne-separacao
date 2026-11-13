// Conferência real só de leitura. Nunca grava credenciais/tokens nos resultados ou em capturas de login.
import {chromium} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {instalarRedeSemGravacao} from '../simulacao/rede.mjs'
process.loadEnvFile('.env.local')
const baseUrl=process.env.APP_URL??'https://arvenne-separacao.gmroocha.workers.dev'
const supabaseUrl=process.env.VITE_SUPABASE_URL
const fase=process.argv.includes('--antes')?'antes':'depois'
if(!process.env.E2E_EMAIL||!process.env.E2E_SENHA||!supabaseUrl)throw Error('Credenciais de teste ausentes (valores omitidos)')
const nav=await chromium.launch(),medidas=[],bloqueadas=[]
const caminhoSeguro=url=>new URL(url).pathname.replace(/^\/(r|t)\/[^/]+/,'/$1/:token')
mkdirSync('capturas/vistoria2',{recursive:true});mkdirSync('.playwright',{recursive:true})
try{
 const ctx=await nav.newContext({viewport:{width:390,height:844},colorScheme:'dark',serviceWorkers:'block'})
 await instalarRedeSemGravacao(ctx,{baseUrl,supabaseUrl,aoBloquear:req=>bloqueadas.push({metodo:req.method(),path:caminhoSeguro(req.url())}),responder:async req=>{
  const u=new URL(req.url())
  // Descoberta de impressora fictícia: não contata nenhum dispositivo físico.
  if(['http://localhost:9100','https://localhost:9101'].includes(u.origin)&&u.pathname==='/default'&&req.method()==='GET')return {json:{}}
  return null
 }})
 // Única escrita autorizada neste roteiro: login. Todas as gravações de negócio continuam barradas.
 await ctx.route(`${supabaseUrl}/auth/v1/token?grant_type=password`,async route=>{
  if(route.request().method()!=='POST')return route.abort()
  await route.fulfill({response:await route.fetch()})
 },{times:1})
 await ctx.addInitScript(()=>{
  window.__vistoria={lcp:0,cls:0,interacao:0,eventos:0,eventTiming:PerformanceObserver.supportedEntryTypes.includes('event')}
  new PerformanceObserver(l=>{for(const e of l.getEntries())window.__vistoria.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})
  new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__vistoria.cls+=e.value}).observe({type:'layout-shift',buffered:true})
  if(window.__vistoria.eventTiming)new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId){window.__vistoria.interacao=Math.max(window.__vistoria.interacao,e.duration);window.__vistoria.eventos++}}).observe({type:'event',buffered:true,durationThreshold:16})
 })
 const login=await ctx.newPage();await login.goto(`${baseUrl}/login`)
 await login.locator('#email').fill(process.env.E2E_EMAIL);await login.locator('#senha').fill(process.env.E2E_SENHA)
 await login.locator('button[type=submit]').click();await login.waitForURL(u=>u.pathname==='/',{timeout:30000});await login.waitForLoadState('networkidle')
 const ids=await login.evaluate(async({sb,key})=>{
  const k=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')),s=JSON.parse(localStorage.getItem(k))
  const ler=async path=>{const r=await fetch(`${sb}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${s.access_token}`}});return r.ok?(await r.json())[0]:null}
  return {pedido:await ler('pedidos?select=id,token_publico&limit=1'),troca:await ler('trocas?select=token&limit=1')}
 },{sb:supabaseUrl,key:process.env.VITE_SUPABASE_ANON_KEY})
 await login.close()
 const rotas=[['expedicao','/'],['vendas','/vendas'],['arquivo','/arquivo'],['clube','/clube'],['repetidas','/repetidas'],['feedbacks','/feedbacks']]
 if(ids.pedido)rotas.push(['pedido',`/pedidos/${ids.pedido.id}`],['romaneio',`/r/${ids.pedido.token_publico}`])
 if(ids.troca)rotas.push(['troca',`/t/${ids.troca.token}`])
 for(const largura of [390,1280])for(const tema of ['light','dark']){
  const p=await ctx.newPage();await p.setViewportSize({width:largura,height:largura===390?844:900});await p.emulateMedia({colorScheme:tema})
  await p.addInitScript(t=>localStorage.setItem('theme',t),tema)
  for(const[nome,rota]of rotas){
   let requisicoes=0,erros=0,consoleErros=0;const falhas=[]
   const onError=()=>erros++,onReq=()=>requisicoes++,onConsole=m=>{if(m.type()==='error')consoleErros++},onRes=r=>{if(r.status()>=400)falhas.push({status:r.status(),path:caminhoSeguro(r.url())})}
   p.on('pageerror',onError);p.on('request',onReq);p.on('response',onRes);p.on('console',onConsole)
   const inicio=performance.now();await p.goto(baseUrl+rota);await p.waitForLoadState('networkidle',{timeout:20000})
   const aberturaMs=Math.round(performance.now()-inicio)
   if(nome==='pedido'&&await p.getByRole('button',{name:'Mais ações',exact:true}).count()){
    await p.getByRole('button',{name:'Mais ações',exact:true}).click();await p.keyboard.press('Escape');await p.waitForTimeout(300)
   }
   const m=await p.evaluate(()=>({...window.__vistoria,overflow:document.documentElement.scrollWidth-innerWidth,recursos:performance.getEntriesByType('resource').length}))
   medidas.push({nome,largura,tema,aberturaMs,requisicoes,...m,erros,consoleErros,falhas})
   await p.screenshot({path:`capturas/vistoria2/publicado-${fase}-${nome}-${largura}-${tema}.png`,fullPage:true})
   p.off('pageerror',onError);p.off('request',onReq);p.off('response',onRes);p.off('console',onConsole)
  }
  await p.close()
 }
 await ctx.close()
}finally{await nav.close()}
const resultado={fase,ambiente:'Chromium sem throttling; laboratório. Event Timing do menu não é INP de campo; duração ausente significa abaixo do limiar de 16 ms ou nenhuma amostra.',medidas,bloqueadas}
writeFileSync(`.playwright/vistoria2-publicado-${fase}.json`,JSON.stringify(resultado,null,2))
console.log(JSON.stringify(resultado))
