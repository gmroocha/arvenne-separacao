-- Esteira leve (17/11/2026): cada peça anda sozinha pela esteira e o banco faz o mínimo por clique.
--
-- O que muda:
--  1) Gravação em lote das peças (marcar_pecas): valores absolutos, uma transação, uma trava, devolve o estado.
--  2) Gatilhos de peça só para o que mexe em dinheiro; histórico só do que serve para métrica e conferência.
--  3) Etapa Etiquetagem deixa de existir (a conferência manda colar a etiqueta).
--  4) Mover de etapa à mão (mover_etapa) e "Concluir pedido"; o pedido avança sozinho ao fim de cada etapa.
--  5) Concluído (status enviado, nome só na tela) com entregue_em; sem peso no frete (a coluna fica, sem uso).
--  6) v_producao_pessoa (produção por pessoa, dia e etapa) no lugar de v_tempo_sku.
--  7) excluir_membro (Time).
-- Tudo novo tem GRANT explícito (o projeto não dá GRANT automático).

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Sem Etiquetagem: as funções que citam a etapa são recriadas a partir da última versão de cada uma.
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.regras_etapas(p jsonb) returns jsonb
language plpgsql immutable set search_path to 'public','pg_temp' as $$
declare
  v_destino text;
  v_motivo text;
  v_resultado jsonb := '{}'::jsonb;
  v_status text := p->>'status';
  v_linhas int := coalesce((p->>'linhas')::int,0);
  v_pecas int := coalesce((p->>'pecas')::int,0);
begin
  foreach v_destino in array array['em_aberto','aguardando_pagamento','perdida','novo','separacao',
    'avisar_cliente','aguardando_cliente','conferencia','bipagem','faturamento',
    'embalagem','frete','pronto_envio','enviado','cancelado','somada'] loop
    v_motivo := null;
    if v_destino=v_status and not coalesce((p->>'inserindo')::boolean,false)
       and v_status not in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
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
    elsif v_destino in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado') then
      if v_linhas=0 then
        v_motivo := 'Este pedido não tem peças para expedir.';
      elsif coalesce((p->>'encontradas')::int,0)<>v_linhas then
        v_motivo := 'Conclua a separação: há peça pendente, em falta ou com defeito.';
      elsif v_destino in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviado')
        and coalesce((p->>'conferidas')::int,0)<>v_linhas then
        v_motivo := 'Confira todas as peças antes desta etapa.';
      elsif v_destino in ('faturamento','embalagem','frete','pronto_envio','enviado')
        and coalesce((p->>'bipadas')::int,0)<>v_pecas then
        v_motivo := 'Bipe todas as unidades antes desta etapa.';
      elsif v_destino in ('embalagem','frete','pronto_envio','enviado')
        and (p->>'nota' is null or p->>'fornecedor' is null) then
        v_motivo := 'Conclua a nota fiscal e o pedido do fornecedor.';
      elsif v_destino in ('embalagem','frete','pronto_envio','enviado') and coalesce((p->>'acerto')::boolean,false) then
        v_motivo := 'Resolva os acertos e devoluções antes de liberar a embalagem.';
      elsif v_destino in ('frete','pronto_envio','enviado') and p->>'embalado' is null then
        v_motivo := 'Confirme a embalagem antes do frete.';
      elsif v_destino in ('pronto_envio','enviado') and p->>'frete' is null then
        v_motivo := 'Gere o frete antes da postagem.';
      elsif v_destino='enviado' and p->>'postado' is null then
        v_motivo := 'Confirme a postagem antes de marcar como concluído.';
      end if;
    end if;
    v_resultado := v_resultado || jsonb_build_object(v_destino,v_motivo);
  end loop;
  return v_resultado;
end $$;

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
  v_nivel := array_position(array['conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'],p.status);
  if v_nivel is null then return; end if;
  select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
    (count(*) filter (where status='encontrado'))::int as encontradas,
    (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
    coalesce(sum(qtd_bipada),0)::int as bipadas into c
  from public.pedido_itens where pedido_id=p_pedido and status<>'removido';
  -- O acerto pendente só decide se "frete" e "pronto para envio" voltam para trás.
  if v_nivel>=5 then select acerto_pendente into v_acerto from public.v_pedidos where id=p_pedido; end if;
  v_regras := public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
    'conferidas',c.conferidas,'bipadas',c.bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false)));
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'bipagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=4 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=5 and v_regras->>'frete' is not null then v_destino := 'embalagem';
  elsif v_nivel>=6 and v_regras->>'pronto_envio' is not null then v_destino := 'frete';
  end if;
  if v_destino is not null and v_destino<>p.status then
    update public.pedidos set status=v_destino where id=p_pedido;
  end if;
end $$;

create or replace function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean) returns void
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_etapas text[] := case when p_tudo
    then array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia',
               'bipagem', 'faturamento', 'embalagem', 'frete', 'pronto_envio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_bip   boolean := 'bipagem' = any(v_etapas);
  v_fat   boolean := 'faturamento' = any(v_etapas);
  v_emb   boolean := 'embalagem' = any(v_etapas);
  v_frete boolean := 'frete' = any(v_etapas);
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
      rastreio_enviado_em  = case when v_post then null else rastreio_enviado_em end,
      status               = case when p_tudo then 'novo' else status end
   where id = p_pedido and (v_fat or v_emb or v_frete or v_post or p_tudo);

  insert into pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
  values (p_pedido, 'reiniciado', p_etapa, case when p_tudo then 'pedido inteiro' else 'etapa ' || p_etapa end,
          usuario_atual_email());
end $$;

