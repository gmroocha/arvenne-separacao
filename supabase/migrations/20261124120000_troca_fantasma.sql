-- Troca fantasma e acerto na hora errada (V112–V113, 18/11/2026).
--
-- V112: ao concluir a última peça de uma troca com a janela aberta, a tela pedia garantir_troca com a lista velha de
-- peças em falta (a peça trocada já estava removida) e o banco abria uma troca nova, vazia, em rascunho. Essa troca
-- invisível travava o "Concluir etapa" ("Há uma troca em andamento"). Agora garantir_troca só põe na troca peça em
-- falta ou com defeito e não abre troca sem nenhuma; as fantasmas que já existem são canceladas.
--
-- V113: "Mover de etapa" recusava acerto ou devolução pendente já na Separação, Conferência e Bipagem, onde o cartão
-- do acerto não aparece (essas etapas não mostram dinheiro). O avanço automático só exige o acerto a partir da
-- Embalagem; mover à mão agora segue a mesma regra (e voltar etapa não exige acerto).

create or replace function public.garantir_troca(p_pedido uuid, p_itens uuid[]) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_troca   uuid;
  v_status  text;
  v_novas   int;
  v_validos uuid[];
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if exists (select 1 from unnest(p_itens) x(id) left join pedido_itens i on i.id = x.id and i.pedido_id = p_pedido
              where i.id is null) then
    raise exception 'Peça não pertence a este pedido';
  end if;
  -- Só peça em falta ou com defeito entra na troca (lista velha da tela traz peça já trocada ou removida).
  select coalesce(array_agg(distinct i.id), '{}') into v_validos
    from pedido_itens i where i.id = any(p_itens) and i.pedido_id = p_pedido and i.status in ('falta', 'defeito');
  select id, status into v_troca, v_status from trocas
   where pedido_id = p_pedido and status in ('rascunho', 'enviada', 'respondida')
   order by created_at desc limit 1;
  if v_troca is null then
    if cardinality(v_validos) = 0 then return null; end if;
    insert into trocas (pedido_id) values (p_pedido) returning id into v_troca;
  end if;
  insert into troca_pecas (troca_id, item_id)
  select v_troca, x.id from unnest(v_validos) x(id)
   where not exists (select 1 from troca_pecas tp where tp.troca_id = v_troca and tp.item_id = x.id);
  get diagnostics v_novas = row_count;
  if v_novas > 0 and v_status = 'respondida' then
    update trocas set status = 'enviada' where id = v_troca;
  end if;
  return v_troca;
end $$;
revoke all on function public.garantir_troca(uuid, uuid[]) from public, anon;
grant execute on function public.garantir_troca(uuid, uuid[]) to authenticated;

-- Trocas fantasmas: rascunho nunca enviado, sem nenhuma opção montada e sem peça em falta ou com defeito.
update public.trocas t set status = 'cancelada'
 where t.status = 'rascunho' and t.enviada_em is null
   and not exists (select 1 from public.troca_pecas tp join public.pedido_itens i on i.id = tp.item_id
                    where tp.troca_id = t.id and i.status in ('falta', 'defeito'))
   and not exists (select 1 from public.troca_pecas tp join public.troca_opcoes o on o.troca_peca_id = tp.id
                    where tp.troca_id = t.id);

create or replace function public.mover_etapa(p_pedido uuid, p_destino text) returns text
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  -- Pedido da Shopify não tem "Enviar rastreio": a ordem muda conforme a origem (definida depois de ler o pedido).
  v_ordem text[];
  v_nomes text[];
  p public.pedidos%rowtype;
  v_de int;
  v_para int;
  v_rast int; -- posição de "Concluído" quando há Enviar rastreio (marca a mensagem como enviada ao concluir à mão)
  v_quem text := public.usuario_atual_email();
