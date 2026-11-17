-- Etapa "Frete" depois da Embalagem e Time Arvenne com responsável por etapa (pedido do Gustavo, 17/11/2026).
--
-- 1) Nova esteira: ... Bipagem → Nota fiscal → Embalagem → Frete → Postagem → Enviado.
--    O frete só pode ser gerado depois de pesar a caixa fechada, então a etapa Frete vem depois da Embalagem
--    e o app passa a guardar o peso da caixa (pedidos.frete_peso_g, em gramas). A etapa "Nota e frete"
--    (status 'faturamento') vira só "Nota fiscal" (nota + pedido do fornecedor).
-- 2) Time: tabela equipe (nome + e-mail opcional do login) e pedidos.responsaveis (jsonb etapa → pessoa),
--    gravado pela função designar(). Nada é apagado: pessoa é desativada, não excluída.
--
-- As funções abaixo são cópias das últimas versões (arquivo de origem no comentário de cada uma); só entrou
-- 'frete' entre 'embalagem' e 'pronto_envio' e as regras da nova ordem. Grants e revokes foram mantidos.
-- Este projeto não dá GRANT automático: tudo que é novo leva GRANT explícito (anon nada; sem DELETE).
-- Dados: nenhum pedido está em embalagem/pronto_envio hoje, então não há o que converter.

-- ---------------------------------------------------------------------------
-- 1a. Status 'frete' e peso da caixa
-- ---------------------------------------------------------------------------
-- Última versão do check: 20261115110000_venda_somada.sql.
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem', 'bipagem',
  'faturamento', 'embalagem', 'frete', 'pronto_envio', 'enviado', 'cancelado', 'somada'));

-- Etapa de origem do desvio (20261120090000_trocas_visiveis.sql) também pode ser 'frete'.
alter table public.pedidos drop constraint if exists pedidos_etapa_antes_desvio_check;
alter table public.pedidos add constraint pedidos_etapa_antes_desvio_check check (etapa_antes_desvio is null or
  etapa_antes_desvio in ('separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio'));

-- Peso da caixa fechada, em gramas (nulo = ainda não pesada). Entre 1 g e 30 kg.
alter table public.pedidos add column frete_peso_g int check (frete_peso_g between 1 and 30000);
comment on column public.pedidos.frete_peso_g is 'Peso da caixa fechada em gramas, usado para gerar o frete na Frenet.';

-- ---------------------------------------------------------------------------
-- 1b. Regras da esteira (cópia de 20261118170000_retornar_trabalho_reaberto.sql)
-- ---------------------------------------------------------------------------
create or replace function public.regras_etapas(p jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = public, pg_temp as $$
declare
  v_destino text;
  v_motivo text;
  v_resultado jsonb := '{}'::jsonb;
  v_status text := p->>'status';
  v_linhas int := coalesce((p->>'linhas')::int,0);
  v_pecas int := coalesce((p->>'pecas')::int,0);
begin
  foreach v_destino in array array['em_aberto','aguardando_pagamento','perdida','novo','separacao',
    'avisar_cliente','aguardando_cliente','conferencia','etiquetagem','bipagem','faturamento',
    'embalagem','frete','pronto_envio','enviado','cancelado','somada'] loop
    v_motivo := null;
    if v_destino=v_status and not coalesce((p->>'inserindo')::boolean,false)
       and v_status not in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio') then
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
    elsif v_destino in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio','enviado') then
      if v_linhas=0 then
        v_motivo := 'Este pedido não tem peças para expedir.';
      elsif coalesce((p->>'encontradas')::int,0)<>v_linhas then
        v_motivo := 'Conclua a separação: há peça pendente, em falta ou com defeito.';
      elsif v_destino in ('etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio','enviado')
        and coalesce((p->>'conferidas')::int,0)<>v_linhas then
        v_motivo := 'Confira todas as peças antes desta etapa.';
      elsif v_destino in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviado')
        and coalesce((p->>'etiquetadas')::int,0)<>v_linhas then
        v_motivo := 'Etiquete todas as peças antes desta etapa.';
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
        v_motivo := 'Confirme a postagem antes de marcar como enviado.';
      end if;
    end if;
    v_resultado := v_resultado || jsonb_build_object(v_destino,v_motivo);
  end loop;
  return v_resultado;
end $$;
revoke all on function public.regras_etapas(jsonb) from public, anon;
grant execute on function public.regras_etapas(jsonb) to authenticated, service_role;

-- Cópia de 20261119190000_gatilhos_leves.sql: 'frete' entre embalagem e pronto_envio.
-- Frete volta para a Embalagem quando não vale mais; a Postagem volta para o Frete.
create or replace function public.reavaliar_etapa(p_pedido uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_destino text;
  v_regras jsonb;
  v_nivel int;
  v_acerto boolean := false;
begin
  select * into p from public.pedidos where id=p_pedido for update;
  v_nivel := array_position(array['conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio'],p.status);
  if v_nivel is null then return; end if;
  select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
    (count(*) filter (where status='encontrado'))::int as encontradas,
    (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
    (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
    coalesce(sum(qtd_bipada),0)::int as bipadas into c
  from public.pedido_itens where pedido_id=p_pedido and status<>'removido';
  -- O acerto pendente só decide se "frete" e "pronto para envio" voltam para trás.
  if v_nivel>=6 then select acerto_pendente into v_acerto from public.v_pedidos where id=p_pedido; end if;
  v_regras := public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
    'conferidas',c.conferidas,'etiquetadas',c.etiquetadas,'bipadas',c.bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false)));
  if v_regras->>'conferencia' is not null then
    v_destino := case when exists (select 1 from public.pedido_itens
      where pedido_id=p_pedido and status in ('falta','defeito')) then 'avisar_cliente' else 'separacao' end;
  elsif v_nivel>=2 and v_regras->>'etiquetagem' is not null then v_destino := 'conferencia';
  elsif v_nivel>=3 and v_regras->>'bipagem' is not null then v_destino := 'etiquetagem';
  elsif v_nivel>=4 and v_regras->>'faturamento' is not null then v_destino := 'bipagem';
  elsif v_nivel>=5 and v_regras->>'embalagem' is not null then v_destino := 'faturamento';
  elsif v_nivel>=6 and v_regras->>'frete' is not null then v_destino := 'embalagem';
  elsif v_nivel>=7 and v_regras->>'pronto_envio' is not null then v_destino := 'frete';
  end if;
  if v_destino is not null and v_destino<>p.status then
    update public.pedidos set status=v_destino where id=p_pedido;
  end if;
end $$;
revoke all on function public.reavaliar_etapa(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1c. Gatilho de etapa (cópia de 20261118160000_travas_etapas.sql): lê o acerto também em 'frete'
-- ---------------------------------------------------------------------------
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
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    if new.status='somada' and (new.somar_em is null or new.somada_em is null
        or new.somada_valor is null or new.somada_retrato is null) then
      raise exception 'Use a operação de somar a venda: faltam o vínculo e o retrato da compra';
    end if;
    select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into v
    from public.pedido_itens where pedido_id=new.id and status<>'removido';
    if new.status in ('embalagem','frete','pronto_envio','enviado') then
      select acerto_pendente into v_acerto from public.v_pedidos where id=new.id;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',case when tg_op='INSERT' then new.status else old.status end,'inserindo',tg_op='INSERT',
      'linhas',v.linhas,'pecas',v.pecas,'encontradas',v.encontradas,'conferidas',v.conferidas,
      'etiquetadas',v.etiquetadas,'bipadas',v.bipadas,'nota',new.nf_emitida_em,
      'frete',new.frete_gerado_em,'fornecedor',new.pedido_fornecedor_em,'embalado',new.embalado_em,
      'postado',new.postado_em,'acerto',coalesce(v_acerto,false)));
    v_motivo := coalesce(v_regras->>new.status,case when not v_regras ? new.status then 'Etapa inválida' end);
    if v_motivo is not null then raise exception '%',v_motivo; end if;
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
      end if;
    end if;
  end if;
  if new.pago_em is null
     and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
    new.pago_em := now();
  end if;
  return new;
