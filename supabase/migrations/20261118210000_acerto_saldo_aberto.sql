-- Saldo aberto nunca fica sem acerto pendente.
-- Antes: pedido com diferença de R$ 1 a receber (troca A pendente) e nova troca B sem diferença.
-- Ao concluir B, A virava "sem_diferenca" (incorporada ao último acerto), mas B também estava
-- "sem_diferenca": o R$ 1 sumia da tela e ninguém cobrava. Agora o acerto escolhido como alvo
-- volta a ficar pendente sempre que o saldo do pedido não é zero. Acerto já recebido ou com
-- crédito registrado não é reaberto (isso estornaria um movimento); prefere-se outro alvo.

create or replace function public.reconciliar_acertos(p_pedido uuid,p_priorizar uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_saldo numeric; v_alvo uuid; v_aberto boolean;
begin
  perform 1 from public.pedidos where id=p_pedido for update;
  select public.saldo_financeiro(p_pedido) into v_saldo;
  if v_saldo is null then return; end if;
  v_aberto := abs(v_saldo)>=0.005;
  select id into v_alvo from public.trocas where pedido_id=p_pedido and status='concluida'
    order by (v_aberto and acerto_status in ('recebido','credito_registrado')) asc,
      (id=p_priorizar) desc nulls last,(acerto_status='pendente') desc,
      concluida_em desc nulls last,created_at desc,id limit 1;
  if v_alvo is null then return; end if;
  update public.pedidos set acerto_troca_id=v_alvo where id=p_pedido and acerto_troca_id is distinct from v_alvo;
  -- Os anteriores permanecem no histórico; o último acerto incorpora o saldo ainda aberto.
  update public.trocas set acerto_status='sem_diferenca'
    where pedido_id=p_pedido and status='concluida' and acerto_status='pendente'
      and (id<>v_alvo or not v_aberto);
  if v_aberto then
    update public.trocas set acerto_status='pendente',acerto_em=null,acerto_por=null
      where id=v_alvo and acerto_status='sem_diferenca';
  end if;
end $$;
revoke all on function public.reconciliar_acertos(uuid,uuid) from public,anon,authenticated,service_role;
