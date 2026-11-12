-- A regra também verifica os pré-requisitos da etapa atual ao reabrir trabalho.
create or replace function public.regras_etapas(p jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = public, pg_temp as $$
declare
  v_destino text;
  v_motivo text;
  v_resultado jsonb := '{}'::jsonb;
  v_status text := p->>'status';
  v_linhas int := coalesce((p->>'linhas')::int,0);
  v_pecas int := coalesce((p->>'pecas')::int,0);
begin
  foreach v_destino in array array['em_aberto','aguardando_pagamento','perdida','novo','separacao',
    'avisar_cliente','aguardando_cliente','conferencia','etiquetagem','bipagem','faturamento',
    'embalagem','pronto_envio','enviado','cancelado','somada'] loop
    v_motivo := null;
    if v_destino=v_status and not coalesce((p->>'inserindo')::boolean,false)
       and v_status not in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then
      null;
    elsif v_status='somada' and not coalesce((p->>'inserindo')::boolean,false) then
      v_motivo := 'A venda somada pertence ao histórico do pedido principal.';
    elsif v_status in ('cancelado','enviado') and v_destino<>'cancelado'
       and not coalesce((p->>'inserindo')::boolean,false) then
      v_motivo := 'Este pedido está arquivado e não pode mudar de etapa.';
    elsif v_destino in ('em_aberto','aguardando_pagamento','perdida')
       and v_status not in ('em_aberto','aguardando_pagamento','perdida') then
      v_motivo := 'Um pedido da expedição não pode voltar a ser uma venda em aberto.';
    elsif v_destino='somada' and (v_status not in ('em_aberto','aguardando_pagamento')
          or coalesce((p->>'inserindo')::boolean,false)) then
      v_motivo := 'Use a operação de somar uma venda aberta ao pedido principal.';
    elsif v_destino in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado') then
      if v_linhas=0 then
        v_motivo := 'Este pedido não tem peças para expedir.';
      elsif coalesce((p->>'encontradas')::int,0)<>v_linhas then
        v_motivo := 'Conclua a separação: há peça pendente, em falta ou com defeito.';
      elsif v_destino in ('etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado')
        and coalesce((p->>'conferidas')::int,0)<>v_linhas then
        v_motivo := 'Confira todas as peças antes desta etapa.';
      elsif v_destino in ('bipagem','faturamento','embalagem','pronto_envio','enviado')
        and coalesce((p->>'etiquetadas')::int,0)<>v_linhas then
        v_motivo := 'Etiquete todas as peças antes desta etapa.';
      elsif v_destino in ('faturamento','embalagem','pronto_envio','enviado')
        and coalesce((p->>'bipadas')::int,0)<>v_pecas then
        v_motivo := 'Bipe todas as unidades antes desta etapa.';
      elsif v_destino in ('embalagem','pronto_envio','enviado')
        and (p->>'nota' is null or p->>'frete' is null or p->>'fornecedor' is null) then
        v_motivo := 'Conclua a nota fiscal, o frete e o pedido do fornecedor.';
      elsif v_destino in ('embalagem','pronto_envio','enviado') and coalesce((p->>'acerto')::boolean,false) then
        v_motivo := 'Resolva os acertos e devoluções antes de liberar a embalagem.';
      elsif v_destino in ('pronto_envio','enviado') and p->>'embalado' is null then
        v_motivo := 'Confirme a embalagem antes da postagem.';
      elsif v_destino='enviado' and p->>'postado' is null then
        v_motivo := 'Confirme a postagem antes de marcar como enviado.';
      end if;
    end if;
    v_resultado := v_resultado || jsonb_build_object(v_destino,v_motivo);
  end loop;
  return v_resultado;
end $$;
revoke all on function public.regras_etapas(jsonb) from public, anon;
grant execute on function public.regras_etapas(jsonb) to authenticated, service_role;

-- V16: reabrir trabalho retorna à primeira etapa necessária, preservando o restante já feito.
create function public.reavaliar_etapa(p_pedido uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_destino text;
  v_regras jsonb;
  v_nivel int;
begin
  select status into v_status from public.pedidos where id=p_pedido for update;
  v_nivel := array_position(array['conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio'],v_status);
  if v_nivel is null then return; end if;
  select etapas_permitidas into v_regras from public.v_pedidos where id=p_pedido;
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'etiquetagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'bipagem' is not null then v_destino := 'etiquetagem';
  elsif v_nivel>=4 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=5 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=6 and v_regras->>'pronto_envio' is not null then v_destino := 'embalagem';
  end if;
  if v_destino is not null and v_destino<>v_status then
    update public.pedidos set status=v_destino where id=p_pedido;
  end if;
end $$;
revoke all on function public.reavaliar_etapa(uuid) from public, anon, authenticated, service_role;

-- Por instrução, não por linha: atualizar várias peças reavalia cada pedido só uma vez.
-- O bloqueio do pedido também serializa a edição com uma mudança de etapa concorrente.
create function public.tg_trabalho_reaberto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v record;
begin
  if tg_op='UPDATE' then
    if exists (
      select 1 from novos n join antigos a using(id)
      where n.pedido_id<>a.pedido_id and not exists (
        select 1 from public.pedidos s where s.id=a.pedido_id and s.status='somada'
          and s.somar_em=n.pedido_id and n.adicional and n.venda_origem_id=s.id)) then
      raise exception 'Peças só mudam de pedido pela operação de somar uma venda';
    end if;
    select array_agg(distinct n.pedido_id) into v_ids from novos n join antigos a using(id)
    where (n.pedido_id,n.status,n.qtd,n.conferido_em,n.etiquetado_em,n.qtd_bipada)
      is distinct from (a.pedido_id,a.status,a.qtd,a.conferido_em,a.etiquetado_em,a.qtd_bipada);
  else
    select array_agg(distinct pedido_id) into v_ids from novos;
  end if;
  if v_ids is null then return null; end if;
  for v in select id,status from public.pedidos where id=any(v_ids) order by id for update loop
    if v.status in ('enviado','cancelado','perdida','somada') then
      raise exception 'Este pedido está arquivado (%); não é possível reabrir ou acrescentar peças',v.status;
    end if;
    perform public.reavaliar_etapa(v.id);
  end loop;
  return null;
end $$;
revoke all on function public.tg_trabalho_reaberto() from public, anon, authenticated, service_role;
create trigger trabalho_inserido after insert on public.pedido_itens
  referencing new table as novos for each statement execute function public.tg_trabalho_reaberto();
create trigger trabalho_reaberto after update on public.pedido_itens
  referencing old table as antigos new table as novos for each statement execute function public.tg_trabalho_reaberto();

create function public.tg_documento_reaberto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (old.nf_emitida_em is not null and new.nf_emitida_em is null)
     or (old.frete_gerado_em is not null and new.frete_gerado_em is null)
     or (old.pedido_fornecedor_em is not null and new.pedido_fornecedor_em is null)
     or (old.embalado_em is not null and new.embalado_em is null)
     or (old.postado_em is not null and new.postado_em is null) then
    if new.status in ('enviado','cancelado','perdida','somada') then
      raise exception 'Este pedido está arquivado; não é possível reabrir documentos ou postagem';
    end if;
    perform public.reavaliar_etapa(new.id);
  end if;
  return null;
end $$;
revoke all on function public.tg_documento_reaberto() from public, anon, authenticated, service_role;
create trigger documento_reaberto after update of nf_emitida_em,frete_gerado_em,pedido_fornecedor_em,embalado_em,postado_em
  on public.pedidos for each row execute function public.tg_documento_reaberto();
