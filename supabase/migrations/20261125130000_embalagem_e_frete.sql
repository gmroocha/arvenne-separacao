-- Embalagem e Frete viram uma etapa só: "Embalagem e frete" (status embalagem). Pedido do Gustavo, 19/11/2026.
-- O pedido só vai da Embalagem e frete para a Postagem quando embalado_em E frete_gerado_em estão preenchidos, em qualquer
-- ordem. O valor 'frete' continua aceito no CHECK de status (e nos eventos antigos), mas nenhum pedido novo entra nele.
-- Cada função abaixo é recriada a partir da última versão (rodada3; troca_fantasma para mover_etapa).
-- Nenhum e-mail aqui dentro.

-- 1. regras_etapas: a Embalagem não exige mais "embalado"; a Postagem exige embalagem e frete; 'frete' deixa de ser destino.
create or replace function public.regras_etapas(p jsonb) returns jsonb
language plpgsql immutable set search_path to 'public','pg_temp' as $$
declare
  v_destino text;
  v_motivo text;
  v_resultado jsonb := '{}'::jsonb;
  v_status text := p->>'status';
  v_linhas int := coalesce((p->>'linhas')::int,0);
  v_pecas int := coalesce((p->>'pecas')::int,0);
  -- Sem a chave "origem" vale como Shopify (a regra de antes). "rastreio" = rastreio_enviado_em.
  v_shopify boolean := coalesce(p->>'origem','shopify') = 'shopify';
begin
  foreach v_destino in array array['em_aberto','aguardando_pagamento','perdida','novo','separacao',
    'avisar_cliente','aguardando_cliente','conferencia','bipagem','faturamento',
    'embalagem','pronto_envio','enviar_rastreio','enviado','cancelado','somada'] loop
    v_motivo := null;
    if v_destino=v_status and not coalesce((p->>'inserindo')::boolean,false)
       and v_status not in ('conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio') then
      null;
    elsif v_status='somada' and not coalesce((p->>'inserindo')::boolean,false) then
      v_motivo := 'A venda somada pertence ao histórico do pedido principal.';
    elsif v_status in ('cancelado','enviado') and v_destino<>'cancelado'
       and not coalesce((p->>'inserindo')::boolean,false) then
      v_motivo := 'Este pedido está arquivado e não pode mudar de etapa.';
    elsif v_destino in ('em_aberto','aguardando_pagamento','perdida')
       and v_status not in ('em_aberto','aguardando_pagamento','perdida') then
      v_motivo := 'Um pedido da expedição não pode voltar a ser uma venda em aberto.';
    elsif v_destino='somada' and (v_status not in ('em_aberto','aguardando_pagamento')
          or coalesce((p->>'inserindo')::boolean,false)) then
      v_motivo := 'Use a operação de somar uma venda aberta ao pedido principal.';
    elsif v_destino in ('conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio','enviado') then
      if v_linhas=0 then
        v_motivo := 'Este pedido não tem peças para expedir.';
      elsif coalesce((p->>'encontradas')::int,0)<>v_linhas then
        v_motivo := 'Conclua a separação: há peça pendente, em falta ou com defeito.';
      elsif v_destino in ('bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio','enviado')
        and coalesce((p->>'conferidas')::int,0)<>v_linhas then
        v_motivo := 'Confira todas as peças antes desta etapa.';
      elsif v_destino in ('faturamento','embalagem','pronto_envio','enviar_rastreio','enviado')
        and coalesce((p->>'bipadas')::int,0)<>v_pecas then
        v_motivo := 'Bipe todas as unidades antes desta etapa.';
      elsif v_destino in ('embalagem','pronto_envio','enviar_rastreio','enviado')
        and (p->>'nota' is null or p->>'fornecedor' is null) then
        v_motivo := 'Conclua a nota fiscal e o pedido do fornecedor.';
      elsif v_destino in ('embalagem','pronto_envio','enviar_rastreio','enviado') and coalesce((p->>'acerto')::boolean,false) then
        v_motivo := 'Resolva os acertos e devoluções antes de liberar a embalagem.';
      elsif v_destino in ('pronto_envio','enviar_rastreio','enviado') and p->>'embalado' is null then
        v_motivo := 'Confirme a embalagem antes da postagem.';
      elsif v_destino in ('pronto_envio','enviar_rastreio','enviado') and p->>'frete' is null then
        v_motivo := 'Gere o frete antes da postagem.';
      elsif v_destino in ('enviar_rastreio','enviado') and p->>'postado' is null then
        v_motivo := case when v_destino='enviado' then 'Confirme a postagem antes de marcar como concluído.'
                         else 'Confirme a postagem antes de enviar o rastreio.' end;
      elsif v_destino='enviar_rastreio' and v_shopify then
        v_motivo := 'Pedido da Shopify não tem esta etapa: a Shopify avisa a cliente.';
      elsif v_destino='enviado' and not v_shopify and p->>'rastreio' is null then
        v_motivo := 'Envie o rastreio à cliente antes de marcar como concluído.';
      end if;
    end if;
    v_resultado := v_resultado || jsonb_build_object(v_destino,v_motivo);
  end loop;
  return v_resultado;
