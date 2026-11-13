-- V57: peça e efeito na etapa são uma única ação, mesmo quando a resposta de rede se perde.
create function public.alterar_item(p_item uuid, p_campos jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_p public.pedidos%rowtype;
  v_problemas boolean;
begin
  if jsonb_typeof(p_campos) is distinct from 'object' then
    raise exception 'Informe os campos da peça';
  end if;
  if exists (select 1 from jsonb_object_keys(p_campos) k where k not in
    ('status','observacao','conferido_em','etiquetado_em','etiqueta_previa','qtd_bipada','bipado_em','qtd','preco')) then
    raise exception 'Este campo não pode ser alterado por esta ação';
  end if;
  select p.* into v_p from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  if not found then raise exception 'Peça não encontrada'; end if;
  update public.pedido_itens set
    status=case when p_campos?'status' then p_campos->>'status' else status end,
    observacao=case when p_campos?'observacao' then p_campos->>'observacao' else observacao end,
    conferido_em=case when p_campos?'conferido_em' then (p_campos->>'conferido_em')::timestamptz else conferido_em end,
    etiquetado_em=case when p_campos?'etiquetado_em' then (p_campos->>'etiquetado_em')::timestamptz else etiquetado_em end,
    etiqueta_previa=case when p_campos?'etiqueta_previa' then (p_campos->>'etiqueta_previa')::boolean else etiqueta_previa end,
    qtd_bipada=case when p_campos?'qtd_bipada' then (p_campos->>'qtd_bipada')::int else qtd_bipada end,
    bipado_em=case when p_campos?'bipado_em' then (p_campos->>'bipado_em')::timestamptz else bipado_em end,
    qtd=case when p_campos?'qtd' then (p_campos->>'qtd')::int else qtd end,
    preco=case when p_campos?'preco' then (p_campos->>'preco')::numeric else preco end
    where id=p_item;
  if p_campos?'status' then
    select exists(select 1 from public.pedido_itens where pedido_id=v_p.id and status in ('falta','defeito')) into v_problemas;
    if v_problemas and v_p.status in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_p.id and status not in ('avisar_cliente','aguardando_cliente');
    elsif not v_problemas and v_p.status in ('avisar_cliente','aguardando_cliente') then
      perform public.sair_do_desvio(v_p.id);
    elsif v_p.status='novo' and p_campos->>'status'='encontrado' then
      update public.pedidos set status='separacao' where id=v_p.id and status='novo';
    end if;
  end if;
end;
$$;
revoke all on function public.alterar_item(uuid,jsonb) from public, anon;
grant execute on function public.alterar_item(uuid,jsonb) to authenticated, service_role;

-- A falta parcial também termina com o desvio gravado, conservando a etapa anterior à divisão.
CREATE OR REPLACE FUNCTION public.marcar_falta(p_item uuid, p_qtd integer, p_status text DEFAULT 'falta'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_i pedido_itens%rowtype;
  v_ped text;
  v_novo uuid;
begin
  if p_status is null or p_status not in ('falta', 'defeito') then
    raise exception 'Status inválido para peça com problema';
  end if;
  if p_qtd is null or p_qtd < 1 then
    raise exception 'Informe quantas peças faltam';
  end if;
  -- Bloqueia o pedido antes da peça, na mesma ordem da ação geral e da venda somada.
  select p.status into v_ped from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;

  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;

  if p_qtd >= v_i.qtd then
    -- Linha inteira: zera as etapas (conferência, etiqueta, bipagem).
    update pedido_itens
       set status = p_status, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where id = p_item;
    if v_ped in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
    end if;
    return p_item;
  end if;

  update pedido_itens
     set qtd = v_i.qtd - p_qtd, qtd_bipada = least(v_i.qtd_bipada, v_i.qtd - p_qtd),
         valor_pago_linha = case when v_i.valor_pago_linha is not null then v_i.valor_pago_linha-round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end
   where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional, venda_origem_id, troca_peca_origem_id, valor_pago_linha)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem, null,
    'pendente', p_qtd, v_i.adicional, v_i.venda_origem_id, v_i.troca_peca_origem_id,
    case when v_i.valor_pago_linha is not null then round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end)
  returning id into v_novo;
  update pedido_itens set status = p_status where id = v_novo;
  if v_ped in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then
    update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
    update public.pedidos set etapa_antes_desvio=case when v_ped='novo' then 'separacao' else v_ped end
      where id=v_i.pedido_id;
  end if;
  return v_novo;
end $function$;

revoke all on function public.marcar_falta(uuid,integer,text) from public, anon;
grant execute on function public.marcar_falta(uuid,integer,text) to authenticated, service_role;
