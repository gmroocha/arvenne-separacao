-- Preço que a cliente pagou na troca, em pedidos da Shopify.
-- O desconto guardado no pedido (totalDiscounts) inclui o frete grátis e peças que já saíram do
-- pedido, então o fator 1 - desconto / subtotal saía errado (ex.: 0,73 em vez de 0,75).
-- Fator certo = subtotal pago segundo a Shopify (subtotalPriceSet, sem frete) / soma das linhas
-- da Shopify (quantidade atual x preço original), lido do pedido bruto guardado.

create function public.fator_pedido(p_pedido uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select least(1, greatest(0, x.sub / x.soma))
       from (select (p.shopify_bruto->'subtotalPriceSet'->'shopMoney'->>'amount')::numeric as sub,
                    (select sum((n->>'currentQuantity')::int * (n->'originalUnitPriceSet'->'shopMoney'->>'amount')::numeric)
                       from jsonb_array_elements(p.shopify_bruto->'lineItems'->'nodes') n) as soma
             from pedidos p
             where p.id = p_pedido and p.origem = 'shopify' and p.shopify_bruto is not null) x
      where x.sub is not null and x.soma > 0),
    (select case when v.subtotal > 0
        then greatest(0, 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
        else 1 end
       from v_pedidos v where v.id = p_pedido),
    1);
$$;
revoke all on function public.fator_pedido(uuid) from public;
grant execute on function public.fator_pedido(uuid) to authenticated;

create or replace function public.tg_trocas_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fator_desconto := public.fator_pedido(new.pedido_id);
  else
    new.fator_desconto := old.fator_desconto;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.troca_fator(p_item uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select t.fator_desconto from trocas t join troca_pecas p on p.troca_id = t.id
      where p.item_id = p_item and t.status in ('rascunho', 'enviada', 'respondida')
      limit 1),
    (select public.fator_pedido(i.pedido_id) from pedido_itens i where i.id = p_item), 1);
$$;

-- Trocas em andamento (nenhuma peça concluída) ganham o fator certo.
alter table public.trocas disable trigger trocas_antes;
update public.trocas t
set fator_desconto = public.fator_pedido(t.pedido_id)
where t.status in ('rascunho', 'enviada', 'respondida')
  and not exists (select 1 from public.troca_pecas p where p.troca_id = t.id and p.concluida_em is not null);
alter table public.trocas enable trigger trocas_antes;
