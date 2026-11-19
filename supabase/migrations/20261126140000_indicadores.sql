-- Fase 4 (19/11/2026): tela de Indicadores (só gestor). Toda a conta fica aqui; a tela só exibe.
-- Princípios (Andy Grove, "Gestão de Alta Performance"): medir resultado e não atividade; indicadores em par (quantidade ao lado de
-- qualidade); indicadores que antecipam problemas (fila e pedido mais antigo); etapa gargalo; pegar o defeito na etapa mais barata.
--
-- Funções `security definer` que começam por exigir_gestor(): a funcionária só vê os pedidos dela e os indicadores precisam do todo.
-- GRANT só para authenticated (a checagem é interna); anon nada.
--
-- "Quem fez" enquanto as colaboradoras não têm login = responsável da etapa (mesma regra de responsavel_sugerido, só que em lote,
-- sem uma chamada por pedido): autor gravado nas peças (separação, conferência, bipagem), senão o responsável da etapa, senão quem
-- fez a saída da etapa (e-mail de v_tempo_etapas).
-- Limites conhecidos: uma etapa pulada à mão (mover_etapa) conta como feita pelo responsável; o tempo de uma passagem inclui a espera
-- do pedido na etapa (é o tempo que o termômetro também mede).

-- Passagens concluídas (o pedido saiu da etapa para uma etapa à frente) com saída em [p_de, p_ate). Uso interno das funções abaixo.
create or replace function public.indicadores_passagens(p_de timestamptz, p_ate timestamptz)
returns table (pedido_id uuid, numero text, etapa text, saiu_em timestamptz, horas numeric, meta numeric, pecas int, pessoa uuid)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  with ordem(etapa, n) as (values ('separacao',1),('conferencia',2),('bipagem',3),('faturamento',4),('embalagem',5),('pronto_envio',6),('enviar_rastreio',7)),
  base as (
    select t.pedido_id, t.numero, t.saiu_em, t.saiu_por, t.horas_uteis,
           case t.etapa when 'novo' then 'separacao' when 'frete' then 'embalagem' else t.etapa end as etapa,
           case t.proxima_etapa when 'novo' then 1 when 'frete' then 5 when 'enviado' then 8
                else (select o.n from ordem o where o.etapa = t.proxima_etapa) end as prox
      from public.v_tempo_etapas t
      join public.pedidos p on p.id = t.pedido_id and p.excluido_em is null and p.status not in ('cancelado','perdida','somada')
     where t.saiu_em >= p_de and t.saiu_em < p_ate
  )
  select b.pedido_id, b.numero::text, b.etapa, b.saiu_em, b.horas_uteis, m.meta_horas_uteis, q.pecas, w.id
    from base b
    join ordem o on o.etapa = b.etapa and b.prox > o.n
    left join public.metas_etapa m on m.etapa = b.etapa
    cross join lateral (select coalesce(sum(i.qtd), 0)::int as pecas from public.pedido_itens i
                         where i.pedido_id = b.pedido_id and i.status <> 'removido') q
    cross join lateral (
      select coalesce(
        (select a.id from (select case b.etapa when 'separacao' then i.separado_por when 'conferencia' then i.conferido_por else i.bipado_por end as id
                             from public.pedido_itens i where i.pedido_id = b.pedido_id and i.status <> 'removido' and b.etapa in ('separacao','conferencia','bipagem')) a
          where a.id is not null group by a.id order by count(*) desc, a.id limit 1),
        (select e.id from public.pedidos p join public.equipe e on e.id::text = p.responsaveis ->> b.etapa where p.id = b.pedido_id),
        (select e.id from public.equipe e where b.saiu_por is not null and lower(btrim(e.email)) = lower(btrim(b.saiu_por)) order by e.ativo desc limit 1)
      ) as id) w
$$;
revoke all on function public.indicadores_passagens(timestamptz, timestamptz) from public, anon, authenticated;

