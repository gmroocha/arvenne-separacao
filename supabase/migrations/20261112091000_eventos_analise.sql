-- Dados para análise: tempo de cada pedido em cada etapa e tempo para achar cada peça.
-- Mais eventos em pedido_eventos (conferida, etiquetada, bipada, nota, frete, LR, embalado, postado...)
-- e duas views de leitura. Nenhuma tela ainda: só os dados (ver ROADMAP).

-- ---------------------------------------------------------------------------
-- 1. Novos tipos de evento
-- ---------------------------------------------------------------------------
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo in (
  'criado', 'status', 'item', 'nota',
  'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada', 'qtd', 'preco',
  'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado',
  'postado', 'desfeito_postagem', 'rastreio_enviado', 'reiniciado'));

-- A tela só pode registrar 'nota' e 'reiniciado' (botões Reiniciar etapa / pedido).
-- O resto vem dos gatilhos abaixo (security definer).
drop policy if exists equipe_nota on public.pedido_eventos;
create policy equipe_nota on public.pedido_eventos for insert to authenticated
  with check (tipo in ('nota', 'reiniciado'));

-- ---------------------------------------------------------------------------
-- 2. Peças: eventos extras (o de mudança de status continua igual)
-- ---------------------------------------------------------------------------
create or replace function public.tg_itens_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quem  text := public.usuario_atual_email();
  v_texto text := concat_ws(' · ', new.sku, new.nome, new.variante);
begin
  if new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'item', old.status, new.status, v_texto, v_quem);
  end if;

  if new.conferido_em is distinct from old.conferido_em
     and (new.conferido_em is null) <> (old.conferido_em is null) then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
    values (new.pedido_id, new.id, case when new.conferido_em is null then 'desconferida' else 'conferida' end, v_texto, v_quem);
  end if;

  if new.etiquetado_em is distinct from old.etiquetado_em
     and (new.etiquetado_em is null) <> (old.etiquetado_em is null) then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
    values (new.pedido_id, new.id,
            case when new.etiquetado_em is null then 'desetiquetada' else 'etiquetada' end,
            case when new.etiqueta_previa then v_texto || ' (já tinha etiqueta)' else v_texto end, v_quem);
  end if;

  if new.qtd_bipada is distinct from old.qtd_bipada then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'bipada', old.qtd_bipada::text, new.qtd_bipada::text, v_texto, v_quem);
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

-- ---------------------------------------------------------------------------
-- 3. Pedidos: criação e etapa (como antes) + nota, frete, LR, embalagem, postagem, pagamento
-- ---------------------------------------------------------------------------
create or replace function public.tg_pedidos_depois() returns trigger
language plpgsql security definer set search_path = public as $$
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
    values (new.id, case when new.frete_gerado_em is null then 'frete_desfeito' else 'frete_gerado' end, new.frete_servico, v_quem);
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

-- ---------------------------------------------------------------------------
-- 4. Views de análise (leitura). security_invoker: vale a RLS de quem consulta.
-- ---------------------------------------------------------------------------

-- Uma linha por passagem do pedido por uma etapa. Reiniciar pode fazer o pedido passar de novo
-- pela mesma etapa: "visita" numera as passagens. Etapa aberta: saiu_em nulo e em_andamento = true.
create or replace view public.v_tempo_etapas
with (security_invoker = true) as
with passagens as (
  select
    e.pedido_id,
    e.para                                                            as etapa,
    e.created_at                                                      as entrou_em,
    e.usuario_email                                                   as entrou_por,
    lead(e.created_at) over w                                         as saiu_em,
    lead(e.para) over w                                               as proxima_etapa,
    lead(e.usuario_email) over w                                      as saiu_por
  from public.pedido_eventos e
  where e.tipo in ('criado', 'status')
  window w as (partition by e.pedido_id order by e.created_at, e.id)
)
select
  g.pedido_id,
  p.numero,
  p.origem,
  p.cliente_nome,
  g.etapa,
  row_number() over (partition by g.pedido_id, g.etapa order by g.entrou_em)::int as visita,
  g.entrou_em,
  g.entrou_por,
  g.saiu_em,
  g.proxima_etapa,
  g.saiu_por,
  (g.saiu_em is null)                                                                  as em_andamento,
  round((extract(epoch from (coalesce(g.saiu_em, now()) - g.entrou_em)) / 3600)::numeric, 2) as horas_corridas,
  public.horas_uteis(g.entrou_em, coalesce(g.saiu_em, now()))                          as horas_uteis
from passagens g
join public.pedidos p on p.id = g.pedido_id;

-- Uma linha por "Achei". tempo = desde a peça achada antes no mesmo pedido ou, para a primeira,
-- desde a entrada em Separação (vazio se a entrada veio depois, como quando o 1º "Achei" move o
-- pedido de Novo para Separação). Média por SKU mostra o que é difícil de achar.
-- Ignore tempos muito longos (pausas, almoço, dia seguinte) ao tirar a média.
create or replace view public.v_tempo_sku
with (security_invoker = true) as
with achados as (
  select
    e.id                                                  as evento_id,
    e.pedido_id,
    e.item_id,
    e.created_at                                          as achado_em,
    e.usuario_email                                       as achado_por,
    lag(e.created_at) over (partition by e.pedido_id order by e.created_at, e.id) as achado_anterior_em
  from public.pedido_eventos e
  where e.tipo = 'item' and e.para = 'encontrado'
),
entrada as (
  select pedido_id, min(created_at) as entrou_separacao_em
  from public.pedido_eventos
  where tipo = 'status' and para = 'separacao'
  group by pedido_id
)
select
  a.evento_id,
  a.pedido_id,
  p.numero,
  a.item_id,
  i.sku,
  i.nome,
  i.variante,
  i.qtd,
  a.achado_em,
  a.achado_por,
  (a.achado_em at time zone 'America/Sao_Paulo')::date                              as dia,
  extract(hour from a.achado_em at time zone 'America/Sao_Paulo')::int              as hora,
  coalesce(a.achado_anterior_em,
           case when en.entrou_separacao_em < a.achado_em then en.entrou_separacao_em end) as desde_em,
  case when a.achado_anterior_em is not null then 'peca_anterior'
       when en.entrou_separacao_em < a.achado_em then 'entrada_separacao'
       end                                                                          as referencia,
  round(extract(epoch from (a.achado_em - coalesce(a.achado_anterior_em,
        case when en.entrou_separacao_em < a.achado_em then en.entrou_separacao_em end))))::int as segundos_para_achar
from achados a
join public.pedidos p on p.id = a.pedido_id
left join public.pedido_itens i on i.id = a.item_id
left join entrada en on en.pedido_id = a.pedido_id;

grant select on public.v_tempo_etapas to authenticated, service_role;
grant select on public.v_tempo_sku    to authenticated, service_role;
