-- Venda: separa as peças que vieram do carrinho colado das adicionadas à mão.
-- pedido_itens.entrada: 'carrinho' (link do carrinho da cliente), 'manual' (botão "Adicionar peça") ou
-- nulo (importadas da Shopify, peças de troca e linhas anteriores a esta migration).
-- Com "somar", a peça só soma numa linha da mesma entrada: a mesma peça colada do carrinho e depois
-- adicionada à mão fica em duas linhas, cada uma no seu grupo. Valores não mudam (mesmo preço por linha).

alter table public.pedido_itens
  add column entrada text check (entrada in ('carrinho', 'manual'));

CREATE OR REPLACE FUNCTION public.adicionar_itens(p_pedido uuid, p_itens jsonb, p_somar boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r      record;
  v_id   uuid;
  v_ordem int;
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if exists (select 1 from public.pedidos where id=p_pedido
              and status not in ('em_aberto','aguardando_pagamento')) then
    raise exception 'Pedido já pago: acrescente por uma venda somada ou use a troca';
  end if;
  select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = p_pedido;
  for r in
    select * from jsonb_to_recordset(p_itens) as x(
      origem text, shopify_variant_id bigint, peca_clube_id uuid, sku text, nome text,
      variante text, foto_url text, qtd int, preco numeric, entrada text)
  loop
    v_id := null;
    if p_somar then
      select id into v_id from pedido_itens
       where pedido_id = p_pedido and status <> 'removido'
         and entrada is not distinct from r.entrada
         and ((r.shopify_variant_id is not null and shopify_variant_id = r.shopify_variant_id)
           or (r.shopify_variant_id is null and r.peca_clube_id is not null and peca_clube_id = r.peca_clube_id))
       order by ordem limit 1;
    end if;
    if v_id is not null then
      update pedido_itens set qtd = qtd + r.qtd where id = v_id;
    else
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
                                foto_url, qtd, preco, ordem, entrada)
      values (p_pedido, r.origem, r.shopify_variant_id, r.peca_clube_id, r.sku, r.nome, r.variante,
              r.foto_url, r.qtd, r.preco, v_ordem, r.entrada);
    end if;
  end loop;
end $function$;
-- Permissões explícitas (este projeto não dá GRANT automático). A coluna nova entra no GRANT de tabela
-- que "authenticated" já tem em pedido_itens (select, insert, update; sem delete).
revoke all on function public.adicionar_itens(uuid,jsonb,boolean) from public, anon;
grant execute on function public.adicionar_itens(uuid,jsonb,boolean) to authenticated;
