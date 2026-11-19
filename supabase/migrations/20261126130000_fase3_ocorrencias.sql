-- Fase 3 (19/11/2026): quem fez cada passo da peça e as ocorrências (erro na bipagem, falta indevida, problema na entrega).
--
-- Decisão do Gustavo: as colaboradoras ainda não têm login, então quase tudo é clicado por ele. Para a métrica já sair útil,
-- "quem fez o passo" = o responsável da etapa no pedido (pedidos.responsaveis ->> etapa); sem responsável, quem clicou
-- (membro_atual()). Tudo numa função só: autor_da_etapa. Quando todas tiverem login a funcionária só vê o pedido em que é
-- responsável e os dois valores coincidem. As métricas de hoje ficam no nome dele e serão zeradas depois.
--
-- 1. pedido_itens guarda só o ÚLTIMO autor de cada passo (separado_por, conferido_por, bipado_por, falta_por); nada de histórico
--    clique a clique. O lote marcar_pecas grava e limpa no mesmo update; um gatilho de linha mínimo limpa o autor sempre que o passo
--    some (mover etapa, reiniciar, falta na linha inteira), sem recriar essas funções.
-- 2. ocorrencias: registros leves (RLS: lê quem vê o pedido; escreve só por função; anular só gestor). Nada é apagado.
-- 3. Cópias das funções vigentes: marcar_pecas (20261126100000), alterar_item e marcar_falta (20261125153000).
--    encontrar_peca chama alterar_item, então a falta indevida vale também por ela.

alter table public.pedido_itens
  add column separado_por uuid references public.equipe(id) on delete set null,
  add column conferido_por uuid references public.equipe(id) on delete set null,
  add column bipado_por uuid references public.equipe(id) on delete set null,
  add column falta_por uuid references public.equipe(id) on delete set null;
create index pedido_itens_separado_por on public.pedido_itens (separado_por) where separado_por is not null;
create index pedido_itens_conferido_por on public.pedido_itens (conferido_por) where conferido_por is not null;
create index pedido_itens_bipado_por on public.pedido_itens (bipado_por) where bipado_por is not null;
create index pedido_itens_falta_por on public.pedido_itens (falta_por) where falta_por is not null;
comment on column public.pedido_itens.separado_por is 'Quem separou a peça (autor_da_etapa na separação). Limpo quando a peça volta a pendente.';
comment on column public.pedido_itens.conferido_por is 'Quem conferiu a peça. Limpo quando a conferência é desfeita.';
comment on column public.pedido_itens.bipado_por is 'Quem bipou a peça por último. Limpo quando a contagem volta a zero.';
comment on column public.pedido_itens.falta_por is 'Quem marcou a peça como falta ou defeito. Limpo quando ela deixa de estar em falta.';

-- Quem fez um passo do pedido: o responsável da etapa, se houver; senão quem clicou. Nulo para o sistema (cron, gatilhos).
create or replace function public.autor_da_etapa(p_pedido uuid, p_etapa text) returns uuid
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(
    (select e.id from public.pedidos p join public.equipe e on e.id::text = p.responsaveis ->> p_etapa where p.id = p_pedido),
    public.membro_atual())
$$;
revoke all on function public.autor_da_etapa(uuid, text) from public, anon;
grant execute on function public.autor_da_etapa(uuid, text) to authenticated, service_role;

-- O autor só existe enquanto o passo existe (peça desfeita, falta resolvida, bipagem zerada).
create or replace function public.tg_itens_limpa_por() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if new.status is distinct from 'encontrado' then new.separado_por := null; end if;
  if new.conferido_em is null then new.conferido_por := null; end if;
  if coalesce(new.qtd_bipada, 0) <= 0 then new.bipado_por := null; end if;
  if new.status not in ('falta', 'defeito') then new.falta_por := null; end if;
  return new;
end $$;
revoke all on function public.tg_itens_limpa_por() from public, anon, authenticated;
create trigger itens_limpa_por before update on public.pedido_itens
  for each row execute function public.tg_itens_limpa_por();