end $$;

-- 2. reavaliar_etapa: sem o nível 'frete'.
create or replace function public.reavaliar_etapa(p_pedido uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_destino text;
  v_regras jsonb;
  v_nivel int;
  v_acerto boolean := false;
begin
  select * into p from public.pedidos where id=p_pedido for update;
  v_nivel := array_position(array['conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio'],p.status);
  if v_nivel is null then return; end if;
  select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
    (count(*) filter (where status='encontrado'))::int as encontradas,
    (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
    coalesce(sum(qtd_bipada),0)::int as bipadas into c
  from public.pedido_itens where pedido_id=p_pedido and status<>'removido';
  -- O acerto pendente só decide se "pronto para envio" (Postagem) volta para trás.
  if v_nivel>=5 then select acerto_pendente into v_acerto from public.v_pedidos where id=p_pedido; end if;
  v_regras := public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
    'conferidas',c.conferidas,'bipadas',c.bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false),
    'origem',p.origem,'rastreio',p.rastreio_enviado_em));
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'bipagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=4 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=5 and v_regras->>'pronto_envio' is not null then v_destino := 'embalagem';
  elsif v_nivel>=6 and v_regras->>'enviar_rastreio' is not null then v_destino := 'pronto_envio';
  end if;
  if v_destino is not null and v_destino<>p.status then
    update public.pedidos set status=v_destino where id=p_pedido;
  end if;
end $$;

-- 3. reiniciar_pedido: reiniciar a Embalagem e frete limpa embalagem e frete.
create or replace function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean) returns void
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_etapas text[] := case when p_tudo
    then array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia',
               'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_bip   boolean := 'bipagem' = any(v_etapas);
  v_fat   boolean := 'faturamento' = any(v_etapas);
  v_emb   boolean := 'embalagem' = any(v_etapas);
  v_frete boolean := 'embalagem' = any(v_etapas) or 'frete' = any(v_etapas); -- a etapa é uma só: embalagem e frete
  v_post  boolean := 'pronto_envio' = any(v_etapas);
  v_rast  boolean := 'enviar_rastreio' = any(v_etapas);
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
      etiquetado_em   = case when v_pecas or v_conf then null else etiquetado_em end,
      etiqueta_previa = case when v_pecas or v_conf then false else etiqueta_previa end,
      qtd_bipada      = case when v_pecas or v_bip then 0 else qtd_bipada end,
      bipado_em       = case when v_pecas or v_bip then null else bipado_em end
   where pedido_id = p_pedido and status <> 'removido'
     and (v_pecas or v_conf or v_bip);
  update pedidos set
      nf_emitida_em        = case when v_fat then null else nf_emitida_em end,
      frete_gerado_em      = case when v_frete then null else frete_gerado_em end,
      frete_peso_g         = case when v_frete then null else frete_peso_g end,
      pedido_fornecedor_em = case when v_fat then null else pedido_fornecedor_em end,
      embalado_em          = case when v_emb then null else embalado_em end,
      postado_em           = case when v_post then null else postado_em end,
      rastreio_enviado_em  = case when v_post or v_rast then null else rastreio_enviado_em end,
      status               = case when p_tudo then 'novo' else status end
   where id = p_pedido and (v_fat or v_emb or v_frete or v_post or v_rast or p_tudo);

  insert into pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
  values (p_pedido, 'reiniciado', p_etapa, case when p_tudo then 'pedido inteiro' else 'etapa ' || p_etapa end,
          usuario_atual_email());