begin
  select * into p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p.origem = 'shopify' then
    v_ordem := array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado'];
    v_nomes := array['Separação','Conferência','Bipagem','Nota fiscal','Embalagem','Frete','Postagem','Concluído'];
  else
    v_ordem := array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado'];
    v_nomes := array['Separação','Conferência','Bipagem','Nota fiscal','Embalagem','Frete','Postagem','Enviar rastreio','Concluído'];
  end if;
  v_para := array_position(v_ordem, p_destino);
  if v_para is null then
    raise exception '%', case when p_destino = 'enviar_rastreio' then 'Pedido da Shopify não tem a etapa Enviar rastreio: a Shopify avisa a cliente.' else 'Etapa inválida' end;
  end if;
  v_rast := case when p.origem = 'shopify' then null else array_position(v_ordem, 'enviado') end;
  if p.status in ('avisar_cliente','aguardando_cliente') then
    raise exception 'Há peça em falta ou com defeito. Resolva com a cliente antes de mover o pedido de etapa.';
  end if;
  v_de := array_position(v_ordem, case p.status when 'novo' then 'separacao' else p.status end);
  if v_de is null then raise exception 'Só dá para mover de etapa um pedido que está na esteira.'; end if;
  if p.status = 'enviado' then raise exception 'Este pedido já está concluído e não pode mudar de etapa.'; end if;
  if v_de = v_para then return p.status; end if;
  if exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('falta','defeito')) then
    raise exception 'Há peça em falta ou com defeito. Resolva com a cliente antes de mover o pedido de etapa.';
  end if;
  if exists (select 1 from public.trocas where pedido_id = p_pedido and status in ('rascunho','enviada','respondida')) then
    raise exception 'Há uma troca em andamento neste pedido. Conclua ou cancele a troca antes de mover de etapa.';
  end if;
  -- V113: como no avanço automático, o acerto só é exigido para ir à Embalagem ou adiante (o cartão do acerto aparece
  -- a partir da Nota fiscal). Voltar etapa não exige acerto.
  if v_para > v_de and v_para >= array_position(v_ordem, 'embalagem')
     and coalesce((public.acerto_operacional(p_pedido)->>'pendente')::boolean, false) then
    raise exception 'Há acerto ou devolução pendente neste pedido. Resolva no cartão do acerto (aparece a partir da Nota fiscal) antes da Embalagem.';
  end if;

  perform set_config('arvenne.lote', '1', true);
  if v_para > v_de then
    update public.pedido_itens set
        status = case when status = 'pendente' and v_para >= 2 then 'encontrado' else status end,
        conferido_em = case when status in ('pendente','encontrado') and v_para >= 3 then coalesce(conferido_em, now()) else conferido_em end,
        etiquetado_em = case when status in ('pendente','encontrado') and v_para >= 3 then coalesce(etiquetado_em, now()) else etiquetado_em end,
        qtd_bipada = case when status in ('pendente','encontrado') and v_para >= 4 then qtd else qtd_bipada end,
        bipado_em = case when status in ('pendente','encontrado') and v_para >= 4 then coalesce(bipado_em, now()) else bipado_em end
      where pedido_id = p_pedido and status in ('pendente','encontrado') and (
        (v_para >= 2 and status = 'pendente') or (v_para >= 3 and (conferido_em is null or etiquetado_em is null))
        or (v_para >= 4 and qtd_bipada < qtd));
    insert into public.pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (p_pedido, 'etapas_puladas', v_ordem[v_de], p_destino,
            'Marcado como feito ao mover: ' || array_to_string(v_nomes[v_de:v_para - 1], ', '), v_quem);
    update public.pedidos set
        nf_emitida_em = case when v_para >= 5 then coalesce(nf_emitida_em, now()) else nf_emitida_em end,
        pedido_fornecedor_em = case when v_para >= 5 then coalesce(pedido_fornecedor_em, now()) else pedido_fornecedor_em end,
        embalado_em = case when v_para >= 6 then coalesce(embalado_em, now()) else embalado_em end,
        frete_gerado_em = case when v_para >= 7 then coalesce(frete_gerado_em, now()) else frete_gerado_em end,
        postado_em = case when v_para >= 8 then coalesce(postado_em, now()) else postado_em end,
        rastreio_enviado_em = case when v_rast is not null and v_para >= v_rast then coalesce(rastreio_enviado_em, now()) else rastreio_enviado_em end,
        status = p_destino
      where id = p_pedido;
  else
    update public.pedido_itens set
        status = case when v_para <= 1 then 'pendente' else status end,
        conferido_em = case when v_para <= 2 then null else conferido_em end,
        etiquetado_em = case when v_para <= 2 then null else etiquetado_em end,
        etiqueta_previa = case when v_para <= 2 then false else etiqueta_previa end,
        qtd_bipada = case when v_para <= 3 then 0 else qtd_bipada end,
        bipado_em = case when v_para <= 3 then null else bipado_em end
      where pedido_id = p_pedido and status in ('pendente','encontrado');
    update public.pedidos set
        nf_emitida_em = case when v_para <= 4 then null else nf_emitida_em end,
        pedido_fornecedor_em = case when v_para <= 4 then null else pedido_fornecedor_em end,
        embalado_em = case when v_para <= 5 then null else embalado_em end,
        frete_gerado_em = case when v_para <= 6 then null else frete_gerado_em end,
        frete_peso_g = case when v_para <= 6 then null else frete_peso_g end,
        postado_em = case when v_para <= 7 then null else postado_em end,
        rastreio_enviado_em = case when v_para <= 8 then null else rastreio_enviado_em end,
        status = p_destino
      where id = p_pedido;
    insert into public.pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
    values (p_pedido, 'reiniciado', v_ordem[v_de], 'voltou para ' || v_nomes[v_para], v_quem);
  end if;
  perform set_config('arvenne.lote', '', true);
  return (select status from public.pedidos where id = p_pedido);
end $$;
revoke all on function public.mover_etapa(uuid, text) from public, anon;
grant execute on function public.mover_etapa(uuid, text) to authenticated, service_role;
