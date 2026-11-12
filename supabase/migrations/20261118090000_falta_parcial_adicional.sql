-- V02: dividir uma adicional preserva sua parte financeira, sem criar valor no principal.
-- Nenhum dado antigo é reescrito. Migration ainda local: aplicação remota requer autorização.

create or replace function public.marcar_falta(p_item uuid, p_qtd int, p_status text default 'falta')
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
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
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;
  select status into v_ped from pedidos where id = v_i.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;

  if p_qtd >= v_i.qtd then
    -- Linha inteira: zera as etapas (conferência, etiqueta, bipagem).
    update pedido_itens
       set status = p_status, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where id = p_item;
    return p_item;
  end if;

  update pedido_itens
     set qtd = v_i.qtd - p_qtd, qtd_bipada = least(v_i.qtd_bipada, v_i.qtd - p_qtd)
   where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional, venda_origem_id)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem, null,
    'pendente', p_qtd, v_i.adicional, v_i.venda_origem_id)
  returning id into v_novo;
  update pedido_itens set status = p_status where id = v_novo;
  return v_novo;
end $$;
revoke all on function public.marcar_falta(uuid, int, text) from public, anon;
grant execute on function public.marcar_falta(uuid, int, text) to authenticated;
