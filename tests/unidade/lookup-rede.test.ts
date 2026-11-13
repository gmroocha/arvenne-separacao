import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {buscarCep} from '@/lib/viacep'
import {buscarCnpj} from '@/lib/cnpj'

beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
function redeParada(){
 vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{
  const c=new AbortController();setTimeout(()=>c.abort(new DOMException('Demorou','TimeoutError')),ms);return c.signal
 })
 const fetch=vi.fn((_url:string,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
  init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true})
 }))
 vi.stubGlobal('fetch',fetch);return fetch
}

test('V52: CEP sem resposta termina com erro e libera o formulário',async()=>{
 redeParada();let terminou=false
 const r=buscarCep('01001000').catch(e=>{terminou=true;return e})
 await vi.advanceTimersByTimeAsync(20001)
 expect(terminou).toBe(true)
 expect(await r).toBeInstanceOf(Error)
})
test('V52: consulta de CNPJ tenta a reserva e termina quando ambas ficam sem resposta',async()=>{
 const fetch=redeParada();let terminou=false
 const r=buscarCnpj('11222333000181').catch(e=>{terminou=true;return e})
 await vi.advanceTimersByTimeAsync(25001)
 expect(terminou).toBe(true);expect(await r).toBeInstanceOf(Error)
 expect(fetch).toHaveBeenCalledTimes(2)
})
test('contrato CEP: inválido não consulta; inexistente volta null; válido normaliza o endereço',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({erro:true}))).mockResolvedValueOnce(new Response(JSON.stringify({logradouro:'Rua A',bairro:'Centro',localidade:'São Paulo',uf:'SP'})))
 vi.stubGlobal('fetch',fetch)
 expect(await buscarCep('123')).toBeNull();expect(fetch).not.toHaveBeenCalled()
 expect(await buscarCep('01001000')).toBeNull()
 expect(await buscarCep('01001-000')).toEqual({logradouro:'Rua A',bairro:'Centro',cidade:'São Paulo',uf:'SP'})
})
