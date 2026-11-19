-- Tempo na etapa e termômetro (19/11/2026). Cada etapa da esteira tem uma meta em horas úteis (editável no Time).
-- O pedido mostra o tempo na etapa e uma cor: verde até a meta, amarelo até o dobro, vermelho acima. A conta fica aqui no
-- banco (a tela só exibe). Fora da esteira (venda, arquivo, "Avisar/Aguardando cliente") não há termômetro.
create table public.metas_etapa (
  etapa text primary key check (etapa in ('separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio')),
  meta_horas_uteis numeric not null check (meta_horas_uteis > 0)
);
insert into public.metas_etapa (etapa, meta_horas_uteis) values
  ('separacao', 2), ('conferencia', 1), ('bipagem', 1), ('faturamento', 2),
  ('embalagem', 2), ('pronto_envio', 4), ('enviar_rastreio', 2);

alter table public.metas_etapa enable row level security;
create policy metas_le on public.metas_etapa for select to authenticated using (true);
create policy metas_cria on public.metas_etapa for insert to authenticated with check (public.sou_gestor());
create policy metas_edita on public.metas_etapa for update to authenticated using (public.sou_gestor()) with check (public.sou_gestor());
-- Sem DELETE: a meta só muda de valor.
revoke all on public.metas_etapa from public, anon;
grant select, insert, update on public.metas_etapa to authenticated;
grant select on public.metas_etapa to service_role;

-- Faixa do termômetro de uma etapa para um tempo (horas úteis). A etapa "novo" conta como separação. Sem meta: nulo.
create or replace function public.termometro_etapa(p_status text, p_horas numeric) returns text
language sql stable set search_path to 'public','pg_temp' as $$
  select case
    when p_horas is null or m.meta_horas_uteis is null then null
    when p_horas <= m.meta_horas_uteis then 'verde'
    when p_horas <= 2 * m.meta_horas_uteis then 'amarelo'
    else 'vermelho' end
  from (select 1) x
  left join public.metas_etapa m on m.etapa = case p_status when 'novo' then 'separacao' else p_status end
$$;
revoke all on function public.termometro_etapa(text, numeric) from public, anon;
grant execute on function public.termometro_etapa(text, numeric) to authenticated, service_role;

-- v_pedidos_operacao: cópia de 20261125140000_nf_chave.sql, com horas_na_etapa e termometro no fim.
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
    'origem',p.origem,'rastreio',p.rastreio_enviado_em)) as etapas_permitidas,
  p.nf_chave,
  te.horas as horas_na_etapa,
  public.termometro_etapa(p.status, te.horas) as termometro
from public.pedidos p
cross join lateral (
  select coalesce(sum(qtd),0)::int as qtd_pecas,count(*)::int as qtd_linhas,
    (count(*) filter(where status='encontrado'))::int as qtd_encontradas,
    (count(*) filter(where status='encontrado' and conferido_em is not null))::int as qtd_conferidas,
    coalesce(sum(qtd_bipada),0)::int as qtd_bipadas,
    coalesce((select jsonb_agg(x.foto_url order by x.falta desc, x.ordem) from (
      select foto_url, status in ('falta','defeito') as falta, ordem from public.pedido_itens
       where pedido_id=p.id and status<>'removido' and foto_url is not null
       order by status in ('falta','defeito') desc, ordem limit 3) x),'[]'::jsonb) as fotos
  from public.pedido_itens where pedido_id=p.id and status<>'removido'
) a
cross join lateral (select case when p.status in ('em_aberto','aguardando_pagamento') then 'venda'
  when p.status in ('enviado','cancelado','perdida','somada') then 'arquivo' else 'expedicao' end as fase) f
cross join lateral (select case when f.fase='expedicao' then public.prazo_envio(p.pago_em) end as prazo offset 0) z
cross join lateral (select public.acerto_operacional(p.id) as r offset 0) ac
cross join lateral (
  select case when p.status in ('novo','separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio')
              then public.horas_uteis(p.status_desde, now()) end as horas offset 0
) te;

revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;