create or replace function public.sair_do_desvio(p_pedido uuid) returns text
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_ordem text[] := array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'];
  v_origem text;
  v_destino text := 'separacao';
  v_regras jsonb;
  v_acerto boolean := false;
  v_cand text;
  v_aberta boolean;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p.status not in ('avisar_cliente','aguardando_cliente') then return p.status; end if;
  v_origem := coalesce(p.etapa_antes_desvio, 'separacao');
  if array_position(v_ordem, v_origem) is null then v_origem := 'separacao'; end if;
  select exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('pendente','falta','defeito'))
    into v_aberta;
  if not v_aberta and v_origem <> 'separacao' then
    select count(*)::int as linhas, coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into c
    from public.pedido_itens where pedido_id = p_pedido and status <> 'removido';
    if array_position(v_ordem, v_origem) >= 5 then
      select acerto_pendente into v_acerto from public.v_pedidos where id = p_pedido;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
      'conferidas',c.conferidas,'bipadas',c.bipadas,
      'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
      'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false)));
    -- A etapa de origem se ela ainda vale; senão a mais avançada abaixo dela que vale.
    for n in reverse array_position(v_ordem, v_origem) .. 2 loop
      v_cand := v_ordem[n];
      if v_regras->>v_cand is null then v_destino := v_cand; exit; end if;
    end loop;
  end if;
  update public.pedidos set status = v_destino where id = p_pedido;
  perform public.reavaliar_etapa(p_pedido);
  -- Resolvida a falta, o pedido fica na etapa da peça mais atrasada (e avança se todas já terminaram).
  perform public.avancar_pecas(p_pedido);
  return (select status from public.pedidos where id = p_pedido);
end $$;

create or replace function public.listar_inconsistencias()
 returns table(pedido_id uuid, numero text, regra text, detalhe text)
 language sql stable set search_path to 'public','pg_temp' as $$
  with valores as materialized (select * from public.v_pedidos)
  select v.id, v.numero, 'composicao_total'::text,
         'O total difere de peças menos descontos e mais frete.'::text
    from valores v where v.status <> 'somada'
     and abs(v.total - (v.subtotal - v.desconto - v.desconto_pix + v.frete_na_conta)) > 0.005
  union all
  select v.id, v.numero, 'total_negativo', 'O total do pedido ficou negativo.'
    from valores v where v.total < 0 or v.total_geral < 0
  union all
  select v.id, v.numero, 'etapa_adiantada', 'Há peças pendentes, em falta ou com trabalho incompleto nesta etapa.'
    from valores v
   where v.status in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado')
     and exists (
       select 1 from public.pedido_itens i where i.pedido_id = v.id and i.status <> 'removido'
         and (i.status <> 'encontrado'
              or (v.status in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviado') and i.conferido_em is null)
              or (v.status in ('faturamento','embalagem','frete','pronto_envio','enviado') and i.qtd_bipada < i.qtd)))
  union all
  select p.id, p.numero, 'bipagem_invalida', 'Contagem de bipagem fora da quantidade do pedido.'
    from public.pedidos p where exists (
      select 1 from public.pedido_itens i where i.pedido_id=p.id and (i.qtd_bipada < 0 or i.qtd_bipada > i.qtd))
  union all
  select v.id, v.numero, 'somada_sem_composicao', 'A venda somada tem valor registrado, mas o romaneio perdeu as peças ou o total.'
    from valores v join public.pedidos p on p.id=v.id
   where v.status='somada' and p.somada_valor > 0 and (v.total=0 or v.qtd_pecas=0)
  union all
  select v.id, v.numero, 'pagamento_a_conferir', 'O total atual difere do pagamento registrado; confira trocas, acréscimos e acertos.'
    from valores v where v.fase='expedicao' and v.total_pago is not null
     and abs(v.total_geral-v.total_pago) > 0.005 and v.a_devolver=0
     and not exists (select 1 from public.trocas t where t.pedido_id=v.id and t.status <> 'cancelada'
                       and (t.status in ('rascunho','enviada','respondida') or t.acerto_status='pendente'))
  union all
  select p.id, p.numero, 'acerto_zero_pendente', 'O acerto permanece pendente apesar de o saldo líquido ser zero.'
    from public.v_pedido_acerto a join public.pedidos p on p.id=a.pedido_id
   where a.acerto_status='pendente' and abs(a.saldo) < 0.005
  union all
  select p.id, p.numero, 'troca_inativa_pendente', 'A troca espera peças que já deixaram de faltar.'
    from public.trocas t join public.pedidos p on p.id=t.pedido_id
   where t.status in ('enviada','respondida')
     and exists (select 1 from public.troca_pecas tp where tp.troca_id=t.id and tp.concluida_em is null)
     and not exists (select 1 from public.troca_pecas tp join public.pedido_itens i on i.id=tp.item_id
                      where tp.troca_id=t.id and tp.concluida_em is null and i.status in ('falta','defeito'))
  union all
  select v.id,v.numero,'pagamento_sem_conferencia','Confira o pagamento inicial e os acertos antigos: o saldo confirmado ainda não está disponível.'
    from valores v where v.total_pago is null and v.pago_em is not null
      and v.status not in ('em_aberto','aguardando_pagamento','perdida')
  union all
  -- V36: prazo de 48 h úteis depende do calendário; avisa com um ano de antecedência.
  select null::uuid, 'Calendário', 'calendario_feriados',
         'O calendário de feriados termina em ' || to_char(public.feriados_ate(), 'DD/MM/YYYY')
         || '. Cadastre os próximos anos para o prazo de envio continuar certo.'
   where public.feriados_ate() is null or public.feriados_ate() < current_date + 365;
$$;

-- Máquina de estados: sem Etiquetagem e com avanço automático ao fim das etapas de documento.
-- (Nota + pedido LR → Embalagem; embalado → Frete; frete gerado → Postagem; postado → Concluído.)
-- O avanço só acontece se as regras permitirem (por exemplo, acerto pendente trava a Embalagem); se não
-- permitirem, o campo fica gravado e o pedido espera na etapa.
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
      when 'embalagem' then case when new.embalado_em is not null and old.embalado_em is null then 'frete' end
      when 'frete' then case when new.frete_gerado_em is not null and old.frete_gerado_em is null then 'pronto_envio' end
      when 'pronto_envio' then case when new.postado_em is not null and old.postado_em is null then 'enviado' end
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
    if coalesce(v_prox,new.status) in ('embalagem','frete','pronto_envio','enviado') then
      select acerto_pendente into v_acerto from public.v_pedidos where id=new.id;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',case when tg_op='INSERT' then new.status else old.status end,'inserindo',tg_op='INSERT',
      'linhas',v.linhas,'pecas',v.pecas,'encontradas',v.encontradas,'conferidas',v.conferidas,
      'bipadas',v.bipadas,'nota',new.nf_emitida_em,
      'frete',new.frete_gerado_em,'fornecedor',new.pedido_fornecedor_em,'embalado',new.embalado_em,
      'postado',new.postado_em,'acerto',coalesce(v_acerto,false)));
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