end $function$;
revoke all on function public.tg_pedidos_antes() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1d. Peças e etapas: 'frete' entra nas listas de status
-- ---------------------------------------------------------------------------
-- alterar_item e marcar_falta: cópias de 20261120130000_acao_item_atomica.sql.
create or replace function public.alterar_item(p_item uuid, p_campos jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
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
    if v_problemas and v_p.status in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_p.id and status not in ('avisar_cliente','aguardando_cliente');
    elsif not v_problemas and v_p.status in ('avisar_cliente','aguardando_cliente') then
      perform public.sair_do_desvio(v_p.id);
    elsif v_p.status='novo' and p_campos->>'status'='encontrado' then
      update public.pedidos set status='separacao' where id=v_p.id and status='novo';
    end if;
  end if;
end;
$$;
revoke all on function public.alterar_item(uuid,jsonb) from public, anon;
grant execute on function public.alterar_item(uuid,jsonb) to authenticated, service_role;

-- A falta parcial também termina com o desvio gravado, conservando a etapa anterior à divisão.
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
    if v_ped in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio') then
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
  if v_ped in ('novo','separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio') then
    update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
    update public.pedidos set etapa_antes_desvio=case when v_ped='novo' then 'separacao' else v_ped end
      where id=v_i.pedido_id;
  end if;
  return v_novo;
end $function$;

revoke all on function public.marcar_falta(uuid,integer,text) from public, anon;
grant execute on function public.marcar_falta(uuid,integer,text) to authenticated, service_role;

-- substituir_item: cópia de 20261118150000_substituicao_atomica.sql.
create or replace function public.substituir_item(p_item uuid, p_itens jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
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
    and status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio');
  return v_t;
end $$;
revoke all on function public.substituir_item(uuid,jsonb) from public, anon;
grant execute on function public.substituir_item(uuid,jsonb) to authenticated;

-- somar_venda: cópia de 20261118100000_retrato_venda_somada.sql.
create or replace function public.somar_venda(p_venda uuid, p_forma text, p_valor numeric, p_pago_em timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  if pr.status in ('conferencia', 'etiquetagem', 'bipagem', 'faturamento', 'embalagem', 'frete', 'pronto_envio') then
    update public.pedidos set status = 'separacao' where id = pr.id;
  end if;

  -- A tela não escreve eventos 'venda_somada' (RLS só deixa nota/reiniciado): por isso a função é security
  -- definer; o GRANT abaixo é só para authenticated.
  insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (pr.id, 'venda_somada', 'Venda ' || v.numero || ' somada a este pedido.', public.usuario_atual_email()),
         (p_venda, 'venda_somada', 'Somada ao pedido ' || pr.numero || '.', public.usuario_atual_email());
end $$;
revoke all on function public.somar_venda(uuid, text, numeric, timestamptz) from public, anon;
grant execute on function public.somar_venda(uuid, text, numeric, timestamptz) to authenticated;

-- listar_inconsistencias: cópia de 20261119170000_calendario_feriados.sql.
create or replace function public.listar_inconsistencias()
returns table (pedido_id uuid, numero text, regra text, detalhe text)
language sql stable security invoker set search_path = public, pg_temp as $$
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
   where v.status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio','enviado')
     and exists (
       select 1 from public.pedido_itens i where i.pedido_id = v.id and i.status <> 'removido'
         and (i.status <> 'encontrado'
              or (v.status in ('etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio','enviado') and i.conferido_em is null)
              or (v.status in ('bipagem','faturamento','embalagem','frete','pronto_envio','enviado') and i.etiquetado_em is null)
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
revoke all on function public.listar_inconsistencias() from public, anon;
grant execute on function public.listar_inconsistencias() to authenticated, service_role;

-- Desvio (avisar/aguardando cliente): cópias de 20261120090000_trocas_visiveis.sql.
create or replace function public.tg_etapa_antes_desvio() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('avisar_cliente','aguardando_cliente') then
    if old.status in ('avisar_cliente','aguardando_cliente') then
      new.etapa_antes_desvio := coalesce(new.etapa_antes_desvio, old.etapa_antes_desvio);
    else
      new.etapa_antes_desvio := case
        when old.status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio') then old.status
        else 'separacao' end;
    end if;
  else
    new.etapa_antes_desvio := null;
  end if;
  return new;
end $$;
revoke all on function public.tg_etapa_antes_desvio() from public, anon, authenticated, service_role;

create or replace function public.sair_do_desvio(p_pedido uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_ordem text[] := array['separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio'];
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
  select exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('pendente','falta','defeito'))
    into v_aberta;
  if not v_aberta and v_origem <> 'separacao' then
    select count(*)::int as linhas, coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into c
    from public.pedido_itens where pedido_id = p_pedido and status <> 'removido';
    if array_position(v_ordem, v_origem) >= 6 then
      select acerto_pendente into v_acerto from public.v_pedidos where id = p_pedido;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
      'conferidas',c.conferidas,'etiquetadas',c.etiquetadas,'bipadas',c.bipadas,
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
  return (select status from public.pedidos where id = p_pedido);
end $$;
revoke all on function public.sair_do_desvio(uuid) from public, anon;
grant execute on function public.sair_do_desvio(uuid) to authenticated;

-- reiniciar_pedido: cópia de 20261118130000_preservar_devolucao_no_reinicio.sql. A etapa 'frete' é própria:
-- reiniciar o frete limpa o frete gerado e o peso; reiniciar a nota fiscal ('faturamento') limpa só a nota e o
-- pedido do fornecedor (o frete vem depois: o pedido volta à etapa mais cedo pelas regras da esteira).
create or replace function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_etapas text[] := case when p_tudo
    then array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem',
               'bipagem', 'faturamento', 'embalagem', 'frete', 'pronto_envio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_etiq  boolean := 'etiquetagem' = any(v_etapas);
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
      etiquetado_em   = case when v_pecas or v_etiq then null else etiquetado_em end,
      etiqueta_previa = case when v_pecas or v_etiq then false else etiqueta_previa end,
      qtd_bipada      = case when v_pecas or v_bip then 0 else qtd_bipada end,
      bipado_em       = case when v_pecas or v_bip then null else bipado_em end
   where pedido_id = p_pedido and status <> 'removido'
     and (v_pecas or v_conf or v_etiq or v_bip);
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
revoke all on function public.reiniciar_pedido(uuid, text, boolean) from public, anon;
grant execute on function public.reiniciar_pedido(uuid, text, boolean) to authenticated;

-- importar_pedido_shopify: cópia de 20261119110000_valor_exato_linha_shopify.sql. Despachado na Shopify move
-- o pedido para "enviado" só a partir do Frete (com frete gerado) ou da Postagem; Embalagem e etapas
-- anteriores só ganham o alerta (a regra da esteira exige o frete gerado antes de enviar).
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        uuid;
  v_status    text;
  v_cancel    boolean := coalesce((p->>'cancelado')::boolean, false);
  v_reemb     boolean := coalesce((p->>'reembolsado')::boolean, false);
  v_desp      boolean := coalesce((p->>'despachado')::boolean, false);
  v_estimado  boolean := coalesce((p->>'pago_em_estimado')::boolean, false);
  v_codigos   text[];
  v_cupom     text;
  v_desc      numeric := nullif(p->>'desconto_valor', '')::numeric;
  v_frete     numeric := nullif(p->>'frete_cobrado', '')::numeric;
  v_titulo    text    := lower(coalesce(p->>'frete_titulo', ''));
  v_tipo      text;
  v_pagopor   text;
  v_mudou     boolean;
  v_cpf       text    := nullif(regexp_replace(coalesce(p->>'cliente_cpf', ''), '\D', '', 'g'), '');
  -- A sincronização nova manda o frete original e o cobrado já separados (valores exatos da Shopify).
  v_exato     boolean := p ? 'frete_original';
  v_fo        numeric := nullif(p->>'frete_original', '')::numeric;
  v_dfrete    numeric;
  v_total     numeric := nullif(p->>'valor_total', '')::numeric;
  v_pago      numeric := nullif(p->>'valor_pago', '')::numeric;
  v_n         int;
  v_texto     text;
begin
  select array_agg(x) into v_codigos from jsonb_array_elements_text(coalesce(p->'desconto_codigos', '[]'::jsonb)) x;
  v_cupom := nullif(array_to_string(v_codigos, ', '), '');
  if v_desc is not null and v_desc <= 0 then v_desc := null; end if;
  v_tipo := case
    when v_titulo = '' then null
    when v_titulo like '%sedex%' then 'SEDEX'
    when v_titulo like '%retirada%' then 'retirada'
    when v_titulo ~* '\mpac\M' then 'PAC'
    else 'outro' end;
  v_pagopor := case when v_frete is null then null when v_frete > 0 then 'cliente' else 'arvenne' end;
  v_dfrete := case when v_fo is not null and v_frete is not null then greatest(0, v_fo - v_frete) end;

  select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is null then
    -- Pedido novo: cancelado, reembolsado ou que já saiu antes de entrar no app não vira pedido.
    if v_cancel or v_reemb or v_desp then
      return false;
    end if;

    insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                         valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em, pago_em_estimado,
                         cliente_cpf, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                         entrega_bairro, entrega_cidade, entrega_uf,
                         desconto_tipo, desconto_valor, desconto_codigos, cupom,
                         frete_cobrado, frete_tipo, frete_pago_por, frete_original, desconto_frete,
                         forma_pagamento, valor_pago, shopify_bruto, rastreio, rastreio_url)
    values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
            p->>'cliente_email', v_total,
            (p->>'shopify_order_id')::bigint, p->>'shopify_url',
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()),
            v_estimado or nullif(p->>'pago_em', '') is null,
            v_cpf,
            nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), ''),
            nullif(p->>'entrega_logradouro', ''), nullif(p->>'entrega_numero', ''),
            nullif(p->>'entrega_complemento', ''), nullif(p->>'entrega_bairro', ''),
            nullif(p->>'entrega_cidade', ''), nullif(p->>'entrega_uf', ''),
            case when v_desc is not null then 'valor' end, v_desc, v_codigos, v_cupom,
            v_frete, v_tipo, v_pagopor, v_fo, v_dfrete,
            nullif(p->>'forma_pagamento', ''), v_pago,
            p->'shopify_bruto', nullif(p->>'rastreio', ''), nullif(p->>'rastreio_url', ''))
    on conflict (shopify_order_id) do nothing
    returning id into v_id;

    if v_id is not null then
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, shopify_line_id, sku, nome, variante,
                                foto_url, qtd, preco, preco_pago, valor_pago_linha, ordem)
      select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, nullif(i->>'shopify_line_id', ''),
             i->>'sku', i->>'nome',
             i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
             round(nullif(i->>'preco_pago', '')::numeric, 2),
             round(nullif(i->>'valor_pago_linha', '')::numeric, 2), ord::int
      from jsonb_array_elements(p->'itens') with ordinality as t(i, ord)
      where (i->>'qtd')::int > 0;
      return true;
    end if;

    -- Outra sincronização entrou na frente: segue como atualização, sem erro.
    select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;
    if v_id is null then return false; end if;
  end if;

  -- Já importado: completa só o que está nulo (a equipe pode ter editado), guarda a versão mais
  -- nova do pedido bruto e acompanha cancelamento, reembolso e despacho. Nunca volta etapa.
  update pedidos set
    cliente_cpf          = coalesce(cliente_cpf, v_cpf),
    entrega_cep          = coalesce(entrega_cep, nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), '')),
    entrega_logradouro   = coalesce(entrega_logradouro, nullif(p->>'entrega_logradouro', '')),
    entrega_numero       = coalesce(entrega_numero, nullif(p->>'entrega_numero', '')),
    entrega_complemento  = coalesce(entrega_complemento, nullif(p->>'entrega_complemento', '')),
    entrega_bairro       = coalesce(entrega_bairro, nullif(p->>'entrega_bairro', '')),
    entrega_cidade       = coalesce(entrega_cidade, nullif(p->>'entrega_cidade', '')),
    entrega_uf           = coalesce(entrega_uf, nullif(p->>'entrega_uf', '')),
    desconto_tipo        = case when desconto_tipo is null and v_desc is not null then 'valor' else desconto_tipo end,
    desconto_valor       = coalesce(desconto_valor, v_desc),
    desconto_codigos     = coalesce(desconto_codigos, v_codigos),
    cupom                = coalesce(cupom, v_cupom),
    frete_cobrado        = coalesce(frete_cobrado, v_frete),
    frete_tipo           = coalesce(frete_tipo, v_tipo),
    frete_pago_por       = coalesce(frete_pago_por, v_pagopor),
    forma_pagamento      = coalesce(forma_pagamento, nullif(p->>'forma_pagamento', '')),
    valor_pago           = coalesce(valor_pago, v_pago),
    rastreio             = coalesce(rastreio, nullif(p->>'rastreio', '')),
    rastreio_url         = coalesce(rastreio_url, nullif(p->>'rastreio_url', ''))
  where id = v_id
    and ((cliente_cpf is null and v_cpf is not null)
         or (entrega_cep is null and nullif(p->>'entrega_cep', '') is not null)
         or (entrega_logradouro is null and nullif(p->>'entrega_logradouro', '') is not null)
         or (entrega_numero is null and nullif(p->>'entrega_numero', '') is not null)
         or (entrega_cidade is null and nullif(p->>'entrega_cidade', '') is not null)
         or (entrega_uf is null and nullif(p->>'entrega_uf', '') is not null)
         or (entrega_bairro is null and nullif(p->>'entrega_bairro', '') is not null)
         or (entrega_complemento is null and nullif(p->>'entrega_complemento', '') is not null)
         or (desconto_valor is null and v_desc is not null)
         or (cupom is null and v_cupom is not null)
         or (frete_cobrado is null and v_frete is not null)
         or (frete_tipo is null and v_tipo is not null)
         or (frete_pago_por is null and v_pagopor is not null)
         or (desconto_codigos is null and v_codigos is not null)
         or (forma_pagamento is null and nullif(p->>'forma_pagamento', '') is not null)
         or (valor_pago is null and v_pago is not null)
         or (rastreio is null and nullif(p->>'rastreio', '') is not null)
         or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

  -- Dados da Shopify (a equipe não edita): o valor atual vence a cada sincronização.
  if v_total is not null then
    update pedidos set valor_total = v_total, valor_pago = coalesce(v_pago, valor_pago)
    where id = v_id and (valor_total is distinct from v_total or valor_pago is distinct from coalesce(v_pago, valor_pago));
  end if;

  -- Data real do pagamento chegou depois de uma data estimada: corrige uma vez.
  if not v_estimado and nullif(p->>'pago_em', '') is not null then
    update pedidos set pago_em = (p->>'pago_em')::timestamptz, pago_em_estimado = false
    where id = v_id and pago_em_estimado;
  end if;

  if v_exato then
    -- frete_pago_por NÃO é sobrescrito: a equipe pode ter corrigido quem paga o frete.
    update pedidos set
      frete_cobrado  = coalesce(v_frete, frete_cobrado),
      frete_original = v_fo,
      desconto_frete = v_dfrete,
      desconto_tipo  = case when v_desc is not null then 'valor' end,
      desconto_valor = v_desc
    where id = v_id
      and (frete_cobrado is distinct from coalesce(v_frete, frete_cobrado)
           or frete_original is distinct from v_fo
           or desconto_frete is distinct from v_dfrete
           or desconto_valor is distinct from v_desc
           or desconto_tipo is distinct from case when v_desc is not null then 'valor' end);
  end if;

  if p ? 'itens' then
    -- Preço pago por linha da Shopify. Linhas antigas (sem id) casam pela variante só quando ela
    -- aparece uma vez no pedido da Shopify e uma vez no app.
    with src as (
      select nullif(x->>'shopify_line_id', '') as linha,
             nullif(x->>'shopify_variant_id', '')::bigint as variante,
             round(nullif(x->>'preco_pago', '')::numeric, 2) as pago,
             round(nullif(x->>'valor_pago_linha', '')::numeric, 2) as valor_linha,
             nullif(x->>'qtd', '')::int as qtd,
             count(*) over (partition by nullif(x->>'shopify_variant_id', '')) as n_var
      from jsonb_array_elements(p->'itens') x
    )
    update pedido_itens i
       set preco_pago = s.pago,
           valor_pago_linha = public.valor_linha_shopify(i, s.linha, s.qtd, s.valor_linha),
           shopify_line_id = coalesce(i.shopify_line_id, s.linha)
      from src s
     where i.pedido_id = v_id and i.origem = 'shopify'
       and coalesce(i.observacao, '') not like 'troca de%'
       and s.pago is not null
       and ((s.linha is not null and i.shopify_line_id = s.linha)
            or (i.shopify_line_id is null and s.n_var = 1 and s.variante is not null
                and i.shopify_variant_id = s.variante
                and (select count(*) from pedido_itens y
                      where y.pedido_id = v_id and y.origem = 'shopify' and y.shopify_line_id is null
                        and coalesce(y.observacao, '') not like 'troca de%'
                        and y.shopify_variant_id = s.variante) = 1))
       and (i.preco_pago is distinct from s.pago or (i.shopify_line_id is null and s.linha is not null)
            or i.valor_pago_linha is distinct from public.valor_linha_shopify(i, s.linha, s.qtd, s.valor_linha));

    -- Peça removida pela equipe (cliente desistiu) e reembolsada na Shopify: a linha voltou com quantidade 0.
    -- O valor_total atual já desconta; marca para sair do valor_removido e conta como devolvida.
    update pedido_itens i
       set reembolsado_shopify_em = now(),
           devolvido_em = coalesce(i.devolvido_em, now())
      from jsonb_array_elements(p->'itens') x
     where i.pedido_id = v_id and i.status = 'removido' and i.reembolsado_shopify_em is null
       and i.shopify_line_id is not null
       and i.shopify_line_id = nullif(x->>'shopify_line_id', '')
       and coalesce((x->>'qtd')::int, 0) = 0;

    -- Quantidade por variante/SKU diferente das peças da Shopify (inclui as removidas pela equipe, para não
    -- dar alarme falso; ignora peças de troca e as que a equipe acrescentou): avisa uma vez.
    if not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alterado') then
      select exists (
        select 1 from (
          select coalesce(i->>'shopify_variant_id', 'sku:' || coalesce(i->>'sku', '')) as chave, sum((i->>'qtd')::int) as qtd
          from jsonb_array_elements(p->'itens') i where (i->>'qtd')::int > 0 group by 1
        ) s full join (
          select coalesce(shopify_variant_id::text, 'sku:' || coalesce(sku, '')) as chave, sum(qtd) as qtd
          from pedido_itens l
          where l.pedido_id = v_id and l.origem = 'shopify' and coalesce(l.observacao, '') not like 'troca de%'
            and (l.shopify_line_id is not null
                 or not exists (select 1 from pedido_itens z where z.pedido_id = v_id and z.shopify_line_id is not null))
          group by 1
        ) l using (chave)
        where s.qtd is distinct from l.qtd
      ) into v_mudou;
      if v_mudou then
        insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
        values (v_id, 'shopify_alterado', 'As peças do pedido mudaram na Shopify depois da importação.', 'shopify');
      end if;
    end if;
  end if;

  if p ? 'shopify_bruto' then
    update pedidos set shopify_bruto = p->'shopify_bruto'
    where id = v_id and shopify_bruto is distinct from p->'shopify_bruto';
  end if;

  if v_cancel or v_reemb then
    update pedidos set status = 'cancelado'
    where id = v_id and status not in ('cancelado', 'enviado');
    get diagnostics v_n = row_count;
    if v_reemb then
      -- Aviso uma vez só (a sincronização repete a cada poucos minutos).
      v_texto := case
        when v_n > 0 then 'Pedido reembolsado na Shopify: cancelado automaticamente.'
        when v_status = 'enviado' then 'Pedido reembolsado na Shopify, mas já foi enviado. Confira.'
        else 'Pedido reembolsado na Shopify.' end;
      insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
      select v_id, 'shopify_alerta', v_texto, 'shopify'
      where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                         and texto like 'Pedido reembolsado na Shopify%');
    end if;
  elsif v_desp and (v_status = 'pronto_envio'
        or (v_status = 'frete' and exists (select 1 from pedidos where id = v_id and frete_gerado_em is not null))) then
    -- Só move para "enviado" de onde a regra da esteira permite: frete já gerado ou pronto para envio.
    update pedidos set status = 'enviado',
           postado_em = coalesce(postado_em, nullif(p->>'postado_em', '')::timestamptz, now())
    where id = v_id and status in ('frete', 'pronto_envio');
  elsif v_desp and v_status not in ('enviado', 'cancelado', 'perdida', 'em_aberto', 'aguardando_pagamento') then
    -- Despachado na Shopify antes de o frete estar gerado (embalagem ou etapas anteriores): não move o pedido,
    -- só avisa (uma vez).
    v_texto := 'A Shopify marcou este pedido como enviado, mas ele ainda está em "' || v_status || '". Confira.';
    insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
    select v_id, 'shopify_alerta', v_texto, 'shopify'
    where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                       and texto like 'A Shopify marcou este pedido como enviado%');
  end if;
  return false;
