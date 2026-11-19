-- Fase 2c (19/11/2026): cada pessoa vê só os pedidos da etapa em que é responsável.
--
-- Regra: gestor vê tudo. Funcionária vê o pedido quando `responsaveis ->> etapa atual` é ela (membro_atual()). A etapa atual
-- considera os desvios (avisar_cliente e aguardando_cliente valem como a etapa de origem, `etapa_antes_desvio`) e "novo"
-- vale como separação. Pedido sem responsável na etapa atual, ou fora da esteira (venda, arquivo), só o gestor vê. Quando o
-- pedido muda de etapa ele some para quem fez e aparece para a responsável da etapa nova.
-- A RLS vale para as tabelas e views (todas security_invoker). As funções security definer que mexem em pedido conferem
-- pode_ver_pedido() no começo. Chamada sem pessoa (cron, gatilhos, service_role) passa (sou_sistema()).
-- Quando o pedido entra numa etapa sem responsável, o gatilho preenche com o "responsável padrão" da etapa (Time).
-- As 4 últimas partes deste arquivo são cópias das funções vigentes com uma linha de conferência no começo.

-- Etapa da esteira em que o pedido está (nulo fora da esteira).
create or replace function public.etapa_da_esteira(p_status text, p_antes text) returns text
language sql immutable set search_path to 'public','pg_temp' as $$
  select case
    when p_status in ('avisar_cliente','aguardando_cliente') then case coalesce(p_antes, 'separacao') when 'frete' then 'embalagem' else coalesce(p_antes, 'separacao') end
    when p_status = 'novo' then 'separacao'
    when p_status = 'frete' then 'embalagem'
    when p_status in ('separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio') then p_status
  end
$$;
revoke all on function public.etapa_da_esteira(text, text) from public, anon;
grant execute on function public.etapa_da_esteira(text, text) to authenticated, service_role;

create or replace function public.pode_ver_pedido(p_pedido uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select public.sou_gestor() or exists (
    select 1 from public.pedidos p
     where p.id = p_pedido
       and p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = public.membro_atual()::text)
$$;
revoke all on function public.pode_ver_pedido(uuid) from public, anon;
grant execute on function public.pode_ver_pedido(uuid) to authenticated, service_role;

-- Conferências no começo das funções. Se o pedido (ou peça, troca, crédito) não existe, a própria função dá o aviso dela.
create or replace function public.exigir_gestor() returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.sou_gestor() then raise exception 'Só o gestor pode fazer isso.'; end if;
end $$;

create or replace function public.exigir_pedido(p_pedido uuid) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.pode_ver_pedido(p_pedido) then raise exception 'Este pedido não está com você.'; end if;
end $$;

create or replace function public.exigir_pedido_do_item(p_item uuid) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v uuid;
begin
  select pedido_id into v from public.pedido_itens where id = p_item;
  if found and not public.pode_ver_pedido(v) then raise exception 'Este pedido não está com você.'; end if;
end $$;

create or replace function public.exigir_pedido_da_troca(p_troca uuid) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v uuid;
begin
  select pedido_id into v from public.trocas where id = p_troca;
  if found and not public.pode_ver_pedido(v) then raise exception 'Este pedido não está com você.'; end if;
end $$;

create or replace function public.exigir_pedido_da_peca_troca(p_peca uuid) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v uuid;
begin
  select t.pedido_id into v from public.troca_pecas tp join public.trocas t on t.id = tp.troca_id where tp.id = p_peca;
  if found and not public.pode_ver_pedido(v) then raise exception 'Este pedido não está com você.'; end if;
end $$;

create or replace function public.exigir_pedido_do_credito(p_credito uuid) returns void
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v uuid;
begin
  select pedido_id into v from public.creditos_cliente where id = p_credito;
  if found and not public.pode_ver_pedido(v) then raise exception 'Este pedido não está com você.'; end if;
end $$;

revoke all on function public.exigir_gestor(), public.exigir_pedido(uuid), public.exigir_pedido_do_item(uuid),
  public.exigir_pedido_da_troca(uuid), public.exigir_pedido_da_peca_troca(uuid), public.exigir_pedido_do_credito(uuid) from public, anon;
grant execute on function public.exigir_gestor(), public.exigir_pedido(uuid), public.exigir_pedido_do_item(uuid),
  public.exigir_pedido_da_troca(uuid), public.exigir_pedido_da_peca_troca(uuid), public.exigir_pedido_do_credito(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Políticas. Pedido: gestor vê tudo; funcionária só a etapa dela. Criar pedido (venda) é do gestor. Quem edita um pedido
-- pode mudá-lo de etapa (o pedido some dela e aparece para a próxima), por isso o WITH CHECK da edição é livre.
-- A restritiva nao_excluido continua valendo.
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists equipe_le on public.pedidos;
drop policy if exists equipe_edita on public.pedidos;
drop policy if exists equipe_cria on public.pedidos;
create policy equipe_le on public.pedidos for select to authenticated using (
  (select public.sou_gestor())
  or responsaveis ->> public.etapa_da_esteira(status, etapa_antes_desvio) = (select public.membro_atual())::text);
create policy equipe_edita on public.pedidos for update to authenticated using (
  (select public.sou_gestor())
  or responsaveis ->> public.etapa_da_esteira(status, etapa_antes_desvio) = (select public.membro_atual())::text)
  with check (true);
create policy equipe_cria on public.pedidos for insert to authenticated with check ((select public.sou_gestor()));

-- Tabelas que pertencem a um pedido: enxergam o que a política do pedido deixa ver.
drop policy if exists equipe_le on public.pedido_itens;
drop policy if exists equipe_cria on public.pedido_itens;
drop policy if exists equipe_edita on public.pedido_itens;
create policy equipe_le on public.pedido_itens for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_cria on public.pedido_itens for insert to authenticated
  with check ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_edita on public.pedido_itens for update to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id))
  with check ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));