-- "Entregue" (a cliente recebeu) é registrado uma vez; o evento entra no histórico.
alter table public.pedidos add column if not exists entregue_em timestamptz;

create or replace function public.tg_pedidos_depois() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_quem text := public.usuario_atual_email();
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_eventos (pedido_id, tipo, para, usuario_email)
    values (new.id, 'criado', new.status, v_quem);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, tipo, de, para, usuario_email)
    values (new.id, 'status', old.status, new.status, v_quem);
  end if;

  if (new.pago_em is null) <> (old.pago_em is null) and new.pago_em is not null then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (new.id, 'pago', concat_ws(' · ', new.forma_pagamento, new.valor_pago::text), v_quem);
  end if;

  if (new.nf_emitida_em is null) <> (old.nf_emitida_em is null) then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (new.id, case when new.nf_emitida_em is null then 'nota_desfeita' else 'nota_emitida' end, new.nf_numero, v_quem);
  end if;

  if (new.frete_gerado_em is null) <> (old.frete_gerado_em is null) then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (new.id, case when new.frete_gerado_em is null then 'frete_desfeito' else 'frete_gerado' end,
            case when new.frete_gerado_em is null then new.frete_servico
                 else concat_ws(' · ', new.frete_servico, case when new.frete_peso_g is not null then new.frete_peso_g::text || ' g' end) end,
            v_quem);
  end if;

  if (new.pedido_fornecedor_em is null) <> (old.pedido_fornecedor_em is null) then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (new.id, case when new.pedido_fornecedor_em is null then 'pedido_lr_desfeito' else 'pedido_lr' end,
            new.pedido_fornecedor_numero, v_quem);
  end if;

  if (new.embalado_em is null) <> (old.embalado_em is null) then
    insert into public.pedido_eventos (pedido_id, tipo, usuario_email)
    values (new.id, case when new.embalado_em is null then 'desembalado' else 'embalado' end, v_quem);
  end if;

  if (new.postado_em is null) <> (old.postado_em is null) then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (new.id, case when new.postado_em is null then 'desfeito_postagem' else 'postado' end, new.rastreio, v_quem);
  end if;

  if (new.rastreio_enviado_em is null) <> (old.rastreio_enviado_em is null) and new.rastreio_enviado_em is not null then
    insert into public.pedido_eventos (pedido_id, tipo, usuario_email)
    values (new.id, 'rastreio_enviado', v_quem);
  end if;

  if old.entregue_em is null and new.entregue_em is not null then
    insert into public.pedido_eventos (pedido_id, tipo, usuario_email)
    values (new.id, 'entregue', v_quem);
  end if;

  return null;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Gatilhos de peça só para o que importa.
-- ---------------------------------------------------------------------------------------------------------------

-- Histórico só do essencial: quantidade, preço e a peça sair (removida, em falta, com defeito) ou voltar,
-- depois do pagamento. Achei, conferida, bipada e os "desfeitos" não viram evento: o que importa é quem
-- concluiu cada etapa do pedido (evento de status), não cada clique.
create or replace function public.tg_itens_depois() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_quem  text;
  v_texto text;
  v_sai   boolean := new.status is distinct from old.status
    and (new.status in ('removido','falta','defeito') or old.status in ('removido','falta','defeito'));
begin
  if not (v_sai or new.qtd is distinct from old.qtd or new.preco is distinct from old.preco) then
    return null; -- só progresso (achei, conferida, bipada): nada a registrar
  end if;
  if exists (select 1 from public.pedidos where id = new.pedido_id and status in ('em_aberto', 'aguardando_pagamento')) then
    return null;
  end if;
  v_quem := public.usuario_atual_email();
  v_texto := concat_ws(' · ', new.sku, new.nome, new.variante);

  if v_sai then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'item', old.status, new.status, v_texto, v_quem);
  end if;
  if new.qtd is distinct from old.qtd then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'qtd', old.qtd::text, new.qtd::text, v_texto, v_quem);
  end if;
  if new.preco is distinct from old.preco then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'preco', old.preco::text, new.preco::text, v_texto, v_quem);
  end if;
  return null;
end $$;

-- Reabrir trabalho: a mudança de peça em lote (marcar_pecas) calcula a etapa do pedido sozinha, então o
-- gatilho não reavalia a etapa uma segunda vez nesse caso (sinal arvenne.lote, só dentro da transação).
create or replace function public.tg_trabalho_reaberto() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_ids uuid[];
  v_reavaliar uuid[];
  v record;
