-- Rodada 3 (18/11/2026). Migration ainda NÃO aplicada: só entra depois do dry-run e do "sim" do Gustavo.
--  A) encontrar_peca: "Encontrada" numa peça em falta/troca (tira a peça da troca aberta e marca como encontrada).
--  B) enviar_troca não leva mais o pedido a "Aguardando cliente" (só o botão "Cliente avisada" faz isso).
--  C) Etapa "Enviar rastreio" (pedidos que não são da Shopify), entre Postagem e Concluído.
--  D) Papel na equipe (gestor / funcionária) e permissões do Time.
--  E) Clube com produto "pai" e variantes (clube_modelos) e gravação em lote.
-- Tudo novo tem GRANT explícito (o projeto não dá GRANT automático). Nenhum e-mail aqui dentro.

-- ---------------------------------------------------------------------------------------------------------------
-- A) "Encontrada": a peça em falta/troca volta à fila como encontrada (vai direto para a Conferência).
-- "Voltar a pendente" deixava a troca aberta esperando uma peça que já não faltava (troca_inativa_pendente).
-- Aqui a peça sai da troca ainda não concluída, a troca se ajusta (cancelada se ficou vazia, respondida se
-- as outras já escolheram) e o pedido sai do desvio, tudo na mesma transação (alterar_item).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.encontrar_peca(p_item uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_pedido uuid;
  v_status text;
  r record;
begin
  select pedido_id, status into v_pedido, v_status from public.pedido_itens where id = p_item;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_status not in ('falta','defeito') then raise exception 'Só uma peça em falta pode ser marcada como encontrada'; end if;
  perform 1 from public.pedidos where id = v_pedido for update;
  for r in
    select tp.id, tp.troca_id, t.status from public.troca_pecas tp join public.trocas t on t.id = tp.troca_id
     where tp.item_id = p_item and tp.concluida_em is null and t.status in ('rascunho','enviada','respondida')
  loop
    delete from public.troca_pecas where id = r.id;
    if not exists (select 1 from public.troca_pecas where troca_id = r.troca_id) then
      update public.trocas set status = 'cancelada' where id = r.troca_id;
    elsif r.status = 'enviada' and not exists (
        select 1 from public.troca_pecas tp join public.pedido_itens i on i.id = tp.item_id
         where tp.troca_id = r.troca_id and tp.concluida_em is null and i.status in ('falta','defeito')
           and tp.escolha_tipo is null and tp.item_id <> p_item) then
      update public.trocas set status = 'respondida', respondida_em = now() where id = r.troca_id;
    end if;
  end loop;
  perform public.alterar_item(p_item, jsonb_build_object('status', 'encontrado', 'observacao', null));
end $$;
revoke all on function public.encontrar_peca(uuid) from public, anon;
grant execute on function public.encontrar_peca(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- B) Enviar a troca (copiar a mensagem ou o link) só marca a troca como enviada. O pedido continua em "Avisar
-- cliente" até alguém tocar em "Cliente avisada" (antes ele pulava sozinho para "Aguardando cliente").
-- Cópia da definição de 20261113110000_acoes.sql sem o update do pedido. Reenviar continua sem efeito.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.enviar_troca(p_troca uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_pedido uuid;
begin
  select pedido_id into v_pedido from trocas where id = p_troca for update;
  if v_pedido is null then raise exception 'Troca não encontrada'; end if;
  update trocas set status = 'enviada', enviada_em = now() where id = p_troca and status = 'rascunho';
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- C) Etapa "Enviar rastreio" (status enviar_rastreio), entre Postagem e Concluído, só para pedidos que não são da
-- Shopify (a Shopify avisa a cliente sozinha). Postado leva o pedido do WhatsApp para Enviar rastreio e "Mensagem
-- enviada" (rastreio_enviado_em) leva para Concluído; pedido da Shopify segue de Postagem direto para Concluído.
-- Cada função abaixo é recriada a partir da última versão (20261122180000_esteira_leve.sql), só com a etapa nova.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'bipagem',
  'faturamento', 'embalagem', 'frete', 'pronto_envio', 'enviar_rastreio', 'enviado', 'cancelado', 'somada'));

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
    'embalagem','frete','pronto_envio','enviar_rastreio','enviado','cancelado','somada'] loop
    v_motivo := null;
    if v_destino=v_status and not coalesce((p->>'inserindo')::boolean,false)
       and v_status not in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio') then
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
    elsif v_destino in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado') then
      if v_linhas=0 then
        v_motivo := 'Este pedido não tem peças para expedir.';
      elsif coalesce((p->>'encontradas')::int,0)<>v_linhas then
        v_motivo := 'Conclua a separação: há peça pendente, em falta ou com defeito.';
      elsif v_destino in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado')
        and coalesce((p->>'conferidas')::int,0)<>v_linhas then
        v_motivo := 'Confira todas as peças antes desta etapa.';
      elsif v_destino in ('faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado')
        and coalesce((p->>'bipadas')::int,0)<>v_pecas then
        v_motivo := 'Bipe todas as unidades antes desta etapa.';
      elsif v_destino in ('embalagem','frete','pronto_envio','enviar_rastreio','enviado')
        and (p->>'nota' is null or p->>'fornecedor' is null) then
        v_motivo := 'Conclua a nota fiscal e o pedido do fornecedor.';
      elsif v_destino in ('embalagem','frete','pronto_envio','enviar_rastreio','enviado') and coalesce((p->>'acerto')::boolean,false) then
        v_motivo := 'Resolva os acertos e devoluções antes de liberar a embalagem.';
      elsif v_destino in ('frete','pronto_envio','enviar_rastreio','enviado') and p->>'embalado' is null then
        v_motivo := 'Confirme a embalagem antes do frete.';
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
  v_nivel := array_position(array['conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio'],p.status);
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
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false),
    'origem',p.origem,'rastreio',p.rastreio_enviado_em));
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'bipagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=4 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=5 and v_regras->>'frete' is not null then v_destino := 'embalagem';
  elsif v_nivel>=6 and v_regras->>'pronto_envio' is not null then v_destino := 'frete';
  elsif v_nivel>=7 and v_regras->>'enviar_rastreio' is not null then v_destino := 'pronto_envio';
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
               'bipagem', 'faturamento', 'embalagem', 'frete', 'pronto_envio', 'enviar_rastreio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_bip   boolean := 'bipagem' = any(v_etapas);
  v_fat   boolean := 'faturamento' = any(v_etapas);
  v_emb   boolean := 'embalagem' = any(v_etapas);
  v_frete boolean := 'frete' = any(v_etapas);
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
   where v.status in ('conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado')
     and exists (
       select 1 from public.pedido_itens i where i.pedido_id = v.id and i.status <> 'removido'
         and (i.status <> 'encontrado'
              or (v.status in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado') and i.conferido_em is null)
              or (v.status in ('faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado') and i.qtd_bipada < i.qtd)))
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
    if coalesce(v_prox,new.status) in ('embalagem','frete','pronto_envio','enviar_rastreio','enviado') then
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

create or replace function public.avancar_pecas(p_pedido uuid) returns text
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_novo text;
begin
  select * into p from public.pedidos where id = p_pedido;
  if not found or p.status not in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio') then
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
  if p.status in ('faturamento','embalagem','frete','pronto_envio','enviar_rastreio') then
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
                                        'embalagem','frete','pronto_envio','enviar_rastreio') then
    raise exception 'Etapa inválida';
  end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_p.status not in ('novo','separacao','avisar_cliente','aguardando_cliente','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio') then
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