drop policy if exists equipe_le on public.pedido_eventos;
drop policy if exists equipe_nota on public.pedido_eventos;
create policy equipe_le on public.pedido_eventos for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_nota on public.pedido_eventos for insert to authenticated
  with check (tipo in ('nota', 'reiniciado') and ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id)));

drop policy if exists equipe_le on public.bipagens;
drop policy if exists equipe_cria on public.bipagens;
create policy equipe_le on public.bipagens for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_cria on public.bipagens for insert to authenticated
  with check ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));

drop policy if exists equipe_le on public.creditos_cliente;
create policy equipe_le on public.creditos_cliente for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));

drop policy if exists equipe_le on public.movimentos_financeiros;
create policy equipe_le on public.movimentos_financeiros for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));

drop policy if exists equipe_le on public.trocas;
drop policy if exists equipe_cria on public.trocas;
drop policy if exists equipe_altera on public.trocas;
create policy equipe_le on public.trocas for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_cria on public.trocas for insert to authenticated
  with check ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
create policy equipe_altera on public.trocas for update to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id))
  with check ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));

-- Peças, opções e escolhas da troca seguem a troca (a RLS da troca já filtra o exists).
drop policy if exists equipe_le on public.troca_pecas;
drop policy if exists equipe_cria on public.troca_pecas;
drop policy if exists equipe_altera on public.troca_pecas;
create policy equipe_le on public.troca_pecas for select to authenticated
  using (exists (select 1 from public.trocas t where t.id = troca_id));
create policy equipe_cria on public.troca_pecas for insert to authenticated
  with check (exists (select 1 from public.trocas t where t.id = troca_id));
create policy equipe_altera on public.troca_pecas for update to authenticated
  using (exists (select 1 from public.trocas t where t.id = troca_id))
  with check (exists (select 1 from public.trocas t where t.id = troca_id));

drop policy if exists equipe_le on public.troca_opcoes;
drop policy if exists equipe_cria on public.troca_opcoes;
drop policy if exists equipe_altera on public.troca_opcoes;
drop policy if exists equipe_apaga on public.troca_opcoes;
create policy equipe_le on public.troca_opcoes for select to authenticated
  using (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id));
create policy equipe_cria on public.troca_opcoes for insert to authenticated
  with check (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id));
create policy equipe_altera on public.troca_opcoes for update to authenticated
  using (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id))
  with check (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id));
create policy equipe_apaga on public.troca_opcoes for delete to authenticated
  using (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id));