-- ---------------------------------------------------------------------------------------------------------------
-- Ocorrências
-- ---------------------------------------------------------------------------------------------------------------
create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  item_id uuid references public.pedido_itens(id) on delete set null,
  tipo text not null check (tipo in ('erro_bipagem', 'falta_indevida', 'problema_entrega')),
  motivo text not null,
  -- etapa onde o erro nasceu (erro na bipagem e falta indevida: a separação; problema na entrega: a escolhida)
  etapa text not null check (etapa in ('separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio')),
  responsavel_id uuid references public.equipe(id) on delete set null,
  conferente_id uuid references public.equipe(id) on delete set null,
  registrado_por text,
  observacao text,
  created_at timestamptz not null default now(),
  anulada_em timestamptz,
  anulada_por text,
  constraint ocorrencias_motivo check (
    (tipo = 'erro_bipagem' and motivo in ('peca_incorreta','quantidade_incorreta','peca_defeito','peca_suja','outro'))
    or (tipo = 'falta_indevida' and motivo = 'peca_encontrada')
    or (tipo = 'problema_entrega' and motivo in ('peca_errada','quantidade_errada','peca_defeito','peca_suja','nota_errada','endereco_errado','envio_errado','outro'))),
  constraint ocorrencias_outro_com_obs check (motivo <> 'outro' or length(btrim(coalesce(observacao, ''))) > 0)
);
create index ocorrencias_pedido on public.ocorrencias (pedido_id, created_at desc);
create index ocorrencias_responsavel on public.ocorrencias (responsavel_id, created_at desc);
create index ocorrencias_item on public.ocorrencias (item_id) where item_id is not null;
create index ocorrencias_conferente on public.ocorrencias (conferente_id) where conferente_id is not null;

alter table public.ocorrencias enable row level security;
create policy ocorrencias_le on public.ocorrencias for select to authenticated
  using ((select public.sou_gestor()) or public.pode_ver_pedido(pedido_id));
-- Sem política de insert, update ou delete: só as funções abaixo (security definer) escrevem.
revoke all on public.ocorrencias from public, anon, authenticated;
grant select on public.ocorrencias to authenticated, service_role;

create or replace function public.etapa_da_ocorrencia(p_motivo text) returns text
language sql immutable set search_path to 'public','pg_temp' as $$
  select case
    when p_motivo in ('peca_errada','quantidade_errada','peca_defeito','peca_suja') then 'bipagem'
    when p_motivo = 'nota_errada' then 'faturamento'
    when p_motivo in ('endereco_errado','envio_errado') then 'embalagem'
  end
$$;
revoke all on function public.etapa_da_ocorrencia(text) from public, anon;
grant execute on function public.etapa_da_ocorrencia(text) to authenticated, service_role;

-- Texto curto do histórico do pedido (aba Histórico) para cada ocorrência.
create or replace function public.rotulo_motivo(p_motivo text) returns text
language sql immutable set search_path to 'public','pg_temp' as $$
  select case p_motivo
    when 'peca_incorreta' then 'peça incorreta' when 'quantidade_incorreta' then 'quantidade incorreta'
    when 'peca_defeito' then 'peça com defeito' when 'peca_suja' then 'peça suja'
    when 'peca_errada' then 'peça errada' when 'quantidade_errada' then 'quantidade errada'
    when 'nota_errada' then 'nota errada' when 'endereco_errado' then 'endereço errado'
    when 'envio_errado' then 'envio errado' when 'peca_encontrada' then 'peça existia'
    else 'outro' end
$$;
revoke all on function public.rotulo_motivo(text) from public, anon;
grant execute on function public.rotulo_motivo(text) to authenticated, service_role;

