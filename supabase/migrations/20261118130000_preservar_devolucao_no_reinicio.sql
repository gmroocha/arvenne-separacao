-- V17: reinício e restauração não apagam a situação financeira de peças já devolvidas.
-- Datas e eventos ficam guardados; não altera dados existentes.

create or replace function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
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
    if exists (select 1 from public.pedido_itens where pedido_id=p_pedido
                and (devolvido_em is not null or reembolsado_shopify_em is not null)) then
      raise exception 'Este pedido já teve devolução de dinheiro. Não é possível reiniciar do zero; reinicie apenas a etapa necessária.';
    end if;
    if exists (select 1 from troca_pecas tp join trocas t on t.id = tp.troca_id
                where t.pedido_id = p_pedido and tp.concluida_em is not null) then
      raise exception 'Este pedido já teve uma troca concluída. Reiniciar do zero desfaria as peças, mas não o valor já acertado. Reinicie só a etapa que precisa.';
    end if;
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
revoke all on function public.reiniciar_pedido(uuid, text, boolean) from public, anon;
grant execute on function public.reiniciar_pedido(uuid, text, boolean) to authenticated;

create or replace function public.tg_itens_antes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if new.status = 'removido' and old.status is distinct from 'removido' then
    new.removido_em := now();
  elsif new.status <> 'removido' and old.status = 'removido' then
    if old.devolvido_em is not null or old.reembolsado_shopify_em is not null then
      raise exception 'Esta peça já teve devolução de dinheiro. Confira o acerto antes de restaurá-la.';
    end if;
    new.removido_em := null;
    new.devolvido_em := null;
    new.reembolsado_shopify_em := null;
  end if;
  return new;
end $$;
revoke all on function public.tg_itens_antes() from public, anon;
revoke all on function public.tg_itens_antes() from authenticated, service_role;