drop policy if exists equipe_le on public.troca_escolhas;
create policy equipe_le on public.troca_escolhas for select to authenticated
  using (exists (select 1 from public.troca_pecas tp where tp.id = troca_peca_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Responsável padrão: quem cuida da etapa quando o pedido chega nela sem responsável.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.responsavel_padrao_de(p_etapa text) returns uuid
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select rp.membro_id from public.responsavel_padrao rp join public.equipe e on e.id = rp.membro_id and e.ativo
   where rp.etapa = p_etapa
$$;
revoke all on function public.responsavel_padrao_de(text) from public, anon;
grant execute on function public.responsavel_padrao_de(text) to authenticated, service_role;

-- Preenche, nos pedidos que já estão na esteira, a etapa atual sem responsável com o padrão dela. Só o gestor. Devolve quantos.
create or replace function public.preencher_responsaveis_padrao() returns integer
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare n integer;
begin
  perform public.exigir_gestor();
  with alvo as (
    select p.id, public.etapa_da_esteira(p.status, p.etapa_antes_desvio) as etapa
      from public.pedidos p where p.excluido_em is null),
  novo as (
    select a.id, a.etapa, public.responsavel_padrao_de(a.etapa) as membro
      from alvo a join public.pedidos p on p.id = a.id
     where a.etapa is not null and coalesce(p.responsaveis ->> a.etapa, '') = ''),
  feito as (
    update public.pedidos p set responsaveis = jsonb_set(p.responsaveis, array[n.etapa], to_jsonb(n.membro::text))
      from novo n where p.id = n.id and n.membro is not null returning 1)
  select count(*) into n from feito;
  return n;
end $$;
revoke all on function public.preencher_responsaveis_padrao() from public, anon;
grant execute on function public.preencher_responsaveis_padrao() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Gatilho dos pedidos (cópia de 20261125130000_embalagem_e_frete.sql): ao entrar numa etapa sem responsável, preenche com o padrão.
-- ---------------------------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------------------------
-- Funções que mexem em pedido: cópias das vigentes com a conferência na primeira linha (e marcar_pecas passa a security
-- definer: depois de avançar o pedido ele pode sair da vista de quem marcou, e a resposta precisa continuar completa).
-- ---------------------------------------------------------------------------------------------------------------
-- mover_etapa
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
end $function$;

-- marcar_pecas
CREATE OR REPLACE FUNCTION public.marcar_pecas(p_pedido uuid, p_marcas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p public.pedidos%rowtype;
  v_ids uuid[];
  v_ignoradas uuid[];
  v_m jsonb;
  v_evt bigint;
  r record;
begin
  perform public.exigir_pedido(p_pedido);
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
end $function$;

-- encontrar_peca
CREATE OR REPLACE FUNCTION public.encontrar_peca(p_item uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido uuid;
  v_status text;
  r record;
begin
  perform public.exigir_pedido_do_item(p_item);
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
end $function$;

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
  perform public.exigir_pedido_do_item(p_item);
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
end $function$;

-- sair_do_desvio
CREATE OR REPLACE FUNCTION public.sair_do_desvio(p_pedido uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  p public.pedidos%rowtype;
  c record;
  v_ordem text[] := array['separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio'];
  v_origem text;
  v_destino text := 'separacao';
  v_regras jsonb;
  v_acerto boolean := false;
  v_cand text;
  v_aberta boolean;
begin
  perform public.exigir_pedido(p_pedido);
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p.status not in ('avisar_cliente','aguardando_cliente') then return p.status; end if;
  -- V114: com peça ainda em falta/defeito o pedido não sai do aviso (senão o avanço das peças o devolveria a
  -- "Avisar cliente" e perderia o "Aguardando cliente").
  if exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('falta','defeito')) then
    return p.status;
  end if;
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
end $function$;

-- marcar_devolvido
CREATE OR REPLACE FUNCTION public.marcar_devolvido(p_pedido uuid, p_desfazer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  p public.pedidos%rowtype;
  v_ids uuid[];
  v_textids text[];
  v_valor numeric := 0;
  v_atual record;
  v_mov record;
begin
  perform public.exigir_pedido(p_pedido);
  select * into p from public.pedidos where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select array_agg(i.id) into v_ids from public.pedido_itens i
    left join public.pedidos s on s.id=i.venda_origem_id
    where i.pedido_id=p.id and i.status='removido' and i.observacao='cliente desistiu'
      and coalesce(s.pago_em,p.pago_em) is not null and i.removido_em>=coalesce(s.pago_em,p.pago_em)
      and i.reembolsado_shopify_em is null
      and (case when coalesce(p_desfazer,false) then i.devolvido_em is not null else i.devolvido_em is null end);
  if v_ids is null then return; end if;
  select total_pago,total_geral into v_atual from public.v_pedidos where id=p.id;
  if v_atual.total_pago is null or v_atual.total_pago<0 or v_atual.total_geral<0 then
    raise exception 'Confira os valores incoerentes do pedido antes de registrar a devolução';
  end if;
  if not coalesce(p_desfazer,false) then
    select a_devolver into v_valor from public.v_pedidos where id=p.id;
    if coalesce(v_valor,0)<=0 then return; end if;
    update public.pedido_itens set devolvido_em=now() where id=any(v_ids);
    insert into public.movimentos_financeiros(pedido_id,tipo,valor,detalhes,usuario_email)
      values(p.id,'devolucao',-v_valor,jsonb_build_object('itens',to_jsonb(v_ids)),public.usuario_atual_email());
    insert into public.pedido_eventos(pedido_id,tipo,texto,usuario_email)
      values(p.id,'devolvido','Devolvido à cliente: R$ '||replace(v_valor::numeric(10,2)::text,'.',','),public.usuario_atual_email());
  else
    v_textids := array(select x::text from unnest(v_ids) x);
    if exists(select 1 from unnest(v_ids) x where not exists(
      select 1 from public.movimentos_financeiros m where m.pedido_id=p.id and m.tipo='devolucao'
        and m.detalhes->'itens' ? x::text
        and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id))) then
      raise exception 'Esta devolução é anterior ao controle de movimentos. Confira os valores antes de desfazer.';
    end if;
    for v_mov in select * from public.movimentos_financeiros m where m.pedido_id=p.id and m.tipo='devolucao'
      and m.detalhes->'itens' ?| v_textids
      and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id)
      order by m.id loop
      if exists(select 1 from public.pedido_itens i where v_mov.detalhes->'itens' ? i.id::text and i.reembolsado_shopify_em is not null) then
        raise exception 'Este lote inclui reembolso na Shopify. Confira o valor antes de desfazer.';
      end if;
      insert into public.movimentos_financeiros(pedido_id,tipo,valor,estorna_id,detalhes,usuario_email)
        values(p.id,'estorno',-v_mov.valor,v_mov.id,v_mov.detalhes,public.usuario_atual_email());
      v_valor := v_valor-v_mov.valor;
    end loop;
    update public.pedido_itens set devolvido_em=null where id=any(v_ids);
    insert into public.pedido_eventos(pedido_id,tipo,texto,usuario_email)
      values(p.id,'devolvido_desfeito','Devolução desfeita: voltou a devolver R$ '||replace(v_valor::numeric(10,2)::text,'.',','),public.usuario_atual_email());
  end if;
  perform public.reconciliar_acertos(p.id,p.acerto_troca_id);
end $function$;

-- corrigir_frete_pedido
CREATE OR REPLACE FUNCTION public.corrigir_frete_pedido(p_pedido uuid, p_pago_por text, p_cobrado numeric DEFAULT NULL::numeric, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v public.pedidos%rowtype;
  v_dados public.pedidos%rowtype;
  v_financeiro_mudou boolean;
  v_principal text;
  v_cobrado numeric(10,2);
  v_antes_conta numeric(10,2);
  v_depois_conta numeric(10,2);
  v_delta numeric(10,2);
  v_pago_novo numeric(10,2);
  a record;
  d record;
  v_texto text;
begin
  perform public.exigir_pedido(p_pedido);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do pedido inválidos.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_dados) as k(campo) where campo not in (
    'cliente_nome','cliente_telefone','cliente_email','cliente_cpf','entrega_cep','entrega_logradouro',
    'entrega_numero','entrega_complemento','entrega_bairro','entrega_cidade','entrega_uf','frete_tipo','frete_custo')) then
    raise exception 'Campo não permitido na correção dos dados do pedido.';
  end if;
  if p_pago_por is null or p_pago_por not in ('cliente', 'arvenne') then
    raise exception 'Escolha quem paga o frete: cliente ou Arvenne.';
  end if;
  if p_pago_por = 'cliente' then
    if p_cobrado is null then raise exception 'Informe o frete que a cliente pagou.'; end if;
    if p_cobrado < 0 or p_cobrado >= 100000000 then raise exception 'O frete que a cliente pagou não pode ser negativo.'; end if;
    v_cobrado := round(p_cobrado, 2);
  else
    v_cobrado := 0; -- frete grátis: nada do frete entra na conta da cliente
  end if;

  select * into v from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v.status = 'somada' then
    select numero into v_principal from public.pedidos where id = v.somar_em;
    raise exception 'Esta venda foi somada ao pedido %. Corrija o frete no pedido principal.', coalesce(v_principal, '');
  end if;
  if v.status in ('em_aberto', 'aguardando_pagamento') then
    raise exception 'A venda ainda não foi paga: ajuste o frete no formulário da venda.';
  end if;
  if v.status in ('enviado', 'cancelado', 'perdida') then
    raise exception 'O pedido já está no Arquivo: o frete pago não pode mais ser corrigido.';
  end if;
  if v.origem = 'shopify' then
    raise exception 'O frete de pedido da Shopify vem da loja e não é corrigido aqui.';
  end if;
  if v.pago_em is null or v.valor_pago is null then
    raise exception 'Este pedido não tem valor pago registrado: confira o pagamento antes de corrigir o frete.';
  end if;

  select * into a from public.v_pedidos where id = p_pedido;
  if a.total_pago is null or public.saldo_financeiro(p_pedido) is null then
    raise exception 'Este pedido tem acerto antigo sem controle de movimentos: confira os valores antes de corrigir o frete.';
  end if;

  v_antes_conta := case when v.frete_pago_por = 'cliente' then coalesce(v.frete_cobrado, 0) else 0 end;
  v_depois_conta := v_cobrado;
  v_delta := v_depois_conta - v_antes_conta;
  v_financeiro_mudou := v.frete_pago_por is distinct from p_pago_por or coalesce(v.frete_cobrado, 0) <> v_cobrado;
  if not v_financeiro_mudou and p_dados = '{}'::jsonb then
    return; -- nada mudou
  end if;
  v_pago_novo := v.valor_pago + v_delta;
  if v_pago_novo < 0 then
    raise exception 'Com este frete o valor pago ficaria negativo (R$ %). Confira os valores.', to_char(v_pago_novo, 'FM990.00');
  end if;

  -- Cliente, endereço, tipo e custo do frete acompanham a correção financeira na mesma transação.
  -- Só os campos da lista acima são aceitos; status, pagamento e vínculos não vêm do navegador.
  v_dados := jsonb_populate_record(v, p_dados);
  update public.pedidos
     set frete_pago_por = p_pago_por, frete_cobrado = v_cobrado, valor_pago = v_pago_novo,
         cliente_nome = v_dados.cliente_nome, cliente_telefone = v_dados.cliente_telefone,
         cliente_email = v_dados.cliente_email, cliente_cpf = v_dados.cliente_cpf,
         entrega_cep = v_dados.entrega_cep, entrega_logradouro = v_dados.entrega_logradouro,
         entrega_numero = v_dados.entrega_numero, entrega_complemento = v_dados.entrega_complemento,
         entrega_bairro = v_dados.entrega_bairro, entrega_cidade = v_dados.entrega_cidade,
         entrega_uf = v_dados.entrega_uf, frete_tipo = v_dados.frete_tipo, frete_custo = v_dados.frete_custo
   where id = p_pedido;

  -- O saldo, o que falta devolver e o acerto têm de ficar exatamente como estavam (a diferença do frete
  -- entra de um lado e do outro). Se não fecharem, nada é gravado.
  select * into d from public.v_pedidos where id = p_pedido;
  if d.total_pago is null or d.total_pago < 0 or d.total_geral < 0
     or public.saldo_financeiro(p_pedido) is null
     or abs(public.saldo_financeiro(p_pedido) - (a.total_geral - a.total_pago + a.a_devolver)) > 0.004
     or d.a_devolver is distinct from a.a_devolver
     or d.acerto_pendente is distinct from a.acerto_pendente then
    raise exception 'Não foi possível corrigir o frete mantendo o acerto do pedido. Nada foi alterado.';
  end if;

  if v_financeiro_mudou then
    v_texto := 'Frete corrigido: '
    || case v.frete_pago_por when 'cliente' then 'cliente pagou R$ ' || replace(to_char(v_antes_conta, 'FM999999990.00'), '.', ',')
                             when 'arvenne' then 'Arvenne pagou (frete grátis)' else 'sem registro' end
    || ' → '
    || case p_pago_por when 'cliente' then 'cliente pagou R$ ' || replace(to_char(v_cobrado, 'FM999999990.00'), '.', ',')
                       else 'Arvenne paga (frete grátis)' end
    || ' · valor pago R$ ' || replace(to_char(v.valor_pago, 'FM999999990.00'), '.', ',')
    || ' → R$ ' || replace(to_char(v_pago_novo, 'FM999999990.00'), '.', ',');
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (p_pedido, 'nota', v_texto, public.usuario_atual_email());
  end if;
  if v_dados.frete_tipo is distinct from v.frete_tipo or v_dados.frete_custo is distinct from v.frete_custo then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (p_pedido, 'nota', 'Frete alterado: ' || coalesce(v.frete_tipo, '—') || ' → ' || coalesce(v_dados.frete_tipo, '—')
      || case when v_dados.frete_custo is not null then ' · custo R$ ' || replace(to_char(v_dados.frete_custo, 'FM999999990.00'), '.', ',') else '' end,
      public.usuario_atual_email());
  end if;
end $function$;

-- registrar_credito
CREATE OR REPLACE FUNCTION public.registrar_credito(p_troca uuid, p_destino text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_t trocas%rowtype;
  v_valor numeric;
  v_id uuid;
begin
  perform public.exigir_pedido_da_troca(p_troca);
  if p_destino is null or p_destino not in ('reembolso', 'proximo_pedido') then
    raise exception 'Destino do crédito inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  if v_t.acerto_status is distinct from 'pendente' then raise exception 'Este acerto já foi registrado'; end if;
  perform public.troca_acerto(p_troca, 'credito_registrado'); -- valida o saldo e grava o movimento
  select -m.valor into v_valor from movimentos_financeiros m
   where m.troca_id = p_troca and m.tipo = 'troca_credito'
     and not exists (select 1 from movimentos_financeiros e where e.estorna_id = m.id)
   order by m.id desc limit 1;
  if v_valor is null or v_valor <= 0 then raise exception 'Não há crédito a registrar neste pedido'; end if;
  insert into creditos_cliente (troca_id, pedido_id, destino, valor, registrado_por)
  values (p_troca, v_t.pedido_id, p_destino, v_valor, public.usuario_atual_email())
  returning id into v_id;
  insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
  values (v_t.pedido_id, 'troca_acerto', 'credito_registrado',
          case p_destino when 'reembolso' then 'reembolso_pendente' else 'credito_guardado' end,
          case p_destino
            when 'reembolso' then 'Crédito para reembolsar: R$ '
            else 'Crédito guardado para o próximo pedido: R$ ' end
            || replace(v_valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email());
  return v_id;
end $function$;

-- usar_credito
CREATE OR REPLACE FUNCTION public.usar_credito(p_credito uuid, p_pedido uuid, p_desfazer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v creditos_cliente%rowtype;
  v_numero text;
  v_origem text;
begin
  perform public.exigir_pedido(p_pedido);
  select * into v from creditos_cliente where id = p_credito and cancelado_em is null for update;
  if not found then raise exception 'Crédito não encontrado'; end if;
  if v.destino <> 'proximo_pedido' then raise exception 'Este crédito é de reembolso, não para o próximo pedido'; end if;
  select numero into v_numero from pedidos where id = p_pedido;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select numero into v_origem from pedidos where id = v.pedido_id;
  if coalesce(p_desfazer, false) then
    if v.usado_pedido_id is distinct from p_pedido then raise exception 'Este crédito não foi usado neste pedido'; end if;
    update creditos_cliente set usado_em = null, usado_pedido_id = null, usado_por = null where id = v.id;
  else
    if v.usado_em is not null then raise exception 'Este crédito já foi usado'; end if;
    if p_pedido = v.pedido_id then raise exception 'O crédito é para outro pedido da cliente'; end if;
    if not exists (select 1 from pedidos a, pedidos b where a.id = p_pedido and b.id = v.pedido_id and public.mesma_cliente(a, b)) then
      raise exception 'Este crédito é de outra cliente';
    end if;
    update creditos_cliente set usado_em = now(), usado_pedido_id = p_pedido, usado_por = public.usuario_atual_email() where id = v.id;
  end if;
  insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (v.pedido_id, 'nota',
          case when p_desfazer then 'Uso do crédito desfeito no pedido ' || v_numero || ': R$ '
               else 'Crédito usado no pedido ' || v_numero || ': R$ ' end || replace(v.valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email()),
         (p_pedido, 'nota',
          case when p_desfazer then 'Desfeito: crédito do pedido ' || v_origem || ' (R$ '
               else 'Usado crédito do pedido ' || v_origem || ' (R$ ' end || replace(v.valor::numeric(10,2)::text, '.', ',') || ')',
          public.usuario_atual_email());
end $function$;

-- marcar_reembolsado
CREATE OR REPLACE FUNCTION public.marcar_reembolsado(p_credito uuid, p_desfazer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v creditos_cliente%rowtype;
begin
  perform public.exigir_pedido_do_credito(p_credito);
  select * into v from creditos_cliente where id = p_credito and cancelado_em is null for update;
  if not found then raise exception 'Crédito não encontrado'; end if;
  if v.destino <> 'reembolso' then raise exception 'Este crédito é para o próximo pedido, não para reembolso'; end if;
  if coalesce(p_desfazer, false) then
    if v.reembolsado_em is null then return; end if;
    update creditos_cliente set reembolsado_em = null, reembolsado_por = null where id = v.id;
  else
    if v.reembolsado_em is not null then return; end if;
    update creditos_cliente set reembolsado_em = now(), reembolsado_por = public.usuario_atual_email() where id = v.id;
  end if;
  insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
  values (v.pedido_id, 'troca_acerto',
          case when p_desfazer then 'reembolsado' else 'reembolso_pendente' end,
          case when p_desfazer then 'reembolso_pendente' else 'reembolsado' end,
          case when p_desfazer then 'Reembolso desfeito: voltou a reembolsar R$ ' else 'Reembolsado à cliente: R$ ' end
            || replace(v.valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email());
end $function$;

-- troca_concluir_peca
CREATE OR REPLACE FUNCTION public.troca_concluir_peca(p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text, p_versao timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  v_ped_status text;
  v_sem_preco int;
begin
  perform public.exigir_pedido_da_troca(p_troca);
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

  perform public.fechar_financeiro(v_t.pedido_id);

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

  if p_tipo = 'opcao' then
    select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = v_t.pedido_id;
    v_observacao := null;
    -- Uma linha nova por peça do carrinho (na ordem em que a cliente montou).
    for v_e in
      select o.id, e.qtd, o.origem, o.shopify_variant_id, o.peca_clube_id, o.sku, o.nome, o.variante, o.foto_url, o.preco
        from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
       where e.troca_peca_id = v_p.id order by e.seq
    loop
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
        variante, foto_url, qtd, preco, ordem, observacao, adicional, venda_origem_id, troca_peca_origem_id, valor_pago_linha, preco_pago)
      values (v_t.pedido_id, case when v_e.origem = 'site' then 'shopify' else 'clube' end,
        v_e.shopify_variant_id, v_e.peca_clube_id, v_e.sku, v_e.nome, v_e.variante, v_e.foto_url,
        v_e.qtd, v_e.preco, v_ordem, 'troca de ' || coalesce(v_i.sku, v_i.nome),
        v_i.adicional,v_i.venda_origem_id,v_p.id,
        (select round(v_e.qtd*x.valor_unit,2) from v_troca_valores x where x.opcao_id=v_e.id),
        (select x.valor_unit from v_troca_valores x where x.opcao_id=v_e.id));
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
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null and i.status in ('falta','defeito')) then
    -- Acerto: pendente se a troca deixou diferença (a cobrar ou crédito), senão sem diferença.
    update trocas set status = 'concluida', concluida_em = now(),
      acerto_status = case when abs(public.troca_saldo_liquido(v_t.id)) < 0.005
                           then 'sem_diferenca' else 'pendente' end
    where id = v_t.id;
  end if;
  if not exists (select 1 from pedido_itens where pedido_id = v_t.pedido_id and status in ('falta', 'defeito')) then
    -- V37: volta para a etapa de onde veio o desvio (peça nova de troca entra pendente: aí é a Separação).
    perform public.sair_do_desvio(v_t.pedido_id);
  end if;
  return true;
end $function$;

-- troca_carrinho_definir
CREATE OR REPLACE FUNCTION public.troca_carrinho_definir(p_peca uuid, p_opcao uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_qtd int;
  v_concluida timestamptz;
  v_status text;
begin
  perform public.exigir_pedido_da_peca_troca(p_peca);
  select i.qtd, p.concluida_em, t.status into v_qtd, v_concluida, v_status
    from troca_pecas p join pedido_itens i on i.id = p.item_id join trocas t on t.id = p.troca_id
   where p.id = p_peca for update of p;
  if not found then raise exception 'Peça da troca não encontrada'; end if;
  if v_concluida is not null or v_status in ('concluida', 'cancelada') then
    raise exception 'Esta troca já foi concluída ou cancelada; a escolha não pode mudar';
  end if;
  if p_opcao is not null and not exists (select 1 from troca_opcoes o where o.id = p_opcao and o.troca_peca_id = p_peca) then
    raise exception 'Esta opção não pertence a esta peça';
  end if;
  perform set_config('arvenne.sem_recalculo', '1', true);
  if p_opcao is not null then
    insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values (p_peca, p_opcao, v_qtd)
      on conflict (troca_peca_id, opcao_id) do update set qtd = excluded.qtd;
  end if;
  delete from troca_escolhas where troca_peca_id = p_peca and opcao_id is distinct from p_opcao;
  perform set_config('arvenne.sem_recalculo', '', true);
end $function$;

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
  perform public.exigir_gestor();
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
end $function$;

-- excluir_pedido
CREATE OR REPLACE FUNCTION public.excluir_pedido(p_pedido uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v record;
  v_quem text := public.usuario_atual_email();
  v_principal text;
begin
  perform public.exigir_gestor();
  select * into v from pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if v.status = 'somada' then
    select numero into v_principal from pedidos where id = v.somar_em;
    raise exception 'Esta venda foi somada ao pedido %. Exclua o pedido %: ela vai junto.',
      coalesce(v_principal, ''), coalesce(v_principal, '');
  end if;
  if not (
       (v.origem = 'whatsapp' and v.status in ('em_aberto', 'aguardando_pagamento') and v.pago_em is null)
    or v.status in ('enviado', 'cancelado', 'perdida')
  ) then
    raise exception 'Só dá para excluir venda ainda não paga ou pedido do Arquivo.';
  end if;

  -- O pedido e as vendas somadas a ele (saem juntas).
  if exists (select 1 from trocas t where t.status <> 'cancelada'
              and t.pedido_id in (select p_pedido union all select s.id from pedidos s where s.somar_em = p_pedido)) then
    raise exception 'Este pedido tem troca registrada e não pode ser excluído.';
  end if;
  if exists (select 1 from movimentos_financeiros m
              where m.pedido_id in (select p_pedido union all select s.id from pedidos s where s.somar_em = p_pedido)) then
    raise exception 'Este pedido tem acerto em dinheiro registrado e não pode ser excluído.';
  end if;
  if exists (select 1 from creditos_cliente c where c.cancelado_em is null
              and (c.pedido_id = p_pedido or c.usado_pedido_id = p_pedido
                   or c.pedido_id in (select s.id from pedidos s where s.somar_em = p_pedido)
                   or c.usado_pedido_id in (select s.id from pedidos s where s.somar_em = p_pedido))) then
    raise exception 'Este pedido tem crédito da cliente registrado e não pode ser excluído.';
  end if;

  update pedidos set excluido_em = now(), excluido_por = v_quem
   where (id = p_pedido or somar_em = p_pedido) and excluido_em is null;
  insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
  select id, 'nota', 'Pedido excluído', v_quem from pedidos where id = p_pedido or somar_em = p_pedido;
end $function$;

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
  perform public.exigir_gestor();
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
end $function$;