-- Produção por pessoa: Postagem → Enviar rastreio também conta como etapa concluída.
create or replace view public.v_producao_pessoa with (security_invoker = true) as
with concluidas as (
  select distinct on (e.pedido_id, e.id) e.pedido_id, e.id as evento_id, e.usuario_email as pessoa,
         (e.created_at at time zone 'America/Sao_Paulo')::date as dia,
         case e.de when 'novo' then 'separacao' else e.de end as etapa
    from public.pedido_eventos e
   where e.tipo = 'status' and e.usuario_email is not null and e.usuario_email <> 'sistema'
     and array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio'],
                        case e.de when 'novo' then 'separacao' else e.de end) is not null
     and array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','frete','pronto_envio','enviar_rastreio','enviado'], e.para)
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

-- Leitura da esteira: "pendente_rastreio" agora é o pedido que está na etapa Enviar rastreio.
create or replace view public.v_pedidos_operacao with (security_invoker=true) as
select p.id,p.numero,p.origem,p.status,p.status_desde,p.cliente_nome,p.cliente_telefone,
  p.shopify_url,p.pedido_em,p.etapa_antes_desvio,p.responsaveis,
  a.qtd_pecas,a.qtd_linhas,a.qtd_encontradas,a.qtd_conferidas,a.qtd_bipadas,a.fotos,
  f.fase, (p.origem<>'shopify' and p.status='enviar_rastreio') as pendente_rastreio,
  z.prazo,case when z.prazo>now() then public.horas_uteis(now(),z.prazo) end as prazo_horas_uteis,
  (ac.r->>'pendente')::boolean as acerto_pendente,(ac.r->>'devolver')::numeric(10,2) as a_devolver,
  public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',a.qtd_linhas,'pecas',a.qtd_pecas,'encontradas',a.qtd_encontradas,
    'conferidas',a.qtd_conferidas,'bipadas',a.qtd_bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',(ac.r->>'pendente')::boolean,
    'origem',p.origem,'rastreio',p.rastreio_enviado_em)) as etapas_permitidas
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

