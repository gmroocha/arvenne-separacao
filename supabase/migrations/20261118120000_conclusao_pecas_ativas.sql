-- V15: resposta e conclusão seguem as mesmas peças ativas do resumo público.
-- As linhas que deixaram de faltar continuam guardadas, sem bloquear as demais.

create or replace function public.troca_escolher(p_token uuid, p_item uuid, p_tipo text, p_opcao uuid default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
begin
  if p_tipo is null or p_tipo not in ('opcao', 'credito', 'whatsapp') then
    raise exception 'Escolha inválida';
  end if;
  select * into v_t from trocas where token = p_token for update;
  if not found or v_t.status not in ('enviada', 'respondida') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select status into v_ped from pedidos where id = v_t.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select * into v_p from troca_pecas where troca_id = v_t.id and item_id = p_item for update;
  if not found or v_p.concluida_em is not null or not exists (
      select 1 from pedido_itens i where i.id=v_p.item_id and i.status in ('falta','defeito')) then
    raise exception 'Peça inválida';
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id and preco is not null) then
      raise exception 'Opção inválida';
    end if;
  else
    p_opcao := null;
  end if;
  -- "Quero esta" = carrinho só com essa opção (quantidade da linha); crédito/WhatsApp esvaziam o carrinho.
  perform public.troca_carrinho_definir(v_p.id, p_opcao);
  update troca_pecas
     set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now(), escolhida_por = null
   where id = v_p.id;
  -- Respondida quando todas as peças (ainda não feitas) têm escolha.
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null
                   and i.status in ('falta','defeito') and tp.escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_escolher(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_escolher(uuid, uuid, text, uuid) to anon, authenticated;

create or replace function public.troca_carrinho(p_token uuid, p_item uuid, p_opcao uuid, p_qtd int)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
  v_outras int;
  v_primeira uuid;
begin
  if p_qtd is null or p_qtd < 0 then raise exception 'Quantidade inválida'; end if;
  select * into v_t from trocas where token = p_token for update;
  if not found or v_t.status not in ('enviada', 'respondida') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select status into v_ped from pedidos where id = v_t.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select * into v_p from troca_pecas where troca_id = v_t.id and item_id = p_item for update;
  if not found or v_p.concluida_em is not null or not exists (
      select 1 from pedido_itens i where i.id=v_p.item_id and i.status in ('falta','defeito')) then
    raise exception 'Peça inválida';
  end if;
  if p_opcao is null or not exists (
      select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id and preco is not null) then
    raise exception 'Opção inválida';
  end if;
  select coalesce(sum(qtd), 0) into v_outras from troca_escolhas
   where troca_peca_id = v_p.id and opcao_id <> p_opcao;
  if v_outras + p_qtd > 20 then
    raise exception 'O limite é de 20 peças por troca. Tire alguma peça do carrinho antes de somar outra.';
  end if;

  perform set_config('arvenne.sem_recalculo', '1', true);
  if p_qtd = 0 then
    delete from troca_escolhas where troca_peca_id = v_p.id and opcao_id = p_opcao;
  else
    insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values (v_p.id, p_opcao, p_qtd)
      on conflict (troca_peca_id, opcao_id) do update set qtd = excluded.qtd;
  end if;
  perform set_config('arvenne.sem_recalculo', '', true);

  select e.opcao_id into v_primeira from troca_escolhas e
   where e.troca_peca_id = v_p.id order by e.seq limit 1;
  update troca_pecas
     set escolha_tipo = case when v_primeira is not null then 'opcao' end,
         escolha_opcao_id = v_primeira,
         respondida_em = case when v_primeira is not null then now() end,
         escolhida_por = null
   where id = v_p.id;
  -- Respondida quando todas as peças têm escolha; volta a enviada se a cliente esvaziou uma.
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null
                   and i.status in ('falta','defeito') and tp.escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  elsif v_t.status = 'respondida' then
    update trocas set status = 'enviada', respondida_em = null where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_carrinho(uuid, uuid, uuid, int) from public;
grant execute on function public.troca_carrinho(uuid, uuid, uuid, int) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.troca_concluir_peca(p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text, p_versao timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_i pedido_itens%rowtype;
  v_e record;
  v_carr record;
  v_valor record;
  v_dif numeric;
  v_ordem integer;
  v_observacao text;
  v_p_ped pedidos%rowtype;
  v_alvo numeric;
  v_sub numeric;
  v_pix numeric;
  v_ped_status text;
  v_sem_preco int;
begin
  if p_tipo is null or p_tipo not in ('opcao', 'credito') then
    raise exception 'Tipo de conclusão inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  select * into v_p from troca_pecas where id = p_peca and troca_id = v_t.id for update;
  if not found then raise exception 'Peça não pertence a esta troca'; end if;
  -- Uma resposta perdida pode ser repetida, mas nunca refaz uma troca cancelada.
  if v_t.status = 'cancelada' then raise exception 'Esta troca foi cancelada'; end if;
  if v_p.concluida_em is not null then return true; end if;
  if v_t.status not in ('rascunho', 'enviada', 'respondida') then
    raise exception 'Esta troca ainda não pode ser concluída';
  end if;
  select status into v_ped_status from pedidos where id = v_t.pedido_id;
  if v_ped_status in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais troca', case v_ped_status when 'enviado' then 'enviado' else 'cancelado' end;
  end if;
  -- Conferência otimista: com p_versao vale a data da resposta da cliente (qualquer mudança no carrinho
  -- a renova); sem ela, o tipo e a opção que a equipe viu.
  if p_versao is not null then
    if v_p.respondida_em is distinct from p_versao then
      raise exception 'A cliente mudou a escolha. Confira a resposta atual antes de confirmar.';
    end if;
  elsif v_p.escolha_tipo is distinct from p_escolha_tipo
     or v_p.escolha_opcao_id is distinct from p_opcao then
    raise exception 'A cliente mudou a escolha. Confira a resposta atual antes de confirmar.';
  end if;
  select * into v_i from pedido_itens where id = v_p.item_id and pedido_id = v_t.pedido_id for update;
  if not found or v_i.status not in ('falta', 'defeito') then
    raise exception 'Esta peça não está mais em falta';
  end if;

  if p_tipo = 'opcao' then
    if v_p.escolha_tipo is distinct from 'opcao' or not exists (
        select 1 from troca_escolhas where troca_peca_id = v_p.id) then
      raise exception 'A cliente ainda não escolheu uma opção para esta peça';
    end if;
    select count(*) into v_sem_preco from troca_escolhas e
      join troca_opcoes o on o.id = e.opcao_id where e.troca_peca_id = v_p.id and o.preco is null;
    if v_sem_preco > 0 then
      raise exception 'Esta opção está sem preço. Informe o preço da opção antes de concluir a troca.';
    end if;
    select * into v_carr from v_troca_carrinho where troca_peca_id = v_p.id;
    if not found or v_carr.diferenca is null then raise exception 'Não foi possível calcular a troca'; end if;
    v_dif := v_carr.diferenca;
  else
    select * into v_valor from v_troca_valores where troca_peca_id = v_p.id and tipo = 'credito';
    if not found or v_valor.diferenca is null then raise exception 'Não foi possível calcular a troca'; end if;
    v_dif := v_valor.diferenca;
  end if;

  -- Total anunciado = valor das peças (com desconto) antes da troca + diferença da troca.
  select * into v_p_ped from pedidos where id = v_t.pedido_id for update;
  -- A cobertura já aplicada (troca_coberto) volta à conta: o desconto em R$ guarda só o valor SEM cobertura
  -- e a view abate a cobertura nova por cima, então total final = total original + diferença líquida.
  select valor_pecas_com_desconto + troca_coberto + v_dif into v_alvo from v_pedidos where id = v_t.pedido_id;

  if p_tipo = 'opcao' then
    select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = v_t.pedido_id;
    v_observacao := null;
    -- Uma linha nova por peça do carrinho (na ordem em que a cliente montou).
    for v_e in
      select e.qtd, o.origem, o.shopify_variant_id, o.peca_clube_id, o.sku, o.nome, o.variante, o.foto_url, o.preco
        from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
       where e.troca_peca_id = v_p.id order by e.seq
    loop
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
        variante, foto_url, qtd, preco, ordem, observacao)
      values (v_t.pedido_id, case when v_e.origem = 'site' then 'shopify' else 'clube' end,
        v_e.shopify_variant_id, v_e.peca_clube_id, v_e.sku, v_e.nome, v_e.variante, v_e.foto_url,
        v_e.qtd, v_e.preco, v_ordem, 'troca de ' || coalesce(v_i.sku, v_i.nome));
      v_observacao := coalesce(v_observacao || ' + ', 'trocada por ')
                      || concat_ws(' · ', v_e.sku, v_e.variante, v_e.nome);
    end loop;
  else
    v_observacao := 'crédito R$ ' || replace(v_valor.valor_pago_item::numeric(10,2)::text, '.', ',');
  end if;
  update pedido_itens set status = 'removido', observacao = v_observacao where id = v_i.id;
  update troca_pecas set escolha_tipo = p_tipo,
    escolha_opcao_id = case when p_tipo = 'opcao' then v_p.escolha_opcao_id end,
    concluida_em = now(), resultado_diferenca = v_dif where id = v_p.id;
  -- Venda do WhatsApp com desconto em R$: reajusta o desconto para o total fechar com o anunciado.
  -- (Percentual já acompanha o subtotal; na Shopify o total soma a diferença na view.)
  if v_p_ped.origem = 'whatsapp' and v_p_ped.desconto_tipo = 'valor' and v_alvo is not null then
    select coalesce(sum(qtd * coalesce(preco, 0)), 0) into v_sub
      from pedido_itens where pedido_id = v_t.pedido_id and status <> 'removido';
    v_pix := case when v_p_ped.forma_pagamento = 'Pix' then round(v_sub * 0.10, 2) else 0 end;
    update pedidos set desconto_valor = round(greatest(0, v_sub - v_pix - v_alvo), 2)
      where id = v_t.pedido_id;
  end if;
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null and i.status in ('falta','defeito')) then
    -- Acerto: pendente se a troca deixou diferença (a cobrar ou crédito), senão sem diferença.
    update trocas set status = 'concluida', concluida_em = now(),
      acerto_status = case when abs(public.troca_saldo_liquido(v_t.id)) < 0.005
                           then 'sem_diferenca' else 'pendente' end
    where id = v_t.id;
  end if;
  if not exists (select 1 from pedido_itens where pedido_id = v_t.pedido_id and status in ('falta', 'defeito')) then
    update pedidos set status = 'separacao'
      where id = v_t.pedido_id and status in ('avisar_cliente', 'aguardando_cliente');
  end if;
  return true;
end $function$;
revoke all on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) from public, anon;
grant execute on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) to authenticated;
