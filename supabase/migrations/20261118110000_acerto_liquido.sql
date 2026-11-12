-- V07: situação, validação e evento do acerto usam a mesma diferença líquida após cobertura.
create function public.troca_saldo_liquido(p_troca uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select (s.bruta - least(greatest(s.bruta,0),t.cobrir_ate))::numeric(10,2)
  from public.trocas t
  cross join lateral (
    select coalesce(sum(tp.resultado_diferenca),0) as bruta
    from public.troca_pecas tp where tp.troca_id=t.id and tp.concluida_em is not null
  ) s where t.id=p_troca;
$$;
revoke all on function public.troca_saldo_liquido(uuid) from public, anon;
grant execute on function public.troca_saldo_liquido(uuid) to authenticated, service_role;

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
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and concluida_em is null) then
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

CREATE OR REPLACE FUNCTION public.troca_acerto(p_troca uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_t trocas%rowtype;
  v_saldo numeric;
begin
  if p_status is null or p_status not in ('pendente', 'recebido', 'credito_registrado') then
    raise exception 'Status de acerto inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  if v_t.status <> 'concluida' or v_t.acerto_status is null or v_t.acerto_status = 'sem_diferenca' then
    raise exception 'Esta troca não tem acerto a registrar';
  end if;
  select public.troca_saldo_liquido(v_t.id) into v_saldo;
  if p_status = 'recebido' and v_saldo <= 0 then
    raise exception 'Não há diferença a receber nesta troca';
  end if;
  if p_status = 'credito_registrado' and v_saldo >= 0 then
    raise exception 'Não há crédito a registrar nesta troca';
  end if;
  update trocas set acerto_status = p_status,
    acerto_em = case when p_status = 'pendente' then null else now() end,
    acerto_por = case when p_status = 'pendente' then null else public.usuario_atual_email() end
  where id = v_t.id;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.tg_trocas_depois()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n integer;
  v_texto text;
  v_saldo numeric;
begin
  if new.status = 'enviada' and new.status is distinct from old.status then
    select count(*) into v_n from troca_pecas where troca_id = new.id;
    select string_agg(concat_ws(' · ', i.sku, i.nome, i.variante), '; ' order by i.ordem) into v_texto
      from troca_pecas p join pedido_itens i on i.id = p.item_id where p.troca_id = new.id;
    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_enviada', old.status, new.status,
            v_n || case when v_n = 1 then ' peça: ' else ' peças: ' end || coalesce(v_texto, ''),
            public.usuario_atual_email());
  end if;
  -- Acerto marcado ou desfeito pela equipe (a primeira definição, ao concluir, já tem o evento da troca).
  if old.acerto_status is not null and new.acerto_status is distinct from old.acerto_status then
    select public.troca_saldo_liquido(new.id) into v_saldo;
    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_acerto', old.acerto_status, new.acerto_status,
            case new.acerto_status
              when 'recebido' then 'Diferença recebida: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'credito_registrado' then 'Crédito registrado: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'pendente' then 'Acerto voltou para pendente'
              else new.acerto_status end,
            public.usuario_atual_email());
  end if;
  return null;
end $function$;

revoke all on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) from public, anon;
grant execute on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) to authenticated;
revoke all on function public.troca_acerto(uuid,text) from public, anon;
grant execute on function public.troca_acerto(uuid,text) to authenticated;
revoke all on function public.tg_trocas_depois() from public, anon, authenticated, service_role;
