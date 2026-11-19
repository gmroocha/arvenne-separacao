-- V114: peça em falta (ou com defeito) na Separação não leva o pedido para "Avisar cliente" na hora.
-- Pedido do Gustavo (19/11/2026): a separadora marca a primeira peça como falta e o pedido sumia da Separação antes de
-- ela terminar as outras. Agora o pedido só vai para "Avisar cliente" quando há peça em falta/defeito E nenhuma peça
-- pendente (todas encontradas, em falta ou retiradas). Enquanto houver peça pendente, ele fica na Separação.
-- Na Conferência e na Bipagem todas as peças já foram encontradas, então lá a falta continua abrindo o aviso na hora.
-- Recria (cópia da última versão de cada uma, só com a regra nova): alterar_item e marcar_falta (20261122180000_esteira_leve)
-- e avancar_pecas (20261125130000_embalagem_e_frete); sair_do_desvio no fim. CREATE OR REPLACE mantém os GRANTs existentes.

-- alterar_item
CREATE OR REPLACE FUNCTION public.alterar_item(p_item uuid, p_campos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p public.pedidos%rowtype;
  v_problemas boolean;
  v_pendentes boolean;
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
    select exists(select 1 from public.pedido_itens where pedido_id=v_p.id and status='pendente') into v_pendentes;
    if v_problemas and not v_pendentes
       and v_p.status in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio') then
      update public.pedidos set status='avisar_cliente' where id=v_p.id and status not in ('avisar_cliente','aguardando_cliente');
    elsif v_problemas and v_pendentes and v_p.status='novo' then
      -- Falta marcada com peças ainda por separar: o pedido entra na Separação e espera as outras peças.
      update public.pedidos set status='separacao' where id=v_p.id and status='novo';
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
  v_pendentes boolean;
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
    if v_ped in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio') then
      select exists(select 1 from pedido_itens where pedido_id=v_i.pedido_id and status='pendente') into v_pendentes;
      if not v_pendentes then
        update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
      elsif v_ped='novo' then
        update public.pedidos set status='separacao' where id=v_i.pedido_id;
      end if;
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
  if v_ped in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio') then
    select exists(select 1 from pedido_itens where pedido_id=v_i.pedido_id and status='pendente') into v_pendentes;
    if not v_pendentes then
      update public.pedidos set status='avisar_cliente' where id=v_i.pedido_id;
      update public.pedidos set etapa_antes_desvio=case when v_ped='novo' then 'separacao' else v_ped end
        where id=v_i.pedido_id;
    elsif v_ped='novo' then
      update public.pedidos set status='separacao' where id=v_i.pedido_id;
    end if;
  end if;
  return v_novo;
end $function$
;

-- avancar_pecas: quando a última peça pendente é encontrada (lote marcar_pecas) e há peça em falta/defeito,
-- o pedido vai para "Avisar cliente" em vez de ficar parado na Separação.
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
  if p.status in ('novo','separacao','conferencia','bipagem')
     and exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('falta','defeito'))
     and not exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status = 'pendente') then
    update public.pedidos set status = 'avisar_cliente' where id = p_pedido;
    return 'avisar_cliente';
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

-- sair_do_desvio: não sai do aviso com peça ainda em falta/defeito; sem 'frete' na ordem (etapa única desde
-- 20261125130000_embalagem_e_frete). Cópia da versão de 20261122180000_esteira_leve com essas duas mudanças.
create or replace function public.sair_do_desvio(p_pedido uuid) returns text
language plpgsql security definer set search_path to 'public','pg_temp' as $$
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
end $$;
