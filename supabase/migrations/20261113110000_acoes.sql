-- Ações de vários passos numa transação só (auditoria 12, 13, 14, 25): reiniciar, trocas,
-- adicionar peças e bipar. Todas são "security invoker": valem as permissões e o RLS de quem chama
-- (a equipe logada). Nada é apagado.

-- ---------------------------------------------------------------------------
-- 1. Peças removidas na venda
-- ---------------------------------------------------------------------------
-- "Reiniciar do zero" restaura peças removidas, mas não as que a vendedora tirou durante a venda
-- (antes de o pedido entrar na expedição). Elas passam a ser marcadas; aqui marcamos as antigas:
-- pedidos do WhatsApp que nunca tiveram um status de expedição no histórico.
update public.pedido_itens i
   set observacao = 'removida na venda'
  from public.pedidos p
 where p.id = i.pedido_id
   and p.origem = 'whatsapp'
   and i.status = 'removido'
   and i.observacao is null
   and not exists (
     select 1 from public.pedido_eventos e
      where e.pedido_id = p.id and e.tipo = 'status'
        and e.para in ('novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia',
                       'etiquetagem', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviado'));

-- ---------------------------------------------------------------------------
-- 2. Reiniciar etapa ou pedido inteiro
-- ---------------------------------------------------------------------------
-- Mesmo comportamento de ZERO_POR_ETAPA / useReiniciar (src/lib/api.ts). Histórico de bipagens e
-- números digitados (nota, LR) ficam guardados. "Do zero": peças de troca saem, trocas ativas são
-- canceladas, as peças removidas voltam (menos as 'removida na venda') e o status volta a 'novo'.
create function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_etapas text[] := case when p_tudo
    then array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem',
               'bipagem', 'faturamento', 'embalagem', 'pronto_envio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_etiq  boolean := 'etiquetagem' = any(v_etapas);
  v_bip   boolean := 'bipagem' = any(v_etapas);
  v_fat   boolean := 'faturamento' = any(v_etapas);
  v_emb   boolean := 'embalagem' = any(v_etapas);
  v_post  boolean := 'pronto_envio' = any(v_etapas);
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if p_tudo then
    update pedido_itens set status = 'removido'
     where pedido_id = p_pedido and status <> 'removido' and observacao like 'troca de%';
    update pedido_itens
       set status = 'pendente', observacao = null, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where pedido_id = p_pedido and status = 'removido'
       and (observacao is null or (observacao not like 'troca de%' and observacao <> 'removida na venda'));
    update trocas set status = 'cancelada'
     where pedido_id = p_pedido and status in ('rascunho', 'enviada', 'respondida');
  end if;

  update pedido_itens set
      status          = case when v_pecas then 'pendente' else status end,
      conferido_em    = case when v_pecas or v_conf then null else conferido_em end,
      etiquetado_em   = case when v_pecas or v_etiq then null else etiquetado_em end,
      etiqueta_previa = case when v_pecas or v_etiq then false else etiqueta_previa end,
      qtd_bipada      = case when v_pecas or v_bip then 0 else qtd_bipada end,
      bipado_em       = case when v_pecas or v_bip then null else bipado_em end
   where pedido_id = p_pedido and status <> 'removido'
     and (v_pecas or v_conf or v_etiq or v_bip);

  update pedidos set
      nf_emitida_em        = case when v_fat then null else nf_emitida_em end,
      frete_gerado_em      = case when v_fat then null else frete_gerado_em end,
      pedido_fornecedor_em = case when v_fat then null else pedido_fornecedor_em end,
      embalado_em          = case when v_emb then null else embalado_em end,
      postado_em           = case when v_post then null else postado_em end,
      rastreio_enviado_em  = case when v_post then null else rastreio_enviado_em end,
      status               = case when p_tudo then 'novo' else status end
   where id = p_pedido and (v_fat or v_emb or v_post or p_tudo);

  insert into pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
  values (p_pedido, 'reiniciado', p_etapa, case when p_tudo then 'pedido inteiro' else 'etapa ' || p_etapa end,
          usuario_atual_email());
end $$;
revoke all on function public.reiniciar_pedido(uuid, text, boolean) from public;
grant execute on function public.reiniciar_pedido(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trocas: criar/acrescentar peças e enviar
-- ---------------------------------------------------------------------------
-- Garante a troca ativa do pedido e uma peça para cada item. Repetir não duplica. Peça nova numa
-- troca já respondida faz a troca voltar para 'enviada' (a cliente precisa responder de novo).
create function public.garantir_troca(p_pedido uuid, p_itens uuid[]) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_troca  uuid;
  v_status text;
  v_novas  int;
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select id, status into v_troca, v_status from trocas
   where pedido_id = p_pedido and status in ('rascunho', 'enviada', 'respondida')
   order by created_at desc limit 1;
  if v_troca is null then
    insert into trocas (pedido_id) values (p_pedido) returning id into v_troca;
  end if;
  if exists (select 1 from unnest(p_itens) x(id) left join pedido_itens i on i.id = x.id and i.pedido_id = p_pedido
              where i.id is null) then
    raise exception 'Peça não pertence a este pedido';
  end if;
  insert into troca_pecas (troca_id, item_id)
  select v_troca, x.id from (select distinct unnest(p_itens) as id) x
   where not exists (select 1 from troca_pecas tp where tp.troca_id = v_troca and tp.item_id = x.id);
  get diagnostics v_novas = row_count;
  if v_novas > 0 and v_status = 'respondida' then
    update trocas set status = 'enviada' where id = v_troca;
  end if;
  return v_troca;
end $$;
revoke all on function public.garantir_troca(uuid, uuid[]) from public;
grant execute on function public.garantir_troca(uuid, uuid[]) to authenticated;

-- Marca como enviada e leva o pedido de 'avisar_cliente' a 'aguardando_cliente'. Reenviar não muda nada.
create function public.enviar_troca(p_troca uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_pedido uuid;
begin
  select pedido_id into v_pedido from trocas where id = p_troca for update;
  if v_pedido is null then raise exception 'Troca não encontrada'; end if;
  update trocas set status = 'enviada', enviada_em = now() where id = p_troca and status = 'rascunho';
  update pedidos set status = 'aguardando_cliente' where id = v_pedido and status = 'avisar_cliente';
end $$;
revoke all on function public.enviar_troca(uuid) from public;
grant execute on function public.enviar_troca(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Adicionar peças ao pedido
-- ---------------------------------------------------------------------------
-- p_itens: [{origem, shopify_variant_id, peca_clube_id, sku, nome, variante, foto_url, qtd, preco}].
-- A ordem é calculada aqui. Com p_somar (venda), peça de mesma variante / mesma peça do Clube que já
-- está no pedido ganha quantidade em vez de uma linha nova.
create function public.adicionar_itens(p_pedido uuid, p_itens jsonb, p_somar boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
declare
  r      record;
  v_id   uuid;
  v_ordem int;
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
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
end $$;
revoke all on function public.adicionar_itens(uuid, jsonb, boolean) from public;
grant execute on function public.adicionar_itens(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bipar
-- ---------------------------------------------------------------------------
-- bipar(pedido, item, código): com item, soma 1 em qtd_bipada sem passar de qtd (o banco decide, então
-- duas leituras ao mesmo tempo contam as duas) e devolve 'ok'; se a peça já estava completa, não muda
-- nada e devolve 'excedente'. Com item nulo, registra 'fora_do_pedido'. Sempre grava em bipagens.
create function public.bipar(p_pedido uuid, p_item uuid, p_codigo text) returns text
language plpgsql security invoker set search_path = public as $$
declare
  v_qtd   int;
  v_bip   int;
  v_res   text;
begin
  if p_item is null then
    v_res := 'fora_do_pedido';
  else
    select qtd, qtd_bipada into v_qtd, v_bip from pedido_itens
     where id = p_item and pedido_id = p_pedido for update;
    if not found then raise exception 'Peça não pertence a este pedido'; end if;
    if v_bip >= v_qtd then
      v_res := 'excedente';
    else
      update pedido_itens set qtd_bipada = least(qtd, qtd_bipada + 1), bipado_em = now() where id = p_item;
      v_res := 'ok';
    end if;
  end if;
  insert into bipagens (pedido_id, item_id, codigo, resultado) values (p_pedido, p_item, p_codigo, v_res);
  return v_res;
end $$;
revoke all on function public.bipar(uuid, uuid, text) from public;
grant execute on function public.bipar(uuid, uuid, text) to authenticated;
