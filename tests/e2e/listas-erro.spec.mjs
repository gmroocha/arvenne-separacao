import {test,expect} from '@playwright/test'
import {instalarRedeSemGravacao} from '../../scripts/simulacao/rede.mjs'
import {mkdirSync} from 'node:fs'
import AxeBuilder from '@axe-core/playwright'

// Contrato de erro/vazio: não precisa semear valores nem abrir PostgreSQL para responder HTTP 500/[] .
const sb='https://simulacao.supabase.test'
for(const tema of ['light','dark']){
 test(`V55: listas explicam falha de rede e recuperam com nova tentativa (${tema})`,async({context,page,baseURL},info)=>{
  test.setTimeout(90000)
  const user={id:'00000000-0000-0000-0000-000000000001',email:'teste@example.test',aud:'authenticated',role:'authenticated'}
  const exp=Math.floor(Date.now()/1000)+3600
  const jwt=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({...user,sub:user.id,exp})).toString('base64url'),'ficticio'].join('.')
  await context.addInitScript(({sessao,tema})=>{localStorage.setItem('sb-simulacao-auth-token',JSON.stringify(sessao));localStorage.setItem('theme',tema)},
   {sessao:{access_token:jwt,refresh_token:'ficticio',expires_at:exp,expires_in:3600,token_type:'bearer',user},tema})
  let falhar=true,tabela='v_pedidos'
  await instalarRedeSemGravacao(context,{baseUrl:baseURL,supabaseUrl:sb,responder:async req=>{
   const u=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range','content-range':'0-0/0'}
   if(u.origin==='http://localhost:9100'&&u.pathname==='/default')return {json:{}}
   if(u.origin!==sb)return null
   if(u.pathname==='/auth/v1/user')return {json:user,headers}
   if(u.pathname.startsWith('/rest/v1/')&&['GET','HEAD'].includes(req.method())){
    if(falhar&&u.pathname===`/rest/v1/${tabela}`)return {status:500,json:{message:'Falha fictícia de conexão'},headers}
    return req.method()==='HEAD'?{body:'',headers}:{json:[],headers}
   }
   return null
  }})
  mkdirSync('capturas/vistoria2',{recursive:true})
  for(const [nome,rota,fonte,vazio] of [
   ['expedicao','/','v_pedidos','Nenhum pedido'],['vendas','/vendas','v_pedidos','Nenhuma venda aqui'],
   ['arquivo','/arquivo','v_pedidos','Nenhum pedido encontrado'],['clube','/clube','pecas_clube','Nenhuma peça do Clube'],
   ['repetidas','/repetidas','v_pecas_em_varios_pedidos','Nenhuma peça repetida'],['feedbacks','/feedbacks','feedbacks','Nenhum feedback aberto'],
  ]){
   falhar=true;tabela=fonte;await page.goto(rota)
   const aviso=page.getByRole('alert').filter({hasText:'Não foi possível carregar'})
   await expect(aviso).toBeVisible()
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
   await page.screenshot({path:`capturas/vistoria2/erro-${nome}-${info.project.name}-${tema}.png`,fullPage:true,animations:'disabled'})
   falhar=false;await aviso.getByRole('button',{name:'Tentar novamente',exact:true}).click()
   await expect(aviso).toBeHidden()
   await expect(page.getByText(vazio,{exact:false}).filter({visible:true}).first()).toBeVisible()
  }
 })
}