end $$;

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;

-- tg_pedidos_depois: cópia de 20261112091000_eventos_analise.sql (search_path de 20261120110000); o evento
-- "frete_gerado" passa a levar o peso da caixa no texto.
create or replace function public.tg_pedidos_depois() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
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

  return null;
end $$;
revoke all on function public.tg_pedidos_depois() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Time Arvenne
-- ---------------------------------------------------------------------------
create table public.equipe (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(btrim(nome)) between 1 and 60),
  email      text check (email is null or char_length(btrim(email)) between 3 and 200),
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
-- O e-mail liga a pessoa ao login ("Comigo" na Expedição); não pode repetir.
create unique index equipe_email_unico on public.equipe (lower(email)) where email is not null;

alter table public.equipe enable row level security;
create policy equipe_le on public.equipe for select to authenticated using (true);
create policy equipe_cria on public.equipe for insert to authenticated with check (true);
create policy equipe_edita on public.equipe for update to authenticated using (true) with check (true);
-- Sem DELETE: a pessoa é desativada (ativo = false) e continua aparecendo no que já fez.
revoke all on public.equipe from public, anon, authenticated;
grant select, insert, update on public.equipe to authenticated;
grant select on public.equipe to service_role;

-- O tempo real avisa as telas abertas quando alguém mexe no time (sem dado na mensagem).
create trigger avisar_ins after insert on public.equipe referencing new table as novos
  for each statement execute function public.tg_avisar_mudanca('');