end $$;

-- 4. tg_pedidos_antes: embalagem → pronto_envio só com embalado_em E frete_gerado_em.
create or replace function public.tg_pedidos_antes() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v record;
  v_acerto boolean;
  v_regras jsonb;
  v_motivo text;
  v_faltas text[];
  v_prox text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then
    v_prox := case old.status
      when 'faturamento' then case when new.nf_emitida_em is not null and new.pedido_fornecedor_em is not null
        and (old.nf_emitida_em is null or old.pedido_fornecedor_em is null) then 'embalagem' end
      when 'embalagem' then case when new.embalado_em is not null and new.frete_gerado_em is not null
        and (old.embalado_em is null or old.frete_gerado_em is null) then 'pronto_envio' end
      when 'pronto_envio' then case when new.postado_em is not null and old.postado_em is null
        then case when new.origem='shopify' then 'enviado' else 'enviar_rastreio' end end
      when 'enviar_rastreio' then case when new.rastreio_enviado_em is not null and old.rastreio_enviado_em is null then 'enviado' end
    end;
  end if;
  if tg_op='INSERT' or new.status is distinct from old.status or v_prox is not null then
    if new.status='somada' and (new.somar_em is null or new.somada_em is null
        or new.somada_valor is null or new.somada_retrato is null) then
      raise exception 'Use a operação de somar a venda: faltam o vínculo e o retrato da compra';
    end if;
    select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into v
    from public.pedido_itens where pedido_id=new.id and status<>'removido';
    if coalesce(v_prox,new.status) in ('embalagem','pronto_envio','enviar_rastreio','enviado') then
      select acerto_pendente into v_acerto from public.v_pedidos where id=new.id;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',case when tg_op='INSERT' then new.status else old.status end,'inserindo',tg_op='INSERT',
      'linhas',v.linhas,'pecas',v.pecas,'encontradas',v.encontradas,'conferidas',v.conferidas,
      'bipadas',v.bipadas,'nota',new.nf_emitida_em,
      'frete',new.frete_gerado_em,'fornecedor',new.pedido_fornecedor_em,'embalado',new.embalado_em,
      'postado',new.postado_em,'acerto',coalesce(v_acerto,false),
      'origem',new.origem,'rastreio',new.rastreio_enviado_em));
    if v_prox is not null then
      -- Avanço automático: só se a próxima etapa estiver liberada; senão o pedido espera onde está.
      if v_regras->>v_prox is null then new.status := v_prox; end if;
    else
      v_motivo := coalesce(v_regras->>new.status,case when not v_regras ? new.status then 'Etapa inválida' end);
      if v_motivo is not null then raise exception '%',v_motivo; end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.numero is null or new.numero = '' then
      new.numero := 'W' || lpad(nextval('public.pedido_whatsapp_seq')::text, 4, '0');
    end if;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_desde := now();
      if old.status in ('em_aberto', 'aguardando_pagamento')
         and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
        if not exists (select 1 from public.pedido_itens where pedido_id = new.id and status <> 'removido') then
          raise exception 'A venda não tem nenhuma peça. Adicione as peças antes de marcar como paga.';
        end if;
        if exists (select 1 from public.pedido_itens
                   where pedido_id = new.id and status <> 'removido' and preco is null) then
          raise exception 'Há peça sem preço. Informe o preço de todas as peças antes de marcar como paga.';
        end if;
        -- Venda do WhatsApp só vira pedido pago com os dados completos (nome, telefone, documento, frete e
        -- endereço). Pedido da Shopify e venda somada (somar_venda) ficam fora: a somada usa os dados do principal.
        if new.origem = 'whatsapp' and new.status <> 'somada' then
          v_faltas := public.faltas_para_pagar(jsonb_build_object(
            'cliente_nome', new.cliente_nome, 'cliente_telefone', new.cliente_telefone, 'cliente_cpf', new.cliente_cpf,
            'frete_tipo', new.frete_tipo, 'frete_pago_por', new.frete_pago_por, 'frete_cobrado', new.frete_cobrado,
            'entrega_cep', new.entrega_cep, 'entrega_logradouro', new.entrega_logradouro,
            'entrega_numero', new.entrega_numero, 'entrega_bairro', new.entrega_bairro,
            'entrega_cidade', new.entrega_cidade, 'entrega_uf', new.entrega_uf));
          if cardinality(v_faltas) > 0 then
            raise exception 'Falta para marcar como pago: %.', array_to_string(v_faltas, ', ');
          end if;
        end if;
      end if;
    end if;
  end if;
  if new.pago_em is null
     and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
    new.pago_em := now();
  end if;
  return new;