create or replace function public.registrado_por_atual() returns text
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(public.membro_atual()::text, nullif(public.usuario_atual_email(), 'sistema'), 'sistema')
$$;
revoke all on function public.registrado_por_atual() from public, anon;
grant execute on function public.registrado_por_atual() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Cópias das funções vigentes, com os autores dos passos
-- ---------------------------------------------------------------------------------------------------------------
-- marcar_pecas (cópia de 20261126100000_visibilidade_pedidos)
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
  v_sep uuid;
  v_conf uuid;
  v_bip uuid;
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

  -- Quem fez cada passo: o responsável da etapa no pedido, ou quem clicou (autor_da_etapa). Grava quando o passo é marcado e
  -- limpa quando é desfeito, no mesmo update do lote (o gatilho itens_limpa_por garante a limpeza em qualquer outro caminho).
  v_sep := public.autor_da_etapa(p_pedido, 'separacao');
  v_conf := public.autor_da_etapa(p_pedido, 'conferencia');
  v_bip := public.autor_da_etapa(p_pedido, 'bipagem');
  perform set_config('arvenne.lote', '1', true);
  update public.pedido_itens i set
      status = c.st, conferido_em = c.cf, etiquetado_em = c.et,
      etiqueta_previa = case when c.cf is null then false else i.etiqueta_previa end,
      qtd_bipada = c.qb, bipado_em = c.bd,
      separado_por = case when c.st <> 'encontrado' then null when i.status <> 'encontrado' then v_sep else i.separado_por end,
      conferido_por = case when c.cf is null then null when i.conferido_em is null then v_conf else i.conferido_por end,
      bipado_por = case when c.qb <= 0 then null when c.qb > i.qtd_bipada then v_bip else i.bipado_por end
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
                 'bipado_em', bipado_em, 'separado_por', separado_por, 'conferido_por', conferido_por, 'bipado_por', bipado_por) order by ordem, id)
               from public.pedido_itens where pedido_id = p_pedido and id = any(v_ids)), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.pedido_eventos e
               where e.pedido_id = p_pedido and e.id > v_evt), '[]'::jsonb),
    'ignoradas', to_jsonb(coalesce(v_ignoradas, '{}'::uuid[])));
end $function$;