create trigger avisar_upd after update on public.equipe referencing old table as antigos new table as novos
  for each statement execute function public.tg_avisar_mudanca('');

-- Quem faz cada etapa do pedido: { "<etapa>": "<equipe.id>" }. Só a função designar() grava.
alter table public.pedidos add column responsaveis jsonb not null default '{}'::jsonb
  check (jsonb_typeof(responsaveis) = 'object');
comment on column public.pedidos.responsaveis is
  'Responsável por etapa: { etapa: equipe.id }. Etapas: separacao, conferencia, etiquetagem, bipagem, faturamento, embalagem, frete, pronto_envio.';

-- Evento novo "designado" (última versão do check: 20261119160000_historico_carrinho_troca.sql).
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado', 'troca_acerto',
  'devolvido', 'devolvido_desfeito', 'shopify_alerta', 'venda_somada', 'troca_carrinho', 'designado']));

-- Designar (ou tirar, com p_membro nulo) a pessoa de uma etapa. O evento é escrito aqui (a tela só registra
-- nota/reiniciado). Sem mudança, não grava nada.
create function public.designar(p_pedido uuid, p_etapa text, p_membro uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p public.pedidos%rowtype;
  v_nome text;
  v_atual text;
begin
  if p_etapa is null or p_etapa not in ('separacao','conferencia','etiquetagem','bipagem','faturamento',
                                        'embalagem','frete','pronto_envio') then
    raise exception 'Etapa inválida';
  end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_p.status not in ('novo','separacao','avisar_cliente','aguardando_cliente','conferencia','etiquetagem',
                        'bipagem','faturamento','embalagem','frete','pronto_envio') then
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
end $$;
revoke all on function public.designar(uuid, text, uuid) from public, anon;
grant execute on function public.designar(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. v_pedidos: cópia de 20261120090000_trocas_visiveis.sql; colunas novas SÓ no fim (peso da caixa e
--    responsáveis, lidos junto com o pedido; nenhum join novo).
-- ---------------------------------------------------------------------------
create or replace view public.v_pedidos
with (security_invoker = true) as
select
  p.id, p.numero, p.origem, p.status, p.status_desde,
  p.cliente_nome, p.cliente_telefone, p.cliente_email, p.valor_total,
  p.shopify_order_id, p.shopify_url, p.carrinho_url, p.rastreio, p.observacoes,
  p.pedido_em, p.created_at, p.updated_at,
  p.cliente_id, p.cliente_cpf,
  p.entrega_cep, p.entrega_logradouro, p.entrega_numero, p.entrega_complemento,
  p.entrega_bairro, p.entrega_cidade, p.entrega_uf,
  p.desconto_tipo, p.desconto_valor, p.cupom, p.desconto_codigos,
  p.frete_tipo, p.frete_pago_por, p.frete_cobrado, p.frete_custo,
  p.forma_pagamento, p.valor_pago, p.pago_em, p.data_compra, p.token_publico,
  p.nf_numero, p.nf_emitida_em, p.frete_gerado_em, p.frete_servico, p.rastreio_url,
  p.pedido_fornecedor_numero, p.pedido_fornecedor_em,
  p.embalado_em, p.postado_em, p.rastreio_enviado_em,
  coalesce((retr.r->>'subtotal')::numeric(10,2), a.subtotal) as subtotal,
  coalesce((retr.r->>'qtd_pecas')::int, a.qtd_pecas) as qtd_pecas,
  coalesce((retr.r->>'qtd_linhas')::int, a.qtd_linhas) as qtd_linhas, a.qtd_encontradas, a.qtd_problemas,
  a.qtd_conferidas, a.qtd_etiquetadas, a.qtd_bipadas, coalesce(retr.r->'fotos', a.fotos) as fotos,
  coalesce((retr.r->>'desconto')::numeric(10,2), (case when fx.v is not null then a.subtotal-fx.v-pix.v else d.desconto+cb.v end)::numeric(10,2))                                                     as desconto,
  coalesce((retr.r->>'frete_cobrado')::numeric(10,2), d.frete_na_conta) as frete_na_conta,
  d.fase,
  -- Pedido da Shopify: o que a Shopify cobrou (valor atual) + diferença das trocas - peças que a cliente
  -- tirou depois de pagar. Venda manual: soma das peças.
  coalesce((retr.r->>'total')::numeric(10,2), tot.v)                                                                                  as total,
  coalesce((retr.r->>'valor_pecas_com_desconto')::numeric(10,2), coalesce(fx.v,a.subtotal-d.desconto-cb.v-pix.v)::numeric(10,2))                                as valor_pecas_com_desconto,
  (d.frete_na_conta - p.frete_custo)::numeric(10,2)                                      as frete_diferenca,
  (p.origem <> 'shopify' and p.status = 'enviado' and p.rastreio_enviado_em is null)     as pendente_rastreio,
  pz.prazo                                                                               as prazo,
  ph.horas                                                                               as prazo_horas_uteis,
  -- Colunas novas SEMPRE no fim: create or replace view não deixa mudar a ordem das antigas.
  p.cliente_razao_social,
  p.cliente_ie,
  coalesce((retr.r->>'desconto_pix')::numeric(10,2), pix.v)                                                                                  as desconto_pix,
  p.frete_original,
  p.desconto_frete,
  ap.pendente                                                                         as acerto_pendente,
  dev.v                                                                                  as a_devolver,
  (case when p.origem = 'shopify' then rem.total else 0 end)::numeric(10,2)              as valor_removido,
  cb.v                                                                                   as troca_coberto,
  ad.qtd                                                                                 as qtd_adicionais,
  sm.valor                                                                               as valor_somado,
  sm.pago                                                                                as valor_pago_somado,
  coalesce((retr.r->>'total_geral')::numeric(10,2), (tot.v + sm.valor)::numeric(10,2))                                                      as total_geral,
  sm.partes,
  p.somar_em,
  p.somada_em,
  -- Total pago: pagamento do pedido + pagamentos das vendas somadas (soma no banco, não na tela).
  (case when mf.legado or p.valor_pago is null then null
        else coalesce(p.valor_pago,0)+sm.pago+mf.valor end)::numeric(10,2)                    as total_pago,
  -- Venda somada: número do pedido principal, para a lista e o Arquivo mostrarem "Somada a ARV-1274".
  (select x.numero from public.pedidos x where x.id = p.somar_em)                        as somada_a_numero,
  public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',a.qtd_linhas,'pecas',a.qtd_pecas,'encontradas',a.qtd_encontradas,
    'conferidas',a.qtd_conferidas,'etiquetadas',a.qtd_etiquetadas,'bipadas',a.qtd_bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',ap.pendente)) as etapas_permitidas,
  -- V13: valor declarado do pacote inteiro (pedido + vendas somadas), já com descontos e trocas.
  (coalesce((retr.r->>'valor_pecas_com_desconto')::numeric(10,2), coalesce(fx.v,a.subtotal-d.desconto-cb.v-pix.v)::numeric(10,2))
    + sm.valor)::numeric(10,2) as valor_pecas_pacote,
  -- V37/V38: etapa de origem do desvio; desconto sem a cobertura da loja (a cobertura vai à parte em
  -- troca_coberto); o percentual sobre o subtotal; e o motivo dos descontos da Shopify.
  p.etapa_antes_desvio,
  dsc.sem_cobertura as desconto_sem_cobertura,
  dpc.pct as desconto_percentual,
  p.descontos,
  p.frete_peso_g,
  p.responsaveis
from public.pedidos p
cross join lateral (
  select case when p.status='somada' then p.somada_retrato end as r offset 0
) retr
-- Fator das peças sem preço pago (peças de troca): o da troca mais recente.
cross join lateral (
  select case when p.origem = 'shopify'
              then coalesce((select t.fator_desconto from public.trocas t
                              where t.pedido_id = p.id order by t.created_at desc limit 1), 1)
              else 1 end as f
  offset 0
) fr
cross join lateral (
  select
    coalesce(sum(i.qtd * coalesce(i.preco, 0)) filter (where not i.adicional), 0)::numeric(10,2) as subtotal,
    coalesce(sum(i.qtd), 0)::int                                                           as qtd_pecas,
    count(i.id)::int                                                                       as qtd_linhas,
    (count(i.id) filter (where i.status = 'encontrado'))::int                              as qtd_encontradas,
    (count(i.id) filter (where i.status in ('falta', 'defeito')))::int                     as qtd_problemas,
    (count(i.id) filter (where i.status = 'encontrado' and i.conferido_em is not null))::int as qtd_conferidas,
    (count(i.id) filter (where i.status = 'encontrado' and i.etiquetado_em is not null))::int as qtd_etiquetadas,
    coalesce(sum(i.qtd_bipada), 0)::int                                                    as qtd_bipadas,
    coalesce((
      select jsonb_agg(f.foto_url)
      from (select x.foto_url from public.pedido_itens x
            where x.pedido_id = p.id and x.status <> 'removido' and x.foto_url is not null
            order by x.ordem limit 3) f
    ), '[]'::jsonb)                                                                        as fotos,
    (count(i.preco_pago) filter (where not i.adicional))::int                              as n_pago,
    coalesce(sum(coalesce(i.valor_pago_linha,round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2))) filter (where not i.adicional), 0) as pago_vivo
  from public.pedido_itens i
  where i.pedido_id = p.id and i.status <> 'removido'
) a
cross join lateral (
  select
    -- Shopify com preço pago por linha: desconto = peças vivas a preço cheio - o que a cliente pagou por elas
    -- (assim subtotal - desconto + frete = total). Sem preço pago, vale o desconto registrado.
    (case when p.origem = 'shopify' and a.n_pago > 0
          then greatest(0, a.subtotal - a.pago_vivo)
          else least(a.subtotal, case p.desconto_tipo
            when 'percentual' then round(a.subtotal * coalesce(p.desconto_valor, 0) / 100, 2)
            when 'valor'      then coalesce(p.desconto_valor, 0)
            else 0 end) end)::numeric(10,2)                                                as desconto,
    (case when p.frete_pago_por = 'cliente' then coalesce(p.frete_cobrado, 0) else 0 end)::numeric(10,2) as frete_na_conta,
    case
      when p.status in ('em_aberto', 'aguardando_pagamento') then 'venda'
      when p.status in ('enviado', 'cancelado', 'perdida', 'somada') then 'arquivo'
      else 'expedicao' end                                                                 as fase
  offset 0
) d

cross join lateral (
  select coalesce(sum(li.valor_liquido),0)::numeric(10,2) as total,
    coalesce(sum(li.valor_liquido) filter(where i.devolvido_em is null),0)::numeric(10,2) as pendente,
    (count(*) filter(where i.devolvido_em is null))::int as n_pendente
  from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
  where i.pedido_id=p.id and not i.adicional and i.status='removido' and i.observacao='cliente desistiu'
    and p.pago_em is not null and i.removido_em>=p.pago_em and i.reembolsado_shopify_em is null
) rem
cross join lateral (
  select coalesce(sum(tp.resultado_diferenca),0) as dif,
    coalesce(sum(tp.resultado_diferenca) filter (where not (coalesce(p.financeiro_retrato->'trocas','[]'::jsonb) ? tp.id::text)),0) as dif_nova
  from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
  join public.pedido_itens i on i.id=tp.item_id
  where t.pedido_id=p.id and tp.concluida_em is not null and t.status<>'cancelada' and not i.adicional
) sh
cross join lateral (
  select coalesce(sum(coberto),0)::numeric(10,2) as v from public.v_cobertura_troca_peca
  where pedido_id=p.id and venda_origem_id is null
  offset 0
) cb
cross join lateral (
  -- Peças adicionais (vieram de uma venda somada): só a quantidade; o dinheiro delas fica nas partes.
  select coalesce(sum(i.qtd), 0)::int as qtd
  from public.pedido_itens i
  where i.pedido_id = p.id and i.adicional and i.status <> 'removido'
) ad
cross join lateral (
  -- Vendas somadas a este pedido (uma linha por venda, em ordem de pagamento).
  select
    coalesce(sum(pv.valor_atual), 0)::numeric(10,2) as valor,
    coalesce(sum(s.valor_pago), 0)::numeric(10,2)   as pago,
    coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'numero', s.numero, 'pago_em', s.pago_em, 'forma_pagamento', s.forma_pagamento,
        'valor_pago', s.valor_pago, 'somada_valor', pv.valor_atual,
        'qtd_pecas', (select coalesce(sum(x.qtd), 0)::int from public.pedido_itens x
                       where x.venda_origem_id = s.id and x.pedido_id = p.id and x.status <> 'removido'))
      order by s.somada_em, s.numero), '[]'::jsonb) as partes
  from public.pedidos s join public.v_parte_somada pv on pv.venda_id=s.id
  where s.somar_em = p.id and s.somada_em is not null
) sm
cross join lateral (
  select case when p.origem='whatsapp' and p.financeiro_retrato is not null then
    (p.financeiro_retrato->>'mercadorias')::numeric + sh.dif_nova
    - (cb.v-(p.financeiro_retrato->>'cobertura')::numeric)
    - (rem.total-(p.financeiro_retrato->>'retirado')::numeric) end as v offset 0
) fx
cross join lateral (
  -- Pix: 10% sobre o valor cheio das peças (frete fora), somado ao desconto/cupom existente.
  -- Só vendas do WhatsApp pagas no Pix; nunca passa do que sobra depois do desconto.
  select case when p.origem = 'whatsapp' and p.forma_pagamento = 'Pix'
              then least(round(a.subtotal * 0.10, 2), a.subtotal - d.desconto,
                case when fx.v is not null then greatest(0,a.subtotal-fx.v) else a.subtotal end)
              else 0 end::numeric(10,2) as v
  offset 0
) pix
cross join lateral (
  select (case when fx.v is not null then fx.v + d.frete_na_conta
               when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total - cb.v
               else a.subtotal - d.desconto - cb.v - pix.v + d.frete_na_conta end)::numeric(10,2) as v
  offset 0
) tot
cross join lateral (
  select coalesce((select sum(valor) from public.movimentos_financeiros where pedido_id=p.id),0) as valor,
    exists(select 1 from public.trocas t where t.pedido_id=p.id and t.status<>'cancelada'
      and not t.acerto_controle_novo and t.acerto_status in ('recebido','credito_registrado')) as legado
  offset 0
) mf
cross join lateral (
  select coalesce(sum(li.valor_liquido),0) as pendente,count(*)::int as n_pendente
  from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
  join public.pedidos origem on origem.id=i.venda_origem_id
  where i.pedido_id=p.id and i.adicional and i.status='removido' and i.observacao='cliente desistiu'
    and origem.pago_em is not null and i.removido_em>=origem.pago_em
    and i.devolvido_em is null and i.reembolsado_shopify_em is null
) ra
cross join lateral (
  select case when p.valor_pago is not null and not mf.legado then p.valor_pago+sm.pago+mf.valor end as disponivel
  offset 0
) caixa
cross join lateral (
  -- Só reserva a retirada efetiva: outros créditos continuam no acerto final, sem dupla devolução.
  select (case when p.status in ('perdida','somada') or caixa.disponivel is null
                    or caixa.disponivel<0 or tot.v+sm.valor<0 then 0
    when rem.n_pendente+ra.n_pendente>0 then
      least(rem.pendente+ra.pendente,caixa.disponivel,greatest(0,caixa.disponivel-tot.v-sm.valor))
    else 0 end)::numeric(10,2) as v
  offset 0
) dev
cross join lateral (
  select (exists (select 1 from public.trocas ta where ta.pedido_id=p.id
                  and ta.status<>'cancelada' and ta.acerto_status='pendente') or dev.v>0) as pendente offset 0
) ap
cross join lateral (
  select case when d.fase = 'expedicao' then public.prazo_envio(p.pago_em) end as prazo
  offset 0
) pz
cross join lateral (
  select case when pz.prazo > now() then public.horas_uteis(now(), pz.prazo) end as horas
  offset 0
) ph
cross join lateral (
  select greatest(0, coalesce((retr.r->>'desconto')::numeric(10,2),
      (case when fx.v is not null then a.subtotal-fx.v-pix.v else d.desconto+cb.v end)::numeric(10,2)) - cb.v)::numeric(10,2) as sem_cobertura,
    coalesce((retr.r->>'subtotal')::numeric(10,2), a.subtotal) as base
  offset 0
) dsc
cross join lateral (
  select (case when dsc.base > 0 then round(dsc.sem_cobertura * 100 / dsc.base, 1) end)::numeric(5,1) as pct offset 0
) dpc;

revoke all on public.v_pedidos from anon;
grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;
