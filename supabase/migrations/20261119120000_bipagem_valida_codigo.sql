-- V20: a função de bipagem aceitava código diferente do SKU da peça e contava peça retirada.
-- A tela já casava o código pelo SKU; agora o banco confere também (mesma normalização da tela:
-- maiúsculas, sem espaços). Leitura "fora do pedido" continua sendo registrada sem peça.

create or replace function public.bipar(p_pedido uuid, p_item uuid, p_codigo text) returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_i   public.pedido_itens%rowtype;
  v_res text;
begin
  if p_item is null then
    v_res := 'fora_do_pedido';
  else
    select * into v_i from public.pedido_itens where id = p_item and pedido_id = p_pedido for update;
    if not found then raise exception 'Peça não pertence a este pedido'; end if;
    if v_i.status <> 'encontrado' then raise exception 'Esta peça não está separada; não pode ser bipada'; end if;
    if upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'))
       is distinct from upper(regexp_replace(coalesce(v_i.sku, ''), '\s', '', 'g'))
       or coalesce(v_i.sku, '') = '' then
      raise exception 'O código lido não é o SKU desta peça';
    end if;
    if v_i.qtd_bipada >= v_i.qtd then
      v_res := 'excedente';
    else
      update public.pedido_itens set qtd_bipada = least(qtd, qtd_bipada + 1), bipado_em = now() where id = p_item;
      v_res := 'ok';
    end if;
  end if;
  insert into public.bipagens (pedido_id, item_id, codigo, resultado) values (p_pedido, p_item, p_codigo, v_res);
  return v_res;
end $$;
revoke all on function public.bipar(uuid, uuid, text) from public, anon;
grant execute on function public.bipar(uuid, uuid, text) to authenticated;

-- "Contar 1 / Tirar 1" também só vale para peça separada (tirar até zero continua permitido).
create or replace function public.bipar_ajustar(p_item uuid, p_delta int) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_novo int;
  v_status text;
begin
  if p_delta is null then raise exception 'Ajuste inválido'; end if;
  select status into v_status from public.pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_status <> 'encontrado' and p_delta > 0 then
    raise exception 'Esta peça não está separada; não pode ser bipada';
  end if;
  update public.pedido_itens
     set qtd_bipada = least(qtd, greatest(0, qtd_bipada + p_delta)),
         bipado_em = case when least(qtd, greatest(0, qtd_bipada + p_delta)) > 0 then now() else null end
   where id = p_item
  returning qtd_bipada into v_novo;
  return v_novo;
end $$;
revoke all on function public.bipar_ajustar(uuid, int) from public, anon;
grant execute on function public.bipar_ajustar(uuid, int) to authenticated;