-- Números do topo da tela.
create or replace function public.indicadores_resumo(p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare
  v_env record;
  v_pecas_sep int;
  v_tempos jsonb;
  v_garg jsonb;
  v_eb int; v_fi int; v_pe int;
begin
  perform public.exigir_gestor();
  if p_de is null or p_ate is null or p_ate <= p_de then raise exception 'Período inválido'; end if;

  -- Enviados no período (saída da Postagem = postado_em). No prazo: postado até o prazo de 48 h úteis do pagamento.
  select count(*)::int as pedidos, coalesce(sum(q.pecas), 0)::int as pecas,
         count(*) filter (where p.pago_em is not null)::int as com_prazo,
         count(*) filter (where p.pago_em is not null and p.postado_em <= public.prazo_envio(p.pago_em))::int as no_prazo
    into v_env
    from public.pedidos p
    cross join lateral (select coalesce(sum(i.qtd), 0) as pecas from public.pedido_itens i
                         where i.pedido_id = p.id and i.status not in ('removido','falta','defeito')) q
   where p.excluido_em is null and p.postado_em >= p_de and p.postado_em < p_ate
     and p.status in ('enviar_rastreio','enviado');

  with pass as materialized (select * from public.indicadores_passagens(p_de, p_ate))
  select coalesce((select sum(s.pecas) from pass s where s.etapa = 'separacao'), 0)::int,
         coalesce((select jsonb_agg(jsonb_build_object('etapa', x.etapa, 'horas', round(x.h, 2), 'meta', x.meta, 'passagens', x.n) order by x.o)
                     from (select s.etapa, avg(s.horas) as h, max(s.meta) as meta, count(*)::int as n,
                                  array_position(array['separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio'], s.etapa) as o
                             from pass s where s.horas is not null group by s.etapa) x), '[]'::jsonb)
    into v_pecas_sep, v_tempos;
  select to_jsonb(t) into v_garg from (
    select x ->> 'etapa' as etapa, (x ->> 'horas')::numeric as horas
      from jsonb_array_elements(v_tempos) x order by (x ->> 'horas')::numeric desc, x ->> 'etapa' limit 1) t;

  select count(*) filter (where tipo = 'erro_bipagem')::int, count(*) filter (where tipo = 'falta_indevida')::int,
         count(*) filter (where tipo = 'problema_entrega')::int
    into v_eb, v_fi, v_pe
    from public.ocorrencias where anulada_em is null and created_at >= p_de and created_at < p_ate;

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'enviados_pedidos', v_env.pedidos,
    'enviados_pecas', v_env.pecas,
    'prazo_total', v_env.com_prazo,
    'prazo_dentro', v_env.no_prazo,
    'prazo_pct', case when v_env.com_prazo > 0 then round(100.0 * v_env.no_prazo / v_env.com_prazo, 1) end,
    'pecas_separadas', v_pecas_sep,
    'erros_bipagem', v_eb,
    'faltas_indevidas', v_fi,
    'erros_por_100', case when v_pecas_sep > 0 then round(100.0 * (v_eb + v_fi) / v_pecas_sep, 2) end,
    'problemas_cliente', v_pe,
    'pegos_antes_pct', case when v_eb + v_pe > 0 then round(100.0 * v_eb / (v_eb + v_pe), 1) end,
    'gargalo', v_garg,
    'tempos', v_tempos);
end $$;
revoke all on function public.indicadores_resumo(timestamptz, timestamptz) from public, anon;
grant execute on function public.indicadores_resumo(timestamptz, timestamptz) to authenticated, service_role;

-- Fila agora: por etapa, quantidade, contagem por cor do termômetro e o pedido mais antigo (mais tempo na etapa).
-- A Fila ('novo') não tem termômetro: só a contagem e o mais antigo.
create or replace function public.indicadores_fila() returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  perform public.exigir_gestor();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'etapa', e.etapa, 'total', coalesce(s.total, 0), 'verde', coalesce(s.verde, 0),
             'amarelo', coalesce(s.amarelo, 0), 'vermelho', coalesce(s.vermelho, 0),
             'mais_antigo', s.antigo) order by e.n)
      from (values ('novo',0),('separacao',1),('avisar_cliente',2),('conferencia',3),('bipagem',4),('faturamento',5),
                   ('embalagem',6),('pronto_envio',7),('enviar_rastreio',8)) e(etapa, n)
      left join (
        select o.status, count(*)::int as total,
               count(*) filter (where o.termometro = 'verde')::int as verde,
               count(*) filter (where o.termometro = 'amarelo')::int as amarelo,
               count(*) filter (where o.termometro = 'vermelho')::int as vermelho,
               (array_agg(jsonb_build_object('id', o.id, 'numero', o.numero, 'horas', o.horas_na_etapa, 'desde', o.status_desde)
                          order by o.status_desde asc, o.id))[1] as antigo
          from public.v_pedidos_operacao o join public.pedidos p on p.id = o.id and p.excluido_em is null
         where o.fase = 'expedicao'
         group by o.status) s on s.status = e.etapa), '[]'::jsonb);
