import {afterEach,beforeEach,expect,test,vi} from 'vitest'
type Payload={payload?:{t:string;p:unknown[]}}
type Inscricao={filtro:{event:string};cb:(p:Payload)=>void}
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
vi.mock('@/lib/supabase',()=>({supabase:{realtime:{setAuth:async()=>{}},channel:()=>{
 const canal={on:(_tipo:string,filtro:Inscricao["filtro"],cb:Inscricao["cb"])=>{sim.inscricoes.push({filtro,cb});return canal},subscribe:(cb:(s:string)=>void)=>{sim.status=cb;return canal}}
 return canal
},removeChannel:sim.remover}}))
let limpar:()=>void
let intervalo:()=>number
beforeEach(async()=>{
 vi.resetModules();vi.useFakeTimers();sim.inscricoes=[];sim.mutando=0;sim.status=undefined;sim.invalidate.mockClear();sim.remover.mockClear()
 const m=await import('@/lib/tempoReal');intervalo=m.intervaloListas;m.useTempoReal();if(!sim.efeito)throw Error("Efeito não registrado");limpar=sim.efeito()
 await vi.advanceTimersByTimeAsync(0)
})
afterEach(()=>{limpar();vi.useRealTimers()})
test('tempo real: queda volta ao polling curto e reconexão recarrega dados possivelmente perdidos',async()=>{
 sim.status?.('SUBSCRIBED');expect(intervalo()).toBe(300000)
 sim.status?.('CHANNEL_ERROR');expect(intervalo()).toBe(60000)
 sim.status?.('SUBSCRIBED');await vi.advanceTimersByTimeAsync(15000)
 expect(sim.invalidate).toHaveBeenCalledWith({refetchType:'active'})
})
test('V115: reconexão não relê na mesma hora (espalha os aparelhos entre 2 e 15 s) e relê uma vez só',async()=>{
 sim.status?.('SUBSCRIBED');sim.status?.('CHANNEL_ERROR');sim.status?.('SUBSCRIBED')
 expect(sim.invalidate).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(1999);expect(sim.invalidate).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(13001);expect(sim.invalidate).toHaveBeenCalledTimes(1)
 const {atrasoReconexao}=await import('@/lib/tempoReal')
 for(let n=0;n<200;n++){const a=atrasoReconexao();expect(a).toBeGreaterThanOrEqual(2000);expect(a).toBeLessThan(15000)}
})
test('tempo real: agrupa eventos de outra pessoa e aguarda a fila local antes de recarregar',async()=>{
 const canal=sim.inscricoes.find(x=>x.filtro.event==='mudou')
 if(!canal)throw Error('Canal de avisos não registrado')
 const itens={cb:(p:{new:{pedido_id:string}})=>canal.cb({payload:{t:'pedido_itens',p:[p.new.pedido_id]}})}
 sim.mutando=1;itens.cb({new:{pedido_id:'pedido-ficticio'}});itens.cb({new:{pedido_id:'pedido-ficticio'}})
 await vi.advanceTimersByTimeAsync(800);expect(sim.invalidate).not.toHaveBeenCalled()
 sim.mutando=0;await vi.advanceTimersByTimeAsync(800)
 expect(sim.invalidate).toHaveBeenCalledWith({queryKey:['pedido','pedido-ficticio']})
 expect(sim.invalidate.mock.calls.filter(([q])=>q?.queryKey?.[0]==='pedidos')).toHaveLength(1)
})
test('tempo real: aba escondida não recarrega; recarrega ao voltar a aparecer',async()=>{
 limpar()
 let oculto=true;const ouvintes:Record<string,()=>void>={}
 vi.stubGlobal('document',{get hidden(){return oculto},addEventListener:(n:string,f:()=>void)=>{ouvintes[n]=f},removeEventListener:()=>{}})
 sim.inscricoes=[];limpar=sim.efeito!();await vi.advanceTimersByTimeAsync(0)
 const canal=sim.inscricoes.find(x=>x.filtro.event==='mudou')!
 canal.cb({payload:{t:'pedido_itens',p:['pedido-ficticio']}})
 await vi.advanceTimersByTimeAsync(2000)
 expect(sim.invalidate.mock.calls.every(([q]) => (q as {refetchType?: string})?.refetchType === "none")).toBe(true)
 oculto=false;ouvintes.visibilitychange()
 expect(sim.invalidate).toHaveBeenCalledWith({queryKey:['pedido']})
 vi.unstubAllGlobals()
})
test('tempo real: aviso de opção da troca recarrega só a troca',async()=>{
 const canal=sim.inscricoes.find(x=>x.filtro.event==='mudou')!
 canal.cb({payload:{t:'troca_opcoes',p:[]}})
 await vi.advanceTimersByTimeAsync(1300)
 expect(sim.invalidate).toHaveBeenCalledWith({queryKey:['troca']})
 expect(sim.invalidate.mock.calls.filter(([q])=>q?.queryKey?.[0]==='pedidos')).toHaveLength(0)
})

test('tempo real: aviso do time recarrega só a lista de pessoas, sem tocar nos pedidos',async()=>{
 const canal=sim.inscricoes.find(x=>x.filtro.event==='mudou')!
 canal.cb({payload:{t:'equipe',p:[]}})
 expect(sim.invalidate).toHaveBeenCalledWith({queryKey:['equipe']})
 await vi.advanceTimersByTimeAsync(3000)
 expect(sim.invalidate.mock.calls.filter(([q])=>q?.queryKey?.[0]!=='equipe')).toHaveLength(0)
})
