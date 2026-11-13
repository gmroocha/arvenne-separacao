import {test,expect} from '@playwright/test'
import {criarSimulacao} from '../../scripts/simulacao/banco.mjs'
let sim
let liberar
let pendente
let iniciada
let avisarInicio
test.beforeEach(()=>{pendente=new Promise(r=>{liberar=r});iniciada=new Promise(r=>{avisarInicio=r})})
test.afterEach(async()=>{liberar();await sim?.fechar();sim=null})

test('V47: resposta atrasada do CNPJ não troca os dados de uma cliente já alterada',async({context,page,baseURL})=>{
 sim=await criarSimulacao({status:'em_aberto'});await sim.instalar(context,baseURL)
 await context.route('https://open.cnpja.com/office/*',async route=>{
  avisarInicio();await pendente
  await route.fulfill({json:{company:{name:'Empresa antiga'},status:{text:'ATIVA'},address:{zip:'01001000',street:'Rua antiga',city:'São Paulo',state:'SP'}}})
 })
 await page.goto(`/vendas/${sim.pedido.id}`)
 const doc=page.getByRole('textbox',{name:'CPF ou CNPJ',exact:true})
 await doc.fill('11222333000181');await iniciada
 await doc.fill('12345678901')
 liberar()
 await expect(page.getByRole('textbox',{name:'Razão social',exact:true})).toBeHidden()
 // Aguarda a resposta e seu efeito real; sem depender de um timeout curto que poderia passar cedo demais.
 await expect.poll(async()=>{await sim.ocioso();return await page.getByRole('textbox',{name:'Rua',exact:true}).inputValue()}).not.toBe('Rua antiga')
 await page.waitForLoadState('networkidle')
 await expect(page.getByRole('textbox',{name:'Rua',exact:true})).not.toHaveValue('Rua antiga')
 const p=await sim.one('select cliente_cpf,cliente_razao_social,entrega_logradouro from pedidos where id=$1',[sim.pedido.id])
 expect(p.cliente_razao_social).not.toBe('Empresa antiga')
})