end $$;
revoke all on function public.indicadores_fila() from public, anon;
grant execute on function public.indicadores_fila() to authenticated, service_role;

-- Por colaboradora no período: peças por etapa, tempo por peça na separação e ocorrências pelas quais responde.
create or replace function public.indicadores_pessoas(p_de timestamptz, p_ate timestamptz)
returns table (pessoa_id uuid, nome text, separacao int, conferencia int, bipagem int, faturamento int, embalagem int,
               pronto_envio int, enviar_rastreio int, minutos_por_peca_separacao numeric,
               erros_separacao int, faltas_indevidas int, problemas_cliente int)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
begin
  perform public.exigir_gestor();
  if p_de is null or p_ate is null or p_ate <= p_de then raise exception 'Período inválido'; end if;
  return query
  with pass as materialized (select * from public.indicadores_passagens(p_de, p_ate) x where x.pessoa is not null),
  pec as (
    select s.pessoa as pid,
           sum(s.pecas) filter (where s.etapa = 'separacao')::int as sep, sum(s.pecas) filter (where s.etapa = 'conferencia')::int as conf,
           sum(s.pecas) filter (where s.etapa = 'bipagem')::int as bip, sum(s.pecas) filter (where s.etapa = 'faturamento')::int as fat,
           sum(s.pecas) filter (where s.etapa = 'embalagem')::int as emb, sum(s.pecas) filter (where s.etapa = 'pronto_envio')::int as pos,
           sum(s.pecas) filter (where s.etapa = 'enviar_rastreio')::int as rast,
           sum(s.horas) filter (where s.etapa = 'separacao') as h_sep
      from pass s group by s.pessoa),
  oc as (
    select o.responsavel_id as pid,
           count(*) filter (where o.tipo = 'erro_bipagem')::int as eb, count(*) filter (where o.tipo = 'falta_indevida')::int as fi,
           count(*) filter (where o.tipo = 'problema_entrega')::int as pe
      from public.ocorrencias o
     where o.anulada_em is null and o.responsavel_id is not null and o.created_at >= p_de and o.created_at < p_ate
     group by o.responsavel_id)
  select e.id, e.nome::text, coalesce(p.sep, 0), coalesce(p.conf, 0), coalesce(p.bip, 0), coalesce(p.fat, 0), coalesce(p.emb, 0),
         coalesce(p.pos, 0), coalesce(p.rast, 0),
         case when coalesce(p.sep, 0) > 0 and p.h_sep is not null then round(p.h_sep * 60 / p.sep, 1) end,
         coalesce(oc.eb, 0), coalesce(oc.fi, 0), coalesce(oc.pe, 0)
    from public.equipe e
    left join pec p on p.pid = e.id
    left join oc on oc.pid = e.id
   where p.pid is not null or oc.pid is not null
   order by coalesce(p.sep, 0) + coalesce(p.conf, 0) + coalesce(p.bip, 0) + coalesce(p.fat, 0) + coalesce(p.emb, 0)
            + coalesce(p.pos, 0) + coalesce(p.rast, 0) desc, e.nome;