begin
  if tg_op='UPDATE' then
    if exists (
      select 1 from novos n join antigos a using(id)
      where n.pedido_id<>a.pedido_id and not exists (
        select 1 from public.pedidos s where s.id=a.pedido_id and s.status='somada'
          and s.somar_em=n.pedido_id and n.adicional and n.venda_origem_id=s.id)) then
      raise exception 'Peças só mudam de pedido pela operação de somar uma venda';
    end if;
    select array_agg(distinct n.pedido_id) into v_ids from novos n join antigos a using(id)
    where (n.pedido_id,n.status,n.qtd,n.conferido_em,n.etiquetado_em,n.qtd_bipada)
      is distinct from (a.pedido_id,a.status,a.qtd,a.conferido_em,a.etiquetado_em,a.qtd_bipada);

    select array_agg(distinct n.pedido_id) into v_reavaliar from novos n join antigos a using(id)
    where n.pedido_id is distinct from a.pedido_id or n.qtd is distinct from a.qtd
       or (n.status is distinct from a.status and not (n.status='encontrado' and a.status<>'removido'))
       or (a.conferido_em is not null and n.conferido_em is null)
       or (a.etiquetado_em is not null and n.etiquetado_em is null)
       or n.qtd_bipada < a.qtd_bipada;
  else
    select array_agg(distinct pedido_id) into v_ids from novos;
    v_reavaliar := v_ids;
  end if;
  if v_ids is null then return null; end if;
  for v in select id,status from public.pedidos where id=any(v_ids) order by id for update loop
    if v.status in ('enviado','cancelado','perdida','somada') then
      raise exception 'Este pedido está arquivado (%); não é possível reabrir ou acrescentar peças',v.status;
    end if;
    if coalesce(current_setting('arvenne.lote', true), '') = '1' then continue; end if;
    -- Etapas posteriores conservam todas as verificações, inclusive acerto financeiro.
    if v.status not in ('novo','separacao','conferencia','bipagem')
       or v.id=any(coalesce(v_reavaliar,'{}'::uuid[])) then
      perform public.reavaliar_etapa(v.id);
    end if;
  end loop;
  return null;
end $$;

-- Bipagem pelo leitor: continua valendo para abas antigas, mas não guarda mais a tabela bipagens
-- (o que importa é a contagem na peça; o histórico clique a clique saiu).
create or replace function public.bipar(p_pedido uuid, p_item uuid, p_codigo text) returns text
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_i   public.pedido_itens%rowtype;
  v_res text;
begin
  if p_item is null then
    return 'fora_do_pedido';
  end if;
  select * into v_i from public.pedido_itens where id = p_item and pedido_id = p_pedido for update;
  if not found then raise exception 'Peça não pertence a este pedido'; end if;
  if v_i.status <> 'encontrado' then raise exception 'Esta peça não está separada; não pode ser bipada'; end if;
  if upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'))
     is distinct from upper(regexp_replace(coalesce(v_i.sku, ''), '\s', '', 'g'))
     or coalesce(v_i.sku, '') = '' then
    raise exception 'O código lido não é o SKU desta peça';
  end if;
  if v_i.qtd_bipada >= v_i.qtd then
    v_res := 'excedente';
  else
    update public.pedido_itens set qtd_bipada = least(qtd, qtd_bipada + 1), bipado_em = now() where id = p_item;
    v_res := 'ok';
  end if;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Funções que só perdem a etapa Etiquetagem das listas (cópia da última versão de cada uma).
-- ---------------------------------------------------------------------------------------------------------------
-- alterar_item
CREATE OR REPLACE FUNCTION public.alterar_item(p_item uuid, p_campos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p public.pedidos%rowtype;
  v_problemas boolean;
begin
  if jsonb_typeof(p_campos) is distinct from 'object' then
    raise exception 'Informe os campos da peça';
  end if;
  if exists (select 1 from jsonb_object_keys(p_campos) k where k not in
    ('status','observacao','conferido_em','etiquetado_em','etiqueta_previa','qtd_bipada','bipado_em','qtd','preco')) then
    raise exception 'Este campo não pode ser alterado por esta ação';
  end if;
  select p.* into v_p from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  if not found then raise exception 'Peça não encontrada'; end if;
  update public.pedido_itens set
    status=case when p_campos?'status' then p_campos->>'status' else status end,
    observacao=case when p_campos?'observacao' then p_campos->>'observacao' else observacao end,
    conferido_em=case when p_campos?'conferido_em' then (p_campos->>'conferido_em')::timestamptz else conferido_em end,
    etiquetado_em=case when p_campos?'etiquetado_em' then (p_campos->>'etiquetado_em')::timestamptz else etiquetado_em end,
    etiqueta_previa=case when p_campos?'etiqueta_previa' then (p_campos->>'etiqueta_previa')::boolean else etiqueta_previa end,
    qtd_bipada=case when p_campos?'qtd_bipada' then (p_campos->>'qtd_bipada')::int else qtd_bipada end,
    bipado_em=case when p_campos?'bipado_em' then (p_campos->>'bipado_em')::timestamptz else bipado_em end,
    qtd=case when p_campos?'qtd' then (p_campos->>'qtd')::int else qtd end,
    preco=case when p_campos?'preco' then (p_campos->>'preco')::numeric else preco end
    where id=p_item;
  if p_campos?'status' then
    select exists(select 1 from public.pedido_itens where pedido_id=v_p.id and status in ('falta','defeito')) into v_problemas;
    if v_problemas and v_p.status in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_p.id and status not in ('avisar_cliente','aguardando_cliente');
    elsif not v_problemas and v_p.status in ('avisar_cliente','aguardando_cliente') then
      perform public.sair_do_desvio(v_p.id);
    elsif v_p.status='novo' and p_campos->>'status'='encontrado' then
      update public.pedidos set status='separacao' where id=v_p.id and status='novo';
    end if;
    -- Retirar a última peça que faltava pode completar a etapa: o pedido avança como no lote.
    if p_campos->>'status'='removido' then perform public.avancar_pecas(v_p.id); end if;
  end if;
end;
$function$
;

-- designar
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
                                        'embalagem','frete','pronto_envio') then
    raise exception 'Etapa inválida';
  end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_p.status not in ('novo','separacao','avisar_cliente','aguardando_cliente','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
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

-- marcar_falta
CREATE OR REPLACE FUNCTION public.marcar_falta(p_item uuid, p_qtd integer, p_status text DEFAULT 'falta'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_i pedido_itens%rowtype;
  v_ped text;
  v_novo uuid;
begin
  if p_status is null or p_status not in ('falta', 'defeito') then
    raise exception 'Status inválido para peça com problema';
  end if;
  if p_qtd is null or p_qtd < 1 then
    raise exception 'Informe quantas peças faltam';
  end if;
  -- Bloqueia o pedido antes da peça, na mesma ordem da ação geral e da venda somada.
  select p.status into v_ped from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;

  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;

  if p_qtd >= v_i.qtd then
    -- Linha inteira: zera as etapas (conferência, etiqueta, bipagem).
    update pedido_itens
       set status = p_status, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where id = p_item;
    if v_ped in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
    end if;
    return p_item;
  end if;

  update pedido_itens
     set qtd = v_i.qtd - p_qtd, qtd_bipada = least(v_i.qtd_bipada, v_i.qtd - p_qtd),
         valor_pago_linha = case when v_i.valor_pago_linha is not null then v_i.valor_pago_linha-round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end
   where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional, venda_origem_id, troca_peca_origem_id, valor_pago_linha)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem, null,
    'pendente', p_qtd, v_i.adicional, v_i.venda_origem_id, v_i.troca_peca_origem_id,
    case when v_i.valor_pago_linha is not null then round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end)
  returning id into v_novo;
  update pedido_itens set status = p_status where id = v_novo;
  if v_ped in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
    update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
    update public.pedidos set etapa_antes_desvio=case when v_ped='novo' then 'separacao' else v_ped end
      where id=v_i.pedido_id;
  end if;
  return v_novo;
