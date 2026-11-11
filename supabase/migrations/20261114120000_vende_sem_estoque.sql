-- Variantes que a Shopify deixa vender sem estoque (inventoryPolicy = CONTINUE) e filtro nas sugestões de troca.
-- Sem GRANT automático neste projeto: a função é recriada, então o grant é refeito aqui.

alter table public.catalogo_site add column vende_sem_estoque boolean;
comment on column public.catalogo_site.vende_sem_estoque is
  'true = Shopify inventoryPolicy CONTINUE (vende sem estoque); false = DENY; null = ainda não sincronizado.';

drop function public.sugerir_troca(uuid, text, text, numeric, text, boolean);
create function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_faixa numeric default 0.2,
  p_busca text default null,
  p_incluir_pedido boolean default false,
  p_so_sem_estoque boolean default false)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text,
               preco_cliente numeric, diferenca numeric, situacao text, no_pedido boolean,
               vende_sem_estoque boolean)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_pago_unit_exato numeric;
  v_qtd integer;
  v_pedido uuid;
  v_fator numeric := 1;
  v_pago_unit numeric;
  v_pago_item numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.preco_pago, i.qtd, i.pedido_id
    into v_variant, v_preco, v_pago_unit_exato, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  v_fator := public.troca_fator(p_item);

  v_pago_unit := round(coalesce(v_pago_unit_exato, v_preco * v_fator), 2);
  v_pago_item := round(v_qtd * coalesce(v_pago_unit_exato, v_preco * v_fator), 2);

  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end,
             x.no_pedido, x.vende_sem_estoque
      from (
        select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido,
               c.vende_sem_estoque
        from catalogo_site c
        where v_produto_id is not null and c.produto_id = v_produto_id
          and c.variant_id is distinct from v_variant
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (not p_so_sem_estoque or c.vende_sem_estoque is true)
      ) x
      where p_incluir_pedido or not x.no_pedido
      order by x.variante
      limit 60;
  else
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end,
             x.no_pedido, x.vende_sem_estoque
      from (
        select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido,
               c.vende_sem_estoque
        from catalogo_site c
        where c.variant_id is distinct from v_variant
          and c.produto_id is distinct from v_produto_id
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (p_faixa is null
               or round(c.preco * v_fator, 2) between v_pago_unit * (1 - p_faixa) and v_pago_unit * (1 + p_faixa))
          and (p_categoria is null or upper(split_part(c.produto, ' ', 1)) = upper(p_categoria))
          and (v_busca is null or c.produto ilike '%' || v_busca || '%' or c.sku ilike '%' || v_busca || '%'
               or c.variante ilike '%' || v_busca || '%')
          and (not p_so_sem_estoque or c.vende_sem_estoque is true)
      ) x
      where p_incluir_pedido or not x.no_pedido
      order by abs(x.preco_cliente - v_pago_unit), x.produto, x.variante
      limit 40;
  end if;
end $$;

revoke all on function public.sugerir_troca(uuid, text, text, numeric, text, boolean, boolean) from public, anon;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text, boolean, boolean) to authenticated;