end $$;
revoke all on function public.indicadores_pessoas(timestamptz, timestamptz) from public, anon;
grant execute on function public.indicadores_pessoas(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Pontuação do mês (0 a 100). A FÓRMULA FICA SÓ AQUI (pontuacao_componentes): para ajustar, mude esta função.
--   qualidade (50%): 100 menos 10 pontos por ocorrência a cada 100 peças (erro na bipagem, falta indevida, problema na
--                    entrega), com piso 0. Sem peças no mês: 100 sem ocorrência, 0 com ocorrência.
--   produção  (30%): peças por hora da pessoa comparadas à média do time, limitado a 100.
--   prazo     (20%): % das etapas dela que saíram dentro da meta (metas_etapa).
-- Faixa de bônus: pontuação >= 85 e zero problema na cliente.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.pontuacao_componentes(p_ocorrencias int, p_pecas int, p_pecas_hora numeric, p_media_hora numeric, p_prazo_pct numeric)
returns table (qualidade numeric, producao numeric, prazo numeric, total numeric)
language sql immutable set search_path to 'public','pg_temp' as $$
  select q.v, r.v, z.v, round(0.5 * q.v + 0.3 * r.v + 0.2 * z.v, 1)
    from (select round(case when coalesce(p_pecas, 0) > 0 then greatest(0, 100 - 10 * (100.0 * p_ocorrencias / p_pecas))
                            when p_ocorrencias > 0 then 0 else 100 end, 1) as v) q,
         (select round(case when p_pecas_hora is null or p_media_hora is null or p_media_hora <= 0 then 0
                            else least(100, 100 * p_pecas_hora / p_media_hora) end, 1) as v) r,
         (select round(coalesce(p_prazo_pct, 0), 1) as v) z
$$;
revoke all on function public.pontuacao_componentes(int, int, numeric, numeric, numeric) from public, anon;
grant execute on function public.pontuacao_componentes(int, int, numeric, numeric, numeric) to authenticated, service_role;

create or replace function public.pontuacao_mes(p_mes date) returns table (
  posicao int, pessoa_id uuid, nome text, pecas int, ocorrencias int, problemas_cliente int, ocorrencias_por_100 numeric,
  pecas_por_hora numeric, prazo_pct numeric, qualidade numeric, producao numeric, prazo numeric, pontuacao numeric, bonus boolean)
language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare
  v_de timestamptz;
  v_ate timestamptz;
begin
  perform public.exigir_gestor();
  if p_mes is null then raise exception 'Informe o mês'; end if;
  v_de := date_trunc('month', p_mes)::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  return query
  with pass as materialized (select * from public.indicadores_passagens(v_de, v_ate) x where x.pessoa is not null),
  pe as (
    select s.pessoa as pid, sum(s.pecas)::int as pecas, sum(s.horas) as horas,
           count(*) filter (where s.meta is not null)::int as n_meta,
           count(*) filter (where s.meta is not null and s.horas <= s.meta)::int as n_ok
      from pass s group by s.pessoa),
  oc as (
    select o.responsavel_id as pid, count(*)::int as n, count(*) filter (where o.tipo = 'problema_entrega')::int as pe
      from public.ocorrencias o
     where o.anulada_em is null and o.responsavel_id is not null and o.created_at >= v_de and o.created_at < v_ate
     group by o.responsavel_id),
  base as (
    select e.id as pid, e.nome, coalesce(pe.pecas, 0) as pecas, coalesce(oc.n, 0) as oc_n, coalesce(oc.pe, 0) as oc_pe,
           case when pe.horas > 0 then pe.pecas / pe.horas end as pph,
           case when pe.n_meta > 0 then 100.0 * pe.n_ok / pe.n_meta end as prazo_pct
      from public.equipe e left join pe on pe.pid = e.id left join oc on oc.pid = e.id
     where pe.pid is not null or oc.pid is not null),
  media as (select avg(b.pph) as m from base b where b.pph is not null),
  calc as (
    select b.*, c.qualidade as q, c.producao as r, c.prazo as z, c.total as t
      from base b cross join media m
      cross join lateral public.pontuacao_componentes(b.oc_n, b.pecas, b.pph, m.m, b.prazo_pct) c)
  select (rank() over (order by c.t desc))::int, c.pid, c.nome::text, c.pecas, c.oc_n, c.oc_pe,
         case when c.pecas > 0 then round(100.0 * c.oc_n / c.pecas, 2) end,
         round(c.pph, 2), round(c.prazo_pct, 1), c.q, c.r, c.z, c.t, (c.t >= 85 and c.oc_pe = 0)
    from calc c order by c.t desc, c.nome;
end $$;
revoke all on function public.pontuacao_mes(date) from public, anon;
grant execute on function public.pontuacao_mes(date) to authenticated, service_role;