end $function$
;

-- somar_venda
CREATE OR REPLACE FUNCTION public.somar_venda(p_venda uuid, p_forma text, p_valor numeric, p_pago_em timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v      public.pedidos%rowtype;
  pr     public.pedidos%rowtype;
  vv     record;
  v_fator numeric;
  v_base int;
begin
  select * into v from public.pedidos where id = p_venda for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.status = 'somada' then raise exception 'Esta venda já foi somada a um pedido'; end if;
  if v.status not in ('em_aberto', 'aguardando_pagamento') then
    raise exception 'Esta venda não está aberta (está %)', v.status;
  end if;
  if v.somar_em is null then raise exception 'Escolha o pedido ao qual somar esta venda'; end if;
  if p_forma is null or btrim(p_forma) = '' then raise exception 'Informe a forma de pagamento'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor pago'; end if;

  select * into pr from public.pedidos where id = v.somar_em for update;
  if not found then raise exception 'Pedido principal não encontrado'; end if;
  if pr.status in ('enviado', 'cancelado', 'perdida', 'somada', 'em_aberto', 'aguardando_pagamento') then
    raise exception 'O pedido % está % e não aceita mais peças', pr.numero, pr.status;
  end if;

  -- 1) Pagamento na venda (ainda aberta, para a view calcular o Pix e o desconto da venda).
  update public.pedidos
     set forma_pagamento = p_forma, valor_pago = p_valor, pago_em = coalesce(p_pago_em, now())
   where id = p_venda;
  select valor_pecas_com_desconto, subtotal, qtd_pecas, qtd_linhas, fotos into vv from public.v_pedidos where id = p_venda;
  v_fator := case when coalesce(vv.subtotal, 0) > 0 then vv.valor_pecas_com_desconto / vv.subtotal else 1 end;

  -- 2) Venda somada, com as peças ainda nela (o gatilho valida peças e preços ao sair da venda).
  update public.pedidos
     set status = 'somada', somada_em = now(), somada_valor = vv.valor_pecas_com_desconto,
         somada_retrato = public.romaneio_publico(v.token_publico) || jsonb_build_object(
           'qtd_pecas', vv.qtd_pecas, 'qtd_linhas', vv.qtd_linhas, 'fotos', vv.fotos,
           'valor_pecas_com_desconto', vv.valor_pecas_com_desconto)
   where id = p_venda;

  -- 3) Peças vivas vão para o principal como adicionais, com o preço já com o desconto da venda.
  select coalesce(max(ordem), 0) into v_base from public.pedido_itens where pedido_id = pr.id;
  with mover as (
    select id, row_number() over (order by ordem, created_at) as n
    from public.pedido_itens where pedido_id = p_venda and status <> 'removido'
  )
  update public.pedido_itens i
     set pedido_id = pr.id, adicional = true, venda_origem_id = p_venda, ordem = v_base + m.n,
         preco_pago = coalesce(i.preco_pago, round(coalesce(i.preco, 0) * v_fator, 2))
    from mover m
   where i.id = m.id;

  -- 4) Principal que já passou da separação volta para ela (as peças novas precisam ser separadas).
  if pr.status in ('conferencia', 'bipagem', 'faturamento', 'embalagem', 'frete', 'pronto_envio') then
    update public.pedidos set status = 'separacao' where id = pr.id;
  end if;

  -- A tela não escreve eventos 'venda_somada' (RLS só deixa nota/reiniciado): por isso a função é security
  -- definer; o GRANT abaixo é só para authenticated.
  insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (pr.id, 'venda_somada', 'Venda ' || v.numero || ' somada a este pedido.', public.usuario_atual_email()),
         (p_venda, 'venda_somada', 'Somada ao pedido ' || pr.numero || '.', public.usuario_atual_email());
end $function$
;

-- substituir_item
CREATE OR REPLACE FUNCTION public.substituir_item(p_item uuid, p_itens jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and status in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio');
  return v_t;
end $function$
;

-- tg_etapa_antes_desvio
CREATE OR REPLACE FUNCTION public.tg_etapa_antes_desvio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status in ('avisar_cliente','aguardando_cliente') then
    if old.status in ('avisar_cliente','aguardando_cliente') then
      new.etapa_antes_desvio := coalesce(new.etapa_antes_desvio, old.etapa_antes_desvio);
    else
      new.etapa_antes_desvio := case
        when old.status in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then old.status
        else 'separacao' end;
    end if;
  else
    new.etapa_antes_desvio := null;
  end if;
  return new;
end $function$
;
-- ---------------------------------------------------------------------------------------------------------------
-- 1) Etapa das peças: cada peça anda sozinha; o pedido fica na etapa da peça mais atrasada.
--    separação (pendente) → conferência (achada) → bipagem (conferida) → nota fiscal (toda bipada).
-- ---------------------------------------------------------------------------------------------------------------