-- Dados: pedido que não é da Shopify e já estava concluído sem a mensagem de rastreio (e ainda não foi entregue) volta
-- a esperar na etapa Enviar rastreio, para nada se perder. É correção de dados, não ação de ninguém: os gatilhos de
-- etapa ficam desligados só nesta atualização (o status_desde e o histórico não mudam).
alter table public.pedidos disable trigger pedidos_antes;
alter table public.pedidos disable trigger pedidos_depois;
update public.pedidos set status = 'enviar_rastreio'
 where status = 'enviado' and origem <> 'shopify' and rastreio_enviado_em is null and entregue_em is null;
alter table public.pedidos enable trigger pedidos_antes;
alter table public.pedidos enable trigger pedidos_depois;

-- GRANTs: as funções e views mantêm os de antes (create or replace); repetidos aqui por clareza.
revoke all on function public.avancar_pecas(uuid) from public, anon;
grant execute on function public.avancar_pecas(uuid) to authenticated, service_role;
revoke all on function public.mover_etapa(uuid, text) from public, anon;
grant execute on function public.mover_etapa(uuid, text) to authenticated, service_role;
revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;
revoke all on public.v_producao_pessoa from public, anon;
grant select on public.v_producao_pessoa to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- D) Papéis no time: gestor e funcionária. Só o gestor mexe no Time (adicionar, editar, desativar, excluir pessoas e
-- trocar o papel); a funcionária vê o app inteiro e a lista do time. O gestor é a pessoa ativa da equipe cujo e-mail
-- é o do login. Nenhum e-mail fica nesta migration: depois de aplicar, o Gustavo marca o próprio registro como
-- gestor (um update único, com o "sim" dele) e promove a segunda pessoa pela tela do Time.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.equipe add column papel text not null default 'funcionaria'
  check (papel in ('gestor','funcionaria'));

create or replace function public.sou_gestor() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists (
    select 1 from public.equipe e
     where e.ativo and e.papel = 'gestor' and e.email is not null
       and lower(btrim(e.email)) = lower(btrim(public.usuario_atual_email())))
$$;
revoke all on function public.sou_gestor() from public, anon;
grant execute on function public.sou_gestor() to authenticated, service_role;

-- Ler continua com todos; escrever só o gestor (a RLS recusa a funcionária).
drop policy if exists equipe_cria on public.equipe;
drop policy if exists equipe_edita on public.equipe;
create policy equipe_cria on public.equipe for insert to authenticated with check (public.sou_gestor());
create policy equipe_edita on public.equipe for update to authenticated
  using (public.sou_gestor()) with check (public.sou_gestor());