end $$;

-- 5. avancar_pecas: o salto de documentos já feitos vai de embalagem direto a pronto_envio.
create or replace function public.avancar_pecas(p_pedido uuid) returns text
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_novo text;
begin
  select * into p from public.pedidos where id = p_pedido;
  if not found or p.status not in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio') then
    return p.status;
  end if;
  select count(*)::int as n,
    (count(*) filter (where status = 'encontrado'))::int as enc,
    (count(*) filter (where status = 'encontrado' and conferido_em is not null))::int as conf,
    (count(*) filter (where status = 'encontrado' and conferido_em is not null and qtd_bipada >= qtd))::int as bip
    into c from public.pedido_itens where pedido_id = p_pedido and status <> 'removido';
  if c.n = 0 then return p.status; end if;
  v_novo := case
    when c.enc < c.n then case when p.status = 'novo' and c.enc = 0 then 'novo' else 'separacao' end
    when c.conf < c.n then 'conferencia'
    when c.bip < c.n then 'bipagem'
    else 'faturamento' end;
  if p.status in ('faturamento','embalagem','pronto_envio','enviar_rastreio') then
    if v_novo = 'faturamento' then return p.status; end if; -- peças completas: os documentos seguem como estão
  elsif v_novo = 'faturamento'
    and not coalesce((public.acerto_operacional(p_pedido)->>'pendente')::boolean, false) then
    -- Peças completas de novo (alguém desfez e refez): pula os documentos que já estavam feitos.
    if p.nf_emitida_em is not null and p.pedido_fornecedor_em is not null then
      v_novo := 'embalagem';
      if p.embalado_em is not null and p.frete_gerado_em is not null then v_novo := 'pronto_envio'; end if;
    end if;
  end if;
  if v_novo is distinct from p.status then
    update public.pedidos set status = v_novo where id = p_pedido;
  end if;
  return v_novo;
end $$;

-- 6. mover_etapa: sem 'frete' na ordem; a etapa embalagem se chama "Embalagem e frete".
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
    v_ordem := array['separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviado'];
    v_nomes := array['Separação','Conferência','Bipagem','Nota fiscal','Embalagem e frete','Postagem','Concluído'];
  else
    v_ordem := array['separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio','enviado'];
    v_nomes := array['Separação','Conferência','Bipagem','Nota fiscal','Embalagem e frete','Postagem','Enviar rastreio','Concluído'];
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
        frete_gerado_em = case when v_para >= 6 then coalesce(frete_gerado_em, now()) else frete_gerado_em end,
        postado_em = case when v_para >= 7 then coalesce(postado_em, now()) else postado_em end,
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
        frete_gerado_em = case when v_para <= 5 then null else frete_gerado_em end,
        frete_peso_g = case when v_para <= 5 then null else frete_peso_g end,
        postado_em = case when v_para <= 6 then null else postado_em end,
        rastreio_enviado_em = case when v_para <= 7 then null else rastreio_enviado_em end,
        status = p_destino
      where id = p_pedido;
    insert into public.pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
    values (p_pedido, 'reiniciado', v_ordem[v_de], 'voltou para ' || v_nomes[v_para], v_quem);
  end if;
  perform set_config('arvenne.lote', '', true);
  return (select status from public.pedidos where id = p_pedido);