-- Recalcula a etapa do pedido pelas peças. Dentro das etapas de peça anda para frente e para trás; depois
-- delas só volta (peça desfeita) e nunca pula documento que ainda não foi feito. Devolve o status final.
create function public.avancar_pecas(p_pedido uuid) returns text
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_novo text;
begin
  select * into p from public.pedidos where id = p_pedido;
  if not found or p.status not in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio') then
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
  if p.status in ('faturamento','embalagem','frete','pronto_envio') then
    if v_novo = 'faturamento' then return p.status; end if; -- peças completas: os documentos seguem como estão
  elsif v_novo = 'faturamento'
    and not coalesce((public.acerto_operacional(p_pedido)->>'pendente')::boolean, false) then
    -- Peças completas de novo (alguém desfez e refez): pula os documentos que já estavam feitos.
    if p.nf_emitida_em is not null and p.pedido_fornecedor_em is not null then
      v_novo := 'embalagem';
      if p.embalado_em is not null then
        v_novo := 'frete';
        if p.frete_gerado_em is not null then v_novo := 'pronto_envio'; end if;
      end if;
    end if;
  end if;
  if v_novo is distinct from p.status then
    update public.pedidos set status = v_novo where id = p_pedido;
  end if;
  return v_novo;
end $$;

-- Marcas de progresso das peças, em lote. Cada marca é um valor ABSOLUTO ({item, campo, valor}); repetir o
-- mesmo lote não muda nada. Campos: 'status' (pendente|encontrado), 'conferida' (true|false) e 'bipada'
-- (0..qtd; com "codigo" o banco confere que é o SKU da peça). Vale a última marca de cada peça e campo.
-- Uma transação, uma trava do pedido, e devolve o estado já calculado (pedido, peças e eventos novos),
-- para o app gravar no cache sem reler. Marca de peça em falta/removida é ignorada e devolvida em "ignoradas".
-- Lote vazio só recalcula a etapa do pedido.
create function public.marcar_pecas(p_pedido uuid, p_marcas jsonb) returns jsonb
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_p public.pedidos%rowtype;
  v_ids uuid[];
  v_ignoradas uuid[];
  v_m jsonb;
  v_evt bigint;
  r record;
begin
  if jsonb_typeof(p_marcas) is distinct from 'array' then raise exception 'Informe as marcas das peças'; end if;
  if jsonb_array_length(p_marcas) > 500 then raise exception 'Marcas demais de uma só vez'; end if;
  if exists (select 1 from jsonb_array_elements(p_marcas) x
      where jsonb_typeof(x) <> 'object' or coalesce(x->>'item','') !~ '^[0-9a-fA-F-]{36}$'
         or case coalesce(x->>'campo','')
              when 'status' then coalesce(x->>'valor','') not in ('pendente','encontrado')
              when 'conferida' then jsonb_typeof(x->'valor') is distinct from 'boolean'
              when 'bipada' then coalesce(x->>'valor','') !~ '^[0-9]{1,4}$'
              else true end) then
    raise exception 'Marca de peça inválida';
  end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select coalesce(max(id), 0) into v_evt from public.pedido_eventos where pedido_id = p_pedido;
  if v_p.status in ('em_aberto','aguardando_pagamento','perdida','cancelado','somada','enviado') then
    raise exception 'Este pedido está % e não aceita marcações de peças', v_p.status;
  end if;
  select coalesce(array_agg(distinct (x->>'item')::uuid), '{}') into v_ids from jsonb_array_elements(p_marcas) x;
  if exists (select 1 from unnest(v_ids) u(id) where not exists (
      select 1 from public.pedido_itens i where i.id = u.id and i.pedido_id = p_pedido)) then
    raise exception 'Peça não pertence a este pedido';
  end if;
  select array_agg(i.id) into v_ignoradas from public.pedido_itens i
    where i.id = any(v_ids) and i.status not in ('pendente','encontrado');

  select coalesce(jsonb_agg(jsonb_build_object('item', z.item, 'campo', z.campo, 'valor', z.valor, 'codigo', z.codigo)), '[]'::jsonb)
    into v_m from (
      select distinct on ((x->>'item')::uuid, x->>'campo')
             (x->>'item')::uuid as item, x->>'campo' as campo, (x->'valor') #>> '{}' as valor, x->>'codigo' as codigo
        from jsonb_array_elements(p_marcas) with ordinality t(x, o)
       order by (x->>'item')::uuid, x->>'campo', o desc) z;

  -- Com código lido, ele precisa ser o SKU da peça (contagem à mão não manda código).
  for r in select i.sku, m.codigo from jsonb_to_recordset(v_m) as m(item uuid, campo text, valor text, codigo text)
    join public.pedido_itens i on i.id = m.item
    where m.campo = 'bipada' and m.codigo is not null and m.valor::int > i.qtd_bipada and i.status = 'encontrado'
  loop
    if coalesce(r.sku, '') = ''
       or upper(regexp_replace(coalesce(r.codigo, ''), '\s', '', 'g')) is distinct from upper(regexp_replace(r.sku, '\s', '', 'g')) then
      raise exception 'O código lido não é o SKU desta peça';
    end if;
  end loop;

  perform set_config('arvenne.lote', '1', true);
  update public.pedido_itens i set
      status = c.st, conferido_em = c.cf, etiquetado_em = c.et,
      etiqueta_previa = case when c.cf is null then false else i.etiqueta_previa end,
      qtd_bipada = c.qb, bipado_em = c.bd
    from (
      select i0.id, a.st, b.cf,
             case when b.cf is null then null else coalesce(i0.etiquetado_em, b.cf) end as et,
             d.qb,
             case when d.qb = i0.qtd_bipada then i0.bipado_em when d.qb > 0 then now() end as bd
        from (select item,
                max(valor) filter (where campo = 'status') as st,
                max(valor) filter (where campo = 'conferida') as conf,
                max(valor) filter (where campo = 'bipada') as bip
              from jsonb_to_recordset(v_m) as m(item uuid, campo text, valor text, codigo text) group by item) s
        join public.pedido_itens i0 on i0.id = s.item and i0.status in ('pendente','encontrado')
        cross join lateral (select coalesce(s.st, i0.status) as st) a
        cross join lateral (select case when a.st = 'pendente' then null::timestamptz
                                        when s.conf = 'false' then null::timestamptz
                                        when s.conf = 'true' then coalesce(i0.conferido_em, now())
                                        else i0.conferido_em end as cf) b
        cross join lateral (select case when b.cf is null then 0
                                        when s.bip is not null then least(i0.qtd, s.bip::int)
                                        else i0.qtd_bipada end as qb) d
    ) c
   where i.id = c.id
     and (i.status, i.conferido_em, i.etiquetado_em, i.qtd_bipada) is distinct from (c.st, c.cf, c.et, c.qb);
  perform set_config('arvenne.lote', '', true);

  perform public.avancar_pecas(p_pedido);

  return jsonb_build_object(
    'pedido', (select jsonb_build_object('status', status, 'status_desde', status_desde,
                 'etapa_antes_desvio', etapa_antes_desvio, 'updated_at', updated_at)
               from public.pedidos where id = p_pedido),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'conferido_em', conferido_em,
                 'etiquetado_em', etiquetado_em, 'etiqueta_previa', etiqueta_previa, 'qtd_bipada', qtd_bipada,
                 'bipado_em', bipado_em) order by ordem, id)
               from public.pedido_itens where pedido_id = p_pedido and id = any(v_ids)), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.pedido_eventos e
               where e.pedido_id = p_pedido and e.id > v_evt), '[]'::jsonb),
    'ignoradas', to_jsonb(coalesce(v_ignoradas, '{}'::uuid[])));
