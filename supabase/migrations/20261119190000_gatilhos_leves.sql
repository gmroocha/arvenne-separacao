-- Desempenho: marcar "Achei" em 31 peças seguidas estourou o tempo limite (statement timeout) no
-- Supabase em 12/11/2026. Cada atualização de peça recalculava a v_pedidos inteira do pedido duas vezes:
-- o saldo financeiro (tg_saldo_itens_alterado) e a etapa (reavaliar_etapa), mesmo quando nada de
-- dinheiro ou de etapa podia mudar. Mesmas regras, menos trabalho:
-- 1) saldo: só quando a peça entra ou sai de "removido", muda de pedido, de observação, de devolução,
--    de reembolso ou de valor; e só se o pedido tem troca concluída (sem troca não há acerto a ajustar);
-- 2) etapa: as contagens vêm direto das peças (como no gatilho de status); a v_pedidos só é lida quando
--    o pedido já está em "pronto para envio", única etapa em que o acerto pendente decide o retorno.

create or replace function public.reconciliar_acertos(p_pedido uuid,p_priorizar uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_saldo numeric; v_alvo uuid; v_aberto boolean;
begin
  -- Sem troca concluída não há acerto para ajustar: evita calcular o saldo à toa.
  if not exists (select 1 from public.trocas where pedido_id=p_pedido and status='concluida') then return; end if;
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

create or replace function public.tg_saldo_itens_alterado() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  -- Separar, conferir, etiquetar e bipar não mexem em dinheiro: só retirada/restauração e campos financeiros.
  for v_id in select distinct n.pedido_id from novos n join antigos a using(id)
    where n.pedido_id is distinct from a.pedido_id
       or ((n.status='removido') is distinct from (a.status='removido'))
       or (n.observacao,n.devolvido_em,n.reembolsado_shopify_em,n.valor_pago_linha)
          is distinct from (a.observacao,a.devolvido_em,a.reembolsado_shopify_em,a.valor_pago_linha)
    order by n.pedido_id loop
    perform public.reconciliar_acertos(v_id,(select acerto_troca_id from public.pedidos where id=v_id));
  end loop;
  return null;
end $$;
revoke all on function public.tg_saldo_itens_alterado() from public,anon,authenticated,service_role;

create or replace function public.reavaliar_etapa(p_pedido uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_destino text;
  v_regras jsonb;
  v_nivel int;
  v_acerto boolean := false;
begin
  select * into p from public.pedidos where id=p_pedido for update;
  v_nivel := array_position(array['conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio'],p.status);
  if v_nivel is null then return; end if;
  select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
    (count(*) filter (where status='encontrado'))::int as encontradas,
    (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
    (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
    coalesce(sum(qtd_bipada),0)::int as bipadas into c
  from public.pedido_itens where pedido_id=p_pedido and status<>'removido';
  -- O acerto pendente só decide se "pronto para envio" volta para a embalagem.
  if v_nivel>=6 then select acerto_pendente into v_acerto from public.v_pedidos where id=p_pedido; end if;
  v_regras := public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
    'conferidas',c.conferidas,'etiquetadas',c.etiquetadas,'bipadas',c.bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false)));
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'etiquetagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'bipagem' is not null then v_destino := 'etiquetagem';
  elsif v_nivel>=4 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=5 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=6 and v_regras->>'pronto_envio' is not null then v_destino := 'embalagem';
  end if;
  if v_destino is not null and v_destino<>p.status then
    update public.pedidos set status=v_destino where id=p_pedido;
  end if;
end $$;
revoke all on function public.reavaliar_etapa(uuid) from public, anon, authenticated, service_role;
