-- V06: o atalho da equipe passa pela mesma conclusão financeira da troca, em uma transação.
create function public.substituir_item(p_item uuid, p_itens jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_i public.pedido_itens%rowtype;
  v_p public.pedidos%rowtype;
  v_t uuid;
  v_tp uuid;
  v_opcao uuid;
  v_primeira uuid;
  v_n int := 0;
  r record;
begin
  if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then
    raise exception 'Escolha as peças que vão substituir a original';
  end if;
  -- A ordem dos bloqueios acompanha as demais ações: pedido, peça, troca.
  select p.* into v_p from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_p.status in ('em_aberto','aguardando_pagamento','somada','enviado','cancelado','perdida') then
    raise exception 'Este pedido não aceita troca nesta situação';
  end if;
  select * into v_i from public.pedido_itens where id=p_item for update;
  if v_i.status='removido' then
    select t.id into v_t from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
      where tp.item_id=p_item and tp.concluida_em is not null and t.status<>'cancelada'
      order by tp.concluida_em desc limit 1;
    if v_t is not null then return v_t; end if;
    raise exception 'Esta peça foi removida do pedido';
  end if;
  select id into v_t from public.trocas
    where pedido_id=v_p.id and status in ('rascunho','enviada','respondida') for update;
  if v_t is not null and exists (select 1 from public.troca_pecas where troca_id=v_t and item_id=p_item) then
    raise exception 'Esta peça já está numa troca. Confira e conclua no painel da troca.';
  end if;
  if v_t is null then
    insert into public.trocas(pedido_id) values (v_p.id) returning id into v_t;
  end if;
  update public.pedido_itens set status='falta' where id=p_item;
  insert into public.troca_pecas(troca_id,item_id) values (v_t,p_item) returning id into v_tp;
  for r in select * from jsonb_to_recordset(p_itens) as x(
    origem text, shopify_variant_id bigint, peca_clube_id uuid, sku text, nome text,
    variante text, foto_url text, qtd int, preco numeric)
  loop
    if r.qtd is null or r.qtd<1 or r.preco is null or r.preco<0
       or r.nome is null or btrim(r.nome)='' or r.origem is null or r.origem not in ('shopify','clube','avulso') then
      raise exception 'Informe origem, nome, quantidade e preço válidos das substitutas';
    end if;
    v_n := v_n+r.qtd;
    if v_n>20 then raise exception 'O limite é de 20 peças por troca'; end if;
    insert into public.troca_opcoes(troca_peca_id,origem,shopify_variant_id,peca_clube_id,sku,nome,variante,foto_url,preco)
    values (v_tp,case when r.origem='clube' then 'clube' else 'site' end,r.shopify_variant_id,r.peca_clube_id,
            r.sku,r.nome,r.variante,r.foto_url,r.preco) returning id into v_opcao;
    insert into public.troca_escolhas(troca_peca_id,opcao_id,qtd) values (v_tp,v_opcao,r.qtd);
    v_primeira := coalesce(v_primeira,v_opcao);
  end loop;
  update public.troca_pecas set escolha_tipo='opcao',escolha_opcao_id=v_primeira,
    escolhida_por='equipe',respondida_em=now() where id=v_tp;
  perform public.troca_concluir_peca(v_t,v_tp,'opcao',v_primeira,'opcao');
  update public.pedidos set status='separacao' where id=v_p.id
    and status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio');
  return v_t;
end $$;
revoke all on function public.substituir_item(uuid,jsonb) from public, anon;
grant execute on function public.substituir_item(uuid,jsonb) to authenticated;


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
      variante text, foto_url text, qtd int, preco numeric)
  loop
    v_id := null;
    if p_somar then
      select id into v_id from pedido_itens
       where pedido_id = p_pedido and status <> 'removido'
         and ((r.shopify_variant_id is not null and shopify_variant_id = r.shopify_variant_id)
           or (r.shopify_variant_id is null and r.peca_clube_id is not null and peca_clube_id = r.peca_clube_id))
       order by ordem limit 1;
    end if;
    if v_id is not null then
      update pedido_itens set qtd = qtd + r.qtd where id = v_id;
    else
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
                                foto_url, qtd, preco, ordem)
      values (p_pedido, r.origem, r.shopify_variant_id, r.peca_clube_id, r.sku, r.nome, r.variante,
              r.foto_url, r.qtd, r.preco, v_ordem);
    end if;
  end loop;
end $function$;
revoke all on function public.adicionar_itens(uuid,jsonb,boolean) from public, anon;
grant execute on function public.adicionar_itens(uuid,jsonb,boolean) to authenticated;