end $$;

-- Etapa do pedido à mão (menu "Mover para outra etapa" e "Concluir pedido" = mover para 'enviado').
-- Para frente: marca como feito tudo o que vem antes do destino e grava o evento etapas_puladas (as métricas
-- de tempo ignoram esses trechos). Para trás: zera o trabalho do destino em diante (como reiniciar_pedido).
-- Recusa com troca em andamento, acerto pendente ou peça em falta/defeito.
create function public.mover_etapa(p_pedido uuid, p_destino text) returns text
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_ordem constant text[] := array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado'];
  v_nomes constant text[] := array['Separação','Conferência','Bipagem','Nota fiscal','Embalagem','Frete','Postagem','Concluído'];
  p public.pedidos%rowtype;
  v_de int;
  v_para int := array_position(v_ordem, p_destino);
  v_quem text := public.usuario_atual_email();
begin
  if v_para is null then raise exception 'Etapa inválida'; end if;
  select * into p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
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
  if coalesce((public.acerto_operacional(p_pedido)->>'pendente')::boolean, false) then
    raise exception 'Há acerto ou devolução pendente neste pedido. Resolva antes de mover de etapa.';
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
        rastreio_enviado_em = case when v_para <= 7 then null else rastreio_enviado_em end,
        status = p_destino
      where id = p_pedido;
    insert into public.pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
    values (p_pedido, 'reiniciado', v_ordem[v_de], 'voltou para ' || v_nomes[v_para], v_quem);
  end if;
  perform set_config('arvenne.lote', '', true);
  return (select status from public.pedidos where id = p_pedido);
end $$;

-- Time: "Excluir" de verdade. A pessoa sai da lista e dos pedidos em que era responsável; as métricas usam o
-- e-mail gravado nos eventos, então nada se perde. (Pedido e eventos nunca são apagados.)
create function public.excluir_membro(p_membro uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not exists (select 1 from public.equipe where id = p_membro) then raise exception 'Pessoa não encontrada'; end if;
  update public.pedidos set responsaveis = coalesce((
      select jsonb_object_agg(e.key, e.value) from jsonb_each(responsaveis) e where e.value #>> '{}' <> p_membro::text), '{}'::jsonb)
    where exists (select 1 from jsonb_each(responsaveis) e where e.value #>> '{}' = p_membro::text);
  delete from public.equipe where id = p_membro;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Dados: a etapa Etiquetagem sai. Pedidos nela vão para a Bipagem; conferida já vale como etiquetada.
-- ---------------------------------------------------------------------------------------------------------------
update public.pedido_itens set etiquetado_em = conferido_em
 where status = 'encontrado' and conferido_em is not null and etiquetado_em is null
   and pedido_id in (select id from public.pedidos where status not in ('enviado','cancelado','perdida','somada'));
update public.pedidos set status = 'bipagem' where status = 'etiquetagem';
update public.pedidos set etapa_antes_desvio = 'bipagem' where etapa_antes_desvio = 'etiquetagem';

alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'bipagem',
  'faturamento', 'embalagem', 'frete', 'pronto_envio', 'enviado', 'cancelado', 'somada'));
alter table public.pedidos drop constraint if exists pedidos_etapa_antes_desvio_check;
alter table public.pedidos add constraint pedidos_etapa_antes_desvio_check check (etapa_antes_desvio is null or
  etapa_antes_desvio in ('separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'));

-- ---------------------------------------------------------------------------------------------------------------
-- Métricas só do essencial: sai o histórico clique a clique (achei, conferida, etiquetada, bipada e os
-- "desfeitos") e a view de tempo por peça. Ficam: prazo/atraso, produção por pessoa, mudanças depois de pago.
-- ---------------------------------------------------------------------------------------------------------------
delete from public.pedido_eventos
 where tipo in ('conferida','desconferida','etiquetada','desetiquetada','bipada')
    or (tipo = 'item' and not (coalesce(para,'') in ('removido','falta','defeito') or coalesce(de,'') in ('removido','falta','defeito')));

alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo in (
  'criado','status','item','nota','qtd','preco','pago','nota_emitida','nota_desfeita','frete_gerado','frete_desfeito',
  'pedido_lr','pedido_lr_desfeito','embalado','desembalado','postado','desfeito_postagem','rastreio_enviado','reiniciado',
  'troca_enviada','troca_respondida','troca_concluida','shopify_alterado','troca_acerto','devolvido','devolvido_desfeito',
  'shopify_alerta','venda_somada','troca_carrinho','designado','etapas_puladas','entregue'));

drop view if exists public.v_tempo_sku;

-- Produção por pessoa: quem concluiu cada etapa (evento de status para a etapa seguinte), por dia de São Paulo.
-- Trechos pulados à mão (mover_etapa para frente: o evento etapas_puladas vem logo antes do de status) e voltas não contam.
create view public.v_producao_pessoa with (security_invoker = true) as
with concluidas as (
  select distinct on (e.pedido_id, e.id) e.pedido_id, e.id as evento_id, e.usuario_email as pessoa,
         (e.created_at at time zone 'America/Sao_Paulo')::date as dia,
         case e.de when 'novo' then 'separacao' else e.de end as etapa
    from public.pedido_eventos e
   where e.tipo = 'status' and e.usuario_email is not null and e.usuario_email <> 'sistema'
     and array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'],
                        case e.de when 'novo' then 'separacao' else e.de end) is not null
     and array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviado'], e.para)
         > array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'],
                          case e.de when 'novo' then 'separacao' else e.de end)
     and not exists (select 1 from public.pedido_eventos x
                      where x.pedido_id = e.pedido_id and x.tipo = 'etapas_puladas'
                        and x.id = (select max(y.id) from public.pedido_eventos y where y.pedido_id = e.pedido_id and y.id < e.id))
)
select c.dia, c.pessoa, c.etapa,
       count(distinct c.pedido_id)::int as pedidos,
       coalesce(sum(q.pecas), 0)::int as pecas
  from concluidas c
  cross join lateral (select coalesce(sum(i.qtd), 0) as pecas from public.pedido_itens i
                       where i.pedido_id = c.pedido_id and i.status <> 'removido') q
 group by c.dia, c.pessoa, c.etapa;