-- Excluir pessoa (esteira_leve + a regra nova): só o gestor.
create or replace function public.excluir_membro(p_membro uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.sou_gestor() then raise exception 'Só o gestor pode excluir pessoas do time'; end if;
  if not exists (select 1 from public.equipe where id = p_membro) then raise exception 'Pessoa não encontrada'; end if;
  update public.pedidos set responsaveis = coalesce((
      select jsonb_object_agg(e.key, e.value) from jsonb_each(responsaveis) e where e.value #>> '{}' <> p_membro::text), '{}'::jsonb)
    where exists (select 1 from jsonb_each(responsaveis) e where e.value #>> '{}' = p_membro::text);
  delete from public.equipe where id = p_membro;
end $$;
revoke all on function public.excluir_membro(uuid) from public, anon;
grant execute on function public.excluir_membro(uuid) to authenticated, service_role;

-- Ninguém tira o último gestor ativo (excluindo, desativando ou passando para funcionária).
create or replace function public.tg_equipe_ultimo_gestor() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if old.papel = 'gestor' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'gestor' or not new.ativo)
     and not exists (select 1 from public.equipe e where e.id <> old.id and e.papel = 'gestor' and e.ativo) then
    raise exception 'O time precisa de pelo menos um gestor ativo';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.tg_equipe_ultimo_gestor() from public, anon, authenticated;
create trigger equipe_ultimo_gestor before update or delete on public.equipe
  for each row execute function public.tg_equipe_ultimo_gestor();

-- ---------------------------------------------------------------------------------------------------------------
-- E) Clube com produto "pai" e variantes. O produto (clube_modelos) guarda nome, foto, código base e preço; cada variante
-- continua sendo uma linha de pecas_clube (com código, variante e preço próprios, que começam iguais aos do pai), ligada
-- pelo modelo_id. Pedidos, itemDoClube e dinheiro não mudam: um pedido continua apontando para a peça (variante).
-- Peças sem pai (modelo_id nulo) funcionam como sempre.
-- ---------------------------------------------------------------------------------------------------------------
create table public.clube_modelos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(btrim(nome)) between 1 and 160),
  foto_url    text,
  codigo_base text not null check (char_length(btrim(codigo_base)) between 1 and 80),
  preco       numeric(10,2) check (preco is null or preco >= 0),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index clube_modelos_busca on public.clube_modelos (lower(codigo_base), lower(nome));

alter table public.pecas_clube add column modelo_id uuid references public.clube_modelos(id);
create index pecas_clube_modelo on public.pecas_clube (modelo_id) where modelo_id is not null;

alter table public.clube_modelos enable row level security;
create policy equipe_le on public.clube_modelos for select to authenticated using (true);
create policy equipe_cria on public.clube_modelos for insert to authenticated with check (true);
create policy equipe_edita on public.clube_modelos for update to authenticated using (true) with check (true);
-- Sem DELETE: o produto é desativado, nunca apagado.
revoke all on public.clube_modelos from public, anon, authenticated;
grant select, insert, update on public.clube_modelos to authenticated;
grant select, insert, update on public.clube_modelos to service_role;

-- Salva um produto do Clube e as variantes de uma vez, ou uma lista de produtos (cadastro em massa). Tudo ou nada: qualquer
-- erro desfaz tudo e a mensagem diz a linha ("Linha 3: informe o código"). Cada item:
--   { id?, codigo, nome, preco?, foto_url?, variante?, ativo?, variantes?: [ { id?, codigo, variante, preco?, foto_url?, ativo? } ] }
-- Sem "variantes" (e sem "id"), vira uma peça simples do Clube. Com "variantes" (ou "id"), vira produto com variantes: o preço
-- da variante sem preço próprio é o do pai. "ativo" do produto vale para as variantes também. Variantes que não aparecem na
-- lista ficam como estão. Devolve [{ modelo_id, pecas: [...] }].
create or replace function public.salvar_modelo_clube(p jsonb) returns jsonb
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_itens  jsonb;
  v_item   jsonb;
  v_var    jsonb;
  v_n      int := 0;
  v_modelo uuid;
  v_nome   text;
  v_codigo text;
  v_foto   text;
  v_preco  numeric;
  v_pv     numeric;
  v_codv   text;
  v_varia  text;
  v_ativo  boolean;
  v_codigos text[];
  v_peca   public.pecas_clube%rowtype;
  v_pecas  jsonb;
  v_res    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p) not in ('array','object') then raise exception 'Informe a peça ou a lista de peças'; end if;
  v_itens := case when jsonb_typeof(p) = 'array' then p else jsonb_build_array(p) end;
  if jsonb_array_length(v_itens) = 0 then raise exception 'Nenhuma peça para salvar'; end if;
  for v_item in select value from jsonb_array_elements(v_itens) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Linha %: dados inválidos', v_n; end if;
    v_nome := btrim(coalesce(v_item->>'nome',''));
    v_codigo := btrim(coalesce(v_item->>'codigo',''));
    v_foto := nullif(btrim(coalesce(v_item->>'foto_url','')),'');
    if v_nome = '' then raise exception 'Linha %: informe o nome', v_n; end if;
    if v_codigo = '' then raise exception 'Linha %: informe o código', v_n; end if;
    begin
      v_preco := nullif(btrim(coalesce(v_item->>'preco','')),'')::numeric;
    exception when others then
      raise exception 'Linha %: preço inválido', v_n;
    end;
    if v_preco is not null and v_preco < 0 then raise exception 'Linha %: o preço não pode ser negativo', v_n; end if;
    v_ativo := case when v_item ? 'ativo' then (v_item->>'ativo')::boolean end;

    if jsonb_array_length(coalesce(v_item->'variantes','[]'::jsonb)) = 0 and nullif(v_item->>'id','') is null then
      -- Peça simples (sem pai).
      insert into public.pecas_clube (codigo, nome, variante, foto_url, preco, ativo)
      values (v_codigo, v_nome, nullif(btrim(coalesce(v_item->>'variante','')),''), v_foto, v_preco, coalesce(v_ativo, true))
      returning * into v_peca;
      v_res := v_res || jsonb_build_object('modelo_id', null, 'pecas', jsonb_build_array(to_jsonb(v_peca)));
      continue;
    end if;

    -- Produto com variantes.
    v_codigos := array[]::text[];
    if nullif(v_item->>'id','') is null then
      insert into public.clube_modelos (nome, foto_url, codigo_base, preco, ativo)
      values (v_nome, v_foto, v_codigo, v_preco, coalesce(v_ativo, true)) returning id into v_modelo;
    else
      v_modelo := (v_item->>'id')::uuid;
      update public.clube_modelos set nome = v_nome, foto_url = v_foto, codigo_base = v_codigo, preco = v_preco,
             ativo = coalesce(v_ativo, ativo)
       where id = v_modelo;
      if not found then raise exception 'Linha %: produto não encontrado', v_n; end if;
      if v_ativo is not null then update public.pecas_clube set ativo = v_ativo where modelo_id = v_modelo; end if;
    end if;
    v_pecas := '[]'::jsonb;
    for v_var in select value from jsonb_array_elements(coalesce(v_item->'variantes','[]'::jsonb)) loop
      v_codv := btrim(coalesce(v_var->>'codigo',''));
      v_varia := btrim(coalesce(v_var->>'variante',''));
      if v_codv = '' then raise exception 'Linha %: informe o código de cada variante', v_n; end if;
      if v_varia = '' then raise exception 'Linha %: informe a variante do código %', v_n, v_codv; end if;
      if lower(v_codv) = any(v_codigos) then raise exception 'Linha %: o código % se repete nas variantes', v_n, v_codv; end if;
      v_codigos := v_codigos || lower(v_codv);
      begin
        v_pv := coalesce(nullif(btrim(coalesce(v_var->>'preco','')),'')::numeric, v_preco);
      exception when others then
        raise exception 'Linha %: preço inválido na variante %', v_n, v_codv;
      end;
      if v_pv is not null and v_pv < 0 then raise exception 'Linha %: o preço não pode ser negativo', v_n; end if;
      if nullif(v_var->>'id','') is null then
        insert into public.pecas_clube (codigo, nome, variante, foto_url, preco, ativo, modelo_id)
        values (v_codv, v_nome, v_varia, coalesce(nullif(btrim(coalesce(v_var->>'foto_url','')),''), v_foto), v_pv,
                coalesce((v_var->>'ativo')::boolean, v_ativo, true), v_modelo)
        returning * into v_peca;
      else
        update public.pecas_clube set codigo = v_codv, nome = v_nome, variante = v_varia, preco = v_pv,
               foto_url = coalesce(nullif(btrim(coalesce(v_var->>'foto_url','')),''), v_foto),
               ativo = coalesce((v_var->>'ativo')::boolean, ativo)
         where id = (v_var->>'id')::uuid and modelo_id = v_modelo
        returning * into v_peca;
        if not found then raise exception 'Linha %: variante % não encontrada neste produto', v_n, v_codv; end if;
      end if;
      v_pecas := v_pecas || jsonb_build_array(to_jsonb(v_peca));
    end loop;
    v_res := v_res || jsonb_build_object('modelo_id', v_modelo, 'pecas', v_pecas);
  end loop;
  return v_res;
end $$;
revoke all on function public.salvar_modelo_clube(jsonb) from public, anon;
grant execute on function public.salvar_modelo_clube(jsonb) to authenticated, service_role;
