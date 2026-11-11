-- Sugestões de troca com o preço que a CLIENTE paga (desconto do pedido, inclusive Pix).
-- fator = 1 - (desconto + desconto_pix) / subtotal, igual ao da v_troca_valores.
-- A base do "Preço parecido" é o valor pago por unidade, e a faixa é calculada aqui no banco.

drop function if exists public.sugerir_troca(uuid, text, text, numeric, numeric, text);

create or replace function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_faixa numeric default 0.2,
  p_busca text default null)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text,
               preco_cliente numeric, diferenca numeric, situacao text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_qtd integer;
  v_pedido uuid;
  v_fator numeric := 1;
  v_pago_unit numeric;
  v_pago_item numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.qtd, i.pedido_id
    into v_variant, v_preco, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  select case when coalesce(v.subtotal, 0) > 0
              then 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal
              else 1 end
    into v_fator
  from v_pedidos v where v.id = v_pedido;
  v_fator := coalesce(v_fator, 1);

  v_pago_unit := round(v_preco * v_fator, 2);
  v_pago_item := round(v_qtd * v_preco * v_fator, 2);

  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end
      from (
        select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca
        from catalogo_site c
        where v_produto_id is not null and c.produto_id = v_produto_id
          and c.variant_id is distinct from v_variant
          and (c.status is null or upper(c.status) = 'ACTIVE')
      ) x
      order by x.variante
      limit 60;
  else
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end
      from (
        select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca
        from catalogo_site c
        where c.variant_id is distinct from v_variant
          and c.produto_id is distinct from v_produto_id
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (p_faixa is null
               or round(c.preco * v_fator, 2) between v_pago_unit * (1 - p_faixa) and v_pago_unit * (1 + p_faixa))
          and (p_categoria is null or upper(split_part(c.produto, ' ', 1)) = upper(p_categoria))
          and (v_busca is null or c.produto ilike '%' || v_busca || '%' or c.sku ilike '%' || v_busca || '%'
               or c.variante ilike '%' || v_busca || '%')
      ) x
      order by abs(x.preco_cliente - v_pago_unit), x.produto, x.variante
      limit 40;
  end if;
end $$;

revoke all on function public.sugerir_troca(uuid, text, text, numeric, text) from public;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text) to authenticated;

-- Quanto a cliente pagou pela peça (total da linha e por unidade), para o cabeçalho da troca.
create or replace function public.troca_valor_pago(p_item uuid)
returns table (valor_pago numeric, valor_pago_unit numeric, qtd integer)
language sql stable security invoker set search_path = public as $$
  select round(i.qtd * coalesce(i.preco, 0) * f.fator, 2),
         round(coalesce(i.preco, 0) * f.fator, 2),
         i.qtd
  from pedido_itens i
  join lateral (
    select case when coalesce(v.subtotal, 0) > 0
                then 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal
                else 1 end as fator
    from v_pedidos v where v.id = i.pedido_id
  ) f on true
  where i.id = p_item;
$$;

revoke all on function public.troca_valor_pago(uuid) from public;
grant execute on function public.troca_valor_pago(uuid) to authenticated;