-- ---------------------------------------------------------------------------------------------------------------
-- Permissões: anon nada; authenticated executa/lê; ninguém ganha DELETE.
-- ---------------------------------------------------------------------------------------------------------------
revoke all on function public.avancar_pecas(uuid) from public, anon;
grant execute on function public.avancar_pecas(uuid) to authenticated, service_role;
revoke all on function public.marcar_pecas(uuid, jsonb) from public, anon;
grant execute on function public.marcar_pecas(uuid, jsonb) to authenticated, service_role;
revoke all on function public.mover_etapa(uuid, text) from public, anon;
grant execute on function public.mover_etapa(uuid, text) to authenticated, service_role;
revoke all on function public.excluir_membro(uuid) from public, anon;
grant execute on function public.excluir_membro(uuid) to authenticated, service_role;
revoke all on public.v_producao_pessoa from public, anon;
grant select on public.v_producao_pessoa to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Leitura operacional da esteira (criada em 20261122170000, já aplicada): sem a contagem de etiquetadas.
-- ---------------------------------------------------------------------------------------------------------------
drop view public.v_pedidos_operacao;
create view public.v_pedidos_operacao with (security_invoker=true) as
select p.id,p.numero,p.origem,p.status,p.status_desde,p.cliente_nome,p.cliente_telefone,
  p.shopify_url,p.pedido_em,p.etapa_antes_desvio,p.responsaveis,
  a.qtd_pecas,a.qtd_linhas,a.qtd_encontradas,a.qtd_conferidas,a.qtd_bipadas,a.fotos,
  f.fase, (p.origem<>'shopify' and p.status='enviado' and p.rastreio_enviado_em is null) as pendente_rastreio,
  z.prazo,case when z.prazo>now() then public.horas_uteis(now(),z.prazo) end as prazo_horas_uteis,
  (ac.r->>'pendente')::boolean as acerto_pendente,(ac.r->>'devolver')::numeric(10,2) as a_devolver,
  public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',a.qtd_linhas,'pecas',a.qtd_pecas,'encontradas',a.qtd_encontradas,
    'conferidas',a.qtd_conferidas,'bipadas',a.qtd_bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',(ac.r->>'pendente')::boolean)) as etapas_permitidas
from public.pedidos p
cross join lateral (
  select coalesce(sum(qtd),0)::int as qtd_pecas,count(*)::int as qtd_linhas,
    (count(*) filter(where status='encontrado'))::int as qtd_encontradas,
    (count(*) filter(where status='encontrado' and conferido_em is not null))::int as qtd_conferidas,
    coalesce(sum(qtd_bipada),0)::int as qtd_bipadas,
    coalesce((select jsonb_agg(x.foto_url) from (
      select foto_url from public.pedido_itens where pedido_id=p.id and status<>'removido' and foto_url is not null
      order by ordem limit 3) x),'[]'::jsonb) as fotos
  from public.pedido_itens where pedido_id=p.id and status<>'removido'
) a
cross join lateral (select case when p.status in ('em_aberto','aguardando_pagamento') then 'venda'
  when p.status in ('enviado','cancelado','perdida','somada') then 'arquivo' else 'expedicao' end as fase) f
cross join lateral (select case when f.fase='expedicao' then public.prazo_envio(p.pago_em) end as prazo offset 0) z
cross join lateral (select public.acerto_operacional(p.id) as r offset 0) ac;
revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;

create or replace function public.contagens_pedidos() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('emAberto',count(*) filter(where status='em_aberto'),
    'atrasados',count(*) filter(where status in ('novo','separacao','avisar_cliente','aguardando_cliente',
      'conferencia','bipagem','faturamento','embalagem','frete','pronto_envio')
      and public.prazo_envio(pago_em)<now()))
  from public.pedidos where excluido_em is null
    and status not in ('aguardando_pagamento','enviado','cancelado','perdida','somada');
$$;