-- alterar_item (cópia de 20261125153000_falta_espera_separacao)
CREATE OR REPLACE FUNCTION public.alterar_item(p_item uuid, p_campos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p public.pedidos%rowtype;
  v_old public.pedido_itens%rowtype;
  v_et text;
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
  select * into v_old from public.pedido_itens where id=p_item;
  v_et := coalesce(public.etapa_da_esteira(v_p.status, v_p.etapa_antes_desvio), 'separacao');
  update public.pedido_itens set
    -- Autores dos passos (Fase 3): grava ao marcar o passo e limpa ao desfazer; ver autor_da_etapa.
    separado_por=case when not (p_campos?'status') then separado_por when p_campos->>'status'<>'encontrado' then null
      when status<>'encontrado' then public.autor_da_etapa(v_p.id,'separacao') else separado_por end,
    falta_por=case when not (p_campos?'status') then falta_por
      when p_campos->>'status' in ('falta','defeito') then case when status in ('falta','defeito') then falta_por else public.autor_da_etapa(v_p.id,v_et) end
      else null end,
    conferido_por=case when not (p_campos?'conferido_em') then conferido_por when p_campos->>'conferido_em' is null then null
      when conferido_em is null then public.autor_da_etapa(v_p.id,'conferencia') else conferido_por end,
    bipado_por=case when not (p_campos?'qtd_bipada') then bipado_por when (p_campos->>'qtd_bipada')::int<=0 then null
      when (p_campos->>'qtd_bipada')::int>qtd_bipada then public.autor_da_etapa(v_p.id,'bipagem') else bipado_por end,
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
    -- Falta indevida: a peça em falta foi encontrada por outra pessoa (também vale para encontrar_peca, que chama esta função).
    if p_campos->>'status'='encontrado' and v_old.status in ('falta','defeito') and v_old.falta_por is not null then
      perform set_config('arvenne.falta_por', v_old.falta_por::text, true);
      perform public.registrar_falta_indevida(p_item);
    end if;
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

-- marcar_falta (cópia de 20261125153000_falta_espera_separacao)
CREATE OR REPLACE FUNCTION public.marcar_falta(p_item uuid, p_qtd integer, p_status text DEFAULT 'falta'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_i pedido_itens%rowtype;
  v_ped text;
  v_antes text;
  v_aut uuid;
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
  select p.status, p.etapa_antes_desvio into v_ped, v_antes from public.pedidos p join public.pedido_itens i on i.pedido_id=p.id
    where i.id=p_item for update of p;
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;

  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;

  -- Quem marcou a falta (Fase 3): o responsável da etapa em que o pedido está, ou quem clicou.
  v_aut := public.autor_da_etapa(v_i.pedido_id, coalesce(public.etapa_da_esteira(v_ped, v_antes), 'separacao'));
  if p_qtd >= v_i.qtd then
    -- Linha inteira: zera as etapas (conferência, etiqueta, bipagem).
    update pedido_itens
       set status = p_status, falta_por = v_aut, conferido_em = null, etiquetado_em = null,
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
  update pedido_itens set status = p_status, falta_por = v_aut where id = v_novo;
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

-- ---------------------------------------------------------------------------------------------------------------
-- Falta indevida: peça em falta/defeito que depois é encontrada por OUTRA pessoa gera a ocorrência em nome de quem marcou a falta.
-- Chamada só por alterar_item (invoker, sem permissão de gravar em ocorrencias). Quem marcou a falta chega por uma configuração
-- local da transação, que só alterar_item define; chamada direta, sem ela, não faz nada.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.registrar_falta_indevida(p_item uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_falta text := nullif(current_setting('arvenne.falta_por', true), '');
  v_i public.pedido_itens%rowtype;
  v_p public.pedidos%rowtype;
  v_etapa text;
  v_autor uuid;
begin
  perform set_config('arvenne.falta_por', '', true);
  if v_falta is null then return; end if;
  select * into v_i from public.pedido_itens where id = p_item;
  if not found or v_i.status <> 'encontrado' then return; end if;
  select * into v_p from public.pedidos where id = v_i.pedido_id;
  v_etapa := coalesce(public.etapa_da_esteira(v_p.status, v_p.etapa_antes_desvio), 'separacao');
  v_autor := public.autor_da_etapa(v_p.id, v_etapa);
  -- Mesma pessoa que marcou a falta (ou ninguém identificado): não é erro dela.
  if v_autor is null or v_autor::text = v_falta then return; end if;
  insert into public.ocorrencias (pedido_id, item_id, tipo, motivo, etapa, responsavel_id, registrado_por)
  values (v_p.id, p_item, 'falta_indevida', 'peca_encontrada', v_etapa, v_falta::uuid, public.registrado_por_atual());
end $$;
revoke all on function public.registrar_falta_indevida(uuid) from public, anon;
grant execute on function public.registrar_falta_indevida(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Erro na peça, achado na Bipagem: a peça volta para a Separação e fica registrado de quem foi.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.registrar_erro_bipagem(p_item uuid, p_motivo text, p_obs text default null, p_responsavel uuid default null)
returns uuid
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_i public.pedido_itens%rowtype;
  v_p public.pedidos%rowtype;
  v_resp uuid;
  v_id uuid;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  perform public.exigir_pedido_do_item(p_item);
  if p_motivo is null or p_motivo not in ('peca_incorreta','quantidade_incorreta','peca_defeito','peca_suja','outro') then
    raise exception 'Escolha o motivo do erro';
  end if;
  if p_motivo = 'outro' and v_obs is null then raise exception 'Conte o que aconteceu'; end if;
  select p.* into v_p from public.pedidos p join public.pedido_itens i on i.pedido_id = p.id
    where i.id = p_item and p.excluido_em is null for update of p;
  if not found then raise exception 'Peça não encontrada'; end if;
  select * into v_i from public.pedido_itens where id = p_item for update;
  if v_p.status not in ('separacao','conferencia','bipagem') then
    raise exception 'O erro na peça se registra na Bipagem. Este pedido está em %.', v_p.status;
  end if;
  if v_i.status <> 'encontrado' then raise exception 'Só uma peça já separada pode voltar para a Separação'; end if;
  v_resp := coalesce(p_responsavel, v_i.separado_por);
  if v_resp is not null and not exists (select 1 from public.equipe where id = v_resp) then
    raise exception 'Pessoa não encontrada no Time';
  end if;

  insert into public.ocorrencias (pedido_id, item_id, tipo, motivo, etapa, responsavel_id, conferente_id, registrado_por, observacao)
  values (v_p.id, p_item, 'erro_bipagem', p_motivo, 'separacao', v_resp, v_i.conferido_por, public.registrado_por_atual(), v_obs)
  returning id into v_id;

  -- A peça recomeça: pendente, sem conferência, etiqueta nem bipagem (os autores saem junto, pelo gatilho).
  perform set_config('arvenne.lote', '1', true);
  update public.pedido_itens set status = 'pendente', conferido_em = null, etiquetado_em = null, etiqueta_previa = false,
      qtd_bipada = 0, bipado_em = null
    where id = p_item;
  perform set_config('arvenne.lote', '', true);
  insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
  values (v_p.id, p_item, 'nota',
          'Erro na peça (' || public.rotulo_motivo(p_motivo) || '): ' || concat_ws(' · ', v_i.sku, v_i.nome, v_i.variante)
            || coalesce('. Separada por ' || (select nome from public.equipe where id = v_resp), ''),
          public.usuario_atual_email());
  perform public.avancar_pecas(v_p.id);
  return v_id;
end $$;
revoke all on function public.registrar_erro_bipagem(uuid, text, text, uuid) from public, anon;
grant execute on function public.registrar_erro_bipagem(uuid, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Quem provavelmente fez a etapa (sugestão editável). Para a peça: o autor gravado no passo; senão o mais comum do pedido
-- (separação, conferência, bipagem); senão o responsável da etapa; senão quem fez a saída da etapa (v_tempo_etapas), pelo e-mail.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.responsavel_sugerido(p_pedido uuid, p_etapa text, p_item uuid default null) returns uuid
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare
  v uuid;
begin
  perform public.exigir_pedido(p_pedido);
  if p_item is not null and p_etapa in ('separacao','conferencia','bipagem') then
    select case p_etapa when 'separacao' then separado_por when 'conferencia' then conferido_por else bipado_por end into v
      from public.pedido_itens where id = p_item and pedido_id = p_pedido;
  end if;
  if v is null and p_etapa in ('separacao','conferencia','bipagem') then
    select a.id into v from (
      select case p_etapa when 'separacao' then separado_por when 'conferencia' then conferido_por else bipado_por end as id
        from public.pedido_itens where pedido_id = p_pedido and status <> 'removido') a
     where a.id is not null group by a.id order by count(*) desc, a.id limit 1;
  end if;
  if v is null then
    select e.id into v from public.pedidos p join public.equipe e on e.id::text = p.responsaveis ->> p_etapa where p.id = p_pedido;
  end if;
  if v is null then
    select e.id into v from public.v_tempo_etapas t
      join public.equipe e on e.ativo and lower(btrim(e.email)) = lower(btrim(t.saiu_por))
     where t.pedido_id = p_pedido and t.etapa = p_etapa and t.saiu_por is not null
     order by t.entrou_em desc limit 1;
  end if;
  return v;
end $$;
revoke all on function public.responsavel_sugerido(uuid, text, uuid) from public, anon;
grant execute on function public.responsavel_sugerido(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Problema na entrega: só pedido concluído (enviado), pelo Concluídos.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.registrar_problema_entrega(
  p_pedido uuid, p_motivo text, p_etapa text default null, p_responsavel uuid default null, p_item uuid default null, p_obs text default null)
returns uuid
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_p public.pedidos%rowtype;
  v_i public.pedido_itens%rowtype;
  v_etapa text;
  v_resp uuid;
  v_id uuid;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  perform public.exigir_pedido(p_pedido);
  if p_motivo is null or p_motivo not in ('peca_errada','quantidade_errada','peca_defeito','peca_suja','nota_errada','endereco_errado','envio_errado','outro') then
    raise exception 'Escolha o motivo do problema';
  end if;
  if p_motivo = 'outro' and v_obs is null then raise exception 'Conte o que aconteceu'; end if;
  select * into v_p from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_p.status <> 'enviado' then raise exception 'O problema na entrega só vale para pedido concluído'; end if;
  v_etapa := coalesce(p_etapa, public.etapa_da_ocorrencia(p_motivo));
  if v_etapa is null then raise exception 'Escolha a etapa onde o erro aconteceu'; end if;
  if v_etapa not in ('separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio') then
    raise exception 'Etapa inválida';
  end if;
  if p_item is not null then
    select * into v_i from public.pedido_itens where id = p_item and pedido_id = p_pedido;
    if not found then raise exception 'Peça não pertence a este pedido'; end if;
  end if;
  v_resp := coalesce(p_responsavel, public.responsavel_sugerido(p_pedido, v_etapa, p_item));
  if v_resp is not null and not exists (select 1 from public.equipe where id = v_resp) then
    raise exception 'Pessoa não encontrada no Time';
  end if;
  insert into public.ocorrencias (pedido_id, item_id, tipo, motivo, etapa, responsavel_id, conferente_id, registrado_por, observacao)
  values (p_pedido, p_item, 'problema_entrega', p_motivo, v_etapa, v_resp, v_i.conferido_por, public.registrado_por_atual(), v_obs)
  returning id into v_id;
  insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
  values (p_pedido, p_item, 'nota',
          'Problema na entrega (' || public.rotulo_motivo(p_motivo) || ')' || coalesce(': ' || concat_ws(' · ', v_i.sku, v_i.nome, v_i.variante), ''),
          public.usuario_atual_email());
  return v_id;
end $$;
revoke all on function public.registrar_problema_entrega(uuid, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.registrar_problema_entrega(uuid, text, text, uuid, uuid, text) to authenticated, service_role;

-- Anular uma ocorrência (registrada por engano ou já resolvida): só o gestor. Fica guardada, só deixa de contar.
create or replace function public.anular_ocorrencia(p_id uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform public.exigir_gestor();
  update public.ocorrencias set anulada_em = now(), anulada_por = public.registrado_por_atual()
    where id = p_id and anulada_em is null;
  if not found then raise exception 'Ocorrência não encontrada ou já anulada'; end if;
end $$;
revoke all on function public.anular_ocorrencia(uuid) from public, anon;
grant execute on function public.anular_ocorrencia(uuid) to authenticated, service_role;

-- Para a tela: ocorrências com os nomes da equipe e da peça. security_invoker: vale a RLS de quem consulta.
create or replace view public.v_ocorrencias with (security_invoker = true) as
select o.id, o.pedido_id, o.item_id, o.tipo, o.motivo, o.etapa, o.responsavel_id, o.conferente_id, o.registrado_por,
       o.observacao, o.created_at, o.anulada_em, o.anulada_por,
       r.nome as responsavel_nome, c.nome as conferente_nome, coalesce(g.nome, o.registrado_por) as registrado_por_nome,
       p.numero, p.cliente_nome, i.sku, i.nome as item_nome, i.variante
  from public.ocorrencias o
  join public.pedidos p on p.id = o.pedido_id
  left join public.pedido_itens i on i.id = o.item_id
  left join public.equipe r on r.id = o.responsavel_id
  left join public.equipe c on c.id = o.conferente_id
  left join public.equipe g on g.id::text = o.registrado_por;
revoke all on public.v_ocorrencias from public, anon;
grant select on public.v_ocorrencias to authenticated, service_role;

-- Permissões das cópias (CREATE OR REPLACE mantém os GRANTs; repetidos por clareza).
revoke all on function public.marcar_pecas(uuid, jsonb) from public, anon;
grant execute on function public.marcar_pecas(uuid, jsonb) to authenticated, service_role;