end $$;

-- 7. designar: sem 'frete' entre as etapas com responsável.
CREATE OR REPLACE FUNCTION public.designar(p_pedido uuid, p_etapa text, p_membro uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p public.pedidos%rowtype;
  v_nome text;
  v_atual text;
begin
  if p_etapa is null or p_etapa not in ('separacao','conferencia','bipagem','faturamento',
                                        'embalagem','pronto_envio','enviar_rastreio') then
    raise exception 'Etapa inválida';
  end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_p.status not in ('novo','separacao','avisar_cliente','aguardando_cliente','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio') then
    raise exception 'Só dá para designar responsável de pedido na esteira.';
  end if;
  v_atual := v_p.responsaveis->>p_etapa;
  if p_membro is not null then
    select nome into v_nome from public.equipe where id = p_membro and ativo;
    if not found then raise exception 'Pessoa não encontrada ou inativa'; end if;
    if v_atual is not distinct from p_membro::text then return; end if;
    update public.pedidos set responsaveis = jsonb_set(responsaveis, array[p_etapa], to_jsonb(p_membro::text))
      where id = p_pedido;
  else
    if v_atual is null then return; end if;
    update public.pedidos set responsaveis = responsaveis - p_etapa where id = p_pedido;
  end if;
  insert into public.pedido_eventos (pedido_id, tipo, para, texto, usuario_email)
  values (p_pedido, 'designado', p_etapa, coalesce(v_nome, 'ninguém'), public.usuario_atual_email());
end $function$
;


-- 8. Dados: o pedido que estava em Frete volta para Embalagem e frete (a embalagem já feita fica marcada e só falta o
-- frete). A pessoa responsável pelo Frete passa a ser a da Embalagem e frete quando esta estava vazia. É correção de
-- dados, não ação de ninguém: os gatilhos de etapa ficam desligados só nesta atualização (status_desde e histórico não
-- mudam). Eventos antigos com 'frete' continuam como estão (histórico).
alter table public.pedidos disable trigger pedidos_antes;
alter table public.pedidos disable trigger pedidos_depois;
update public.pedidos set status = 'embalagem' where status = 'frete';
update public.pedidos set etapa_antes_desvio = 'embalagem' where etapa_antes_desvio = 'frete';
update public.pedidos
   set responsaveis = (responsaveis - 'frete') ||
       case when responsaveis ? 'embalagem' then '{}'::jsonb
            else jsonb_build_object('embalagem', responsaveis->'frete') end
 where responsaveis ? 'frete';
alter table public.pedidos enable trigger pedidos_antes;
alter table public.pedidos enable trigger pedidos_depois;

-- GRANTs: as funções mantêm os de antes (create or replace); repetidos aqui por clareza.
revoke all on function public.regras_etapas(jsonb) from public, anon;
grant execute on function public.regras_etapas(jsonb) to authenticated, service_role;
revoke all on function public.avancar_pecas(uuid) from public, anon;
grant execute on function public.avancar_pecas(uuid) to authenticated, service_role;
revoke all on function public.mover_etapa(uuid, text) from public, anon;
grant execute on function public.mover_etapa(uuid, text) to authenticated, service_role;
revoke all on function public.designar(uuid, text, uuid) from public, anon;
grant execute on function public.designar(uuid, text, uuid) to authenticated;
