import {afterEach,beforeEach,expect,test,vi} from 'vitest'
type Payload={new?:Record<string,unknown>;old?:Record<string,unknown>}
type Inscricao={filtro:{table:string};cb:(p:Payload)=>void}
const sim=vi.hoisted(()=>({
 efeito:undefined as (()=>()=>void)|undefined,
 inscricoes:[] as Inscricao[],
 status:undefined as ((s:string)=>void)|undefined,
 mutando:0,
 invalidate:vi.fn<(q?:{queryKey:string[]})=>void>(),
 remover:vi.fn<(canal:unknown)=>void>(),
}))
vi.mock('react',()=>({useEffect:(cb:()=>()=>void)=>{sim.efeito=cb}}))
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({isMutating:()=>sim.mutando,invalidateQueries:sim.invalidate})}))
vi.mock('@/lib/supabase',()=>({supabase:{channel:()=>{
 const canal={on:(_tipo:string,filtro:Inscricao["filtro"],cb:Inscricao["cb"])=>{sim.inscricoes.push({filtro,cb});return canal},subscribe:(cb:(s:string)=>void)=>{sim.status=cb;return canal}}
 return canal
},removeChannel:sim.remover}}))
let limpar:()=>void
let intervalo:()=>number
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();sim.inscricoes=[];sim.mutando=0;sim.invalidate.mockClear();sim.remover.mockClear()
 const m=await import('@/lib/tempoReal');intervalo=m.intervaloListas;m.useTempoReal();if(!sim.efeito)throw Error("Efeito não registrado");limpar=sim.efeito()
})
afterEach(()=>{limpar();vi.useRealTimers()})
test('tempo real: queda volta ao polling curto e reconexão recarrega dados possivelmente perdidos',()=>{
 sim.status?.('SUBSCRIBED');expect(intervalo()).toBe(300000)
 sim.status?.('CHANNEL_ERROR');expect(intervalo()).toBe(60000)
 sim.status?.('SUBSCRIBED');expect(sim.invalidate).toHaveBeenCalledWith()
})
test('tempo real: agrupa eventos de outra pessoa e aguarda a fila local antes de recarregar',async()=>{
 const itens=sim.inscricoes.find(x=>x.filtro.table==='pedido_itens')
 if(!itens)throw Error('Canal de peças não registrado')
 sim.mutando=1;itens.cb({new:{pedido_id:'pedido-ficticio'}});itens.cb({new:{pedido_id:'pedido-ficticio'}})
 await vi.advanceTimersByTimeAsync(800);expect(sim.invalidate).not.toHaveBeenCalled()
 sim.mutando=0;await vi.advanceTimersByTimeAsync(800)
 expect(sim.invalidate).toHaveBeenCalledWith({queryKey:['pedido','pedido-ficticio']})
 expect(sim.invalidate.mock.calls.filter(([q])=>q?.queryKey?.[0]==='pedidos')).toHaveLength(1)
})
