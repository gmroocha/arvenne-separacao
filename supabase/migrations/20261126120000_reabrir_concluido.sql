-- Reabrir pedido concluído. Pedido do Gustavo, 19/11/2026: "Em um pedido concluído tem que ter como mudar ele de etapa, se
-- quiser, voltar para uma etapa, por exemplo Embalagem e frete. Pode acontecer de marcar como concluído sem querer."
--
-- Só o gestor. Um pedido concluído (status 'enviado') passa a poder voltar para qualquer etapa anterior da ordem da origem
-- dele (Shopify não tem "Enviar rastreio"). O trabalho do destino em diante é zerado, como em qualquer volta de etapa:
--   Separação: peças voltam a pendente; Conferência: conferida/etiqueta; Bipagem: qtd bipada; Nota fiscal: nf_emitida_em e
--   pedido_fornecedor_em; Embalagem e frete: embalado_em, frete_gerado_em, frete_peso_g; Postagem: postado_em;
--   Enviar rastreio: rastreio_enviado_em. Além disso entregue_em é limpo (a entrega deixa de valer).
-- NÃO são apagados: rastreio e rastreio_url (a Postagem os mostra preenchidos para a equipe só conferir ou trocar o link),
-- nf_numero, nf_chave, número do pedido do fornecedor e o serviço do frete, e nada de dinheiro.
-- O que impedia: o gatilho dos pedidos (regras_etapas) e o das peças (tg_trabalho_reaberto) tratam 'enviado' como arquivado. Agora aceita a saída de 'enviado' só
-- enquanto mover_etapa está reabrindo (configuração local arvenne.reabrir, ligada e desligada dentro da própria função).
-- Como os carimbos do destino em diante saem junto, o pedido não "pula" de volta para Concluído: o avanço automático só dispara
-- quando um carimbo passa de vazio para preenchido (e a mudança de status feita aqui não é avanço automático).
-- Cópias: regras_etapas (20261125130000), mover_etapa e tg_pedidos_antes (20261126100000), tg_trabalho_reaberto (20261122180000).
-- Nenhum e-mail aqui dentro.

-- 1. regras_etapas
create or replace function public.regras_etapas(p jsonb) returns jsonb
language plpgsql immutable set search_path to 'public','pg_temp' as $$
declare
  v_destino text;
  v_motivo text;
  v_resultado jsonb := '{}'::jsonb;
  v_status text := p->>'status';
  v_linhas int := coalesce((p->>'linhas')::int,0);
  v_pecas int := coalesce((p->>'pecas')::int,0);
  -- "reabrindo" só vem do gatilho dos pedidos quando mover_etapa está reabrindo um pedido concluído (gestor).
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
       and not coalesce((p->>'inserindo')::boolean,false)
       and not (v_status='enviado' and coalesce((p->>'reabrindo')::boolean,false)) then
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

-- 2. tg_pedidos_antes: só passa 'reabrindo' para as regras.
CREATE OR REPLACE FUNCTION public.tg_pedidos_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v record;
  v_acerto boolean;
  v_regras jsonb;
  v_motivo text;
  v_faltas text[];
  v_prox text;
  v_etapa text;
  v_resp uuid;
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
      'origem',new.origem,'rastreio',new.rastreio_enviado_em,
      'reabrindo',tg_op='UPDATE' and old.status='enviado' and coalesce(current_setting('arvenne.reabrir',true),'')='1'));
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
  -- Responsável padrão: entrou numa etapa da esteira sem ninguém designado.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    v_etapa := case when new.status in ('avisar_cliente','aguardando_cliente') then null else public.etapa_da_esteira(new.status, null) end;
    if v_etapa is not null and coalesce(new.responsaveis ->> v_etapa, '') = '' then
      v_resp := public.responsavel_padrao_de(v_etapa);
      if v_resp is not null then
        new.responsaveis := jsonb_set(coalesce(new.responsaveis, '{}'::jsonb), array[v_etapa], to_jsonb(v_resp::text));
      end if;
    end if;
  end if;
  return new;
end $function$;

-- 3. mover_etapa
CREATE OR REPLACE FUNCTION public.mover_etapa(p_pedido uuid, p_destino text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Pedido concluído só o gestor reabre (a funcionária nem enxerga o pedido concluído, mas a mensagem tem que ser clara).
  if exists (select 1 from public.pedidos where id = p_pedido and status = 'enviado' and excluido_em is null)
     and not public.sou_gestor() then
    raise exception 'Só gestor pode reabrir um pedido concluído.';
  end if;
  perform public.exigir_pedido(p_pedido);
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
  -- Concluído só volta para uma etapa anterior (a posição de "Concluído" é a última da ordem: nada fica à frente dele).
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
  if p.status = 'enviado' then perform set_config('arvenne.reabrir', '1', true); end if;
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
        entregue_em = null, -- só existe em pedido concluído; ao reabrir, a entrega deixa de valer (o rastreio e o link ficam)
        status = p_destino
      where id = p_pedido;
    insert into public.pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
    values (p_pedido, 'reiniciado', v_ordem[v_de],
            case when p.status = 'enviado' then 'reaberto: voltou para ' else 'voltou para ' end || v_nomes[v_para], v_quem);
  end if;
  perform set_config('arvenne.lote', '', true);
  perform set_config('arvenne.reabrir', '', true);
  return (select status from public.pedidos where id = p_pedido);
end $function$;

-- 4. tg_trabalho_reaberto (cópia de 20261122180000_esteira_leve.sql): as peças de um pedido concluído só mudam enquanto
-- mover_etapa o reabre (arvenne.reabrir); fora disso continua proibido.
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
    if v.status in ('enviado','cancelado','perdida','somada')
       and not (v.status = 'enviado' and coalesce(current_setting('arvenne.reabrir', true), '') = '1') then
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

revoke all on function public.regras_etapas(jsonb) from public, anon;
grant execute on function public.regras_etapas(jsonb) to authenticated, service_role;
revoke all on function public.mover_etapa(uuid, text) from public, anon;
grant execute on function public.mover_etapa(uuid, text) to authenticated, service_role;
