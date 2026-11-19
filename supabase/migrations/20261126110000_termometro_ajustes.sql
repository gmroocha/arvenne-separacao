-- Termômetro: ajustes (19/11/2026).
-- 1) A Fila ('novo') não tem termômetro: o tempo continua aparecendo na tela, mas sem faixa de cor. O termômetro começa na Separação.
-- 2) "Avisar cliente" passa a ter termômetro, com meta própria e editável (padrão 2 h úteis). "Aguardando cliente" continua sem.
-- (Verde sem contorno no cartão é só da tela: o banco segue entregando verde, amarelo e vermelho.)
alter table public.metas_etapa drop constraint if exists metas_etapa_etapa_check;
alter table public.metas_etapa add constraint metas_etapa_etapa_check
  check (etapa in ('separacao','avisar_cliente','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio'));
insert into public.metas_etapa (etapa, meta_horas_uteis) values ('avisar_cliente', 2) on conflict (etapa) do nothing;

-- Faixa do termômetro de uma etapa para um tempo (horas úteis). Sem meta (fila, aguardando cliente, fora da esteira) ou sem tempo: nulo.
create or replace function public.termometro_etapa(p_status text, p_horas numeric) returns text
language sql stable set search_path to 'public','pg_temp' as $$
  select case
    when p_horas is null or m.meta_horas_uteis is null then null
    when p_horas <= m.meta_horas_uteis then 'verde'
    when p_horas <= 2 * m.meta_horas_uteis then 'amarelo'
    else 'vermelho' end
  from (select 1) x
  left join public.metas_etapa m on m.etapa = p_status and p_status <> 'novo'
$$;
revoke all on function public.termometro_etapa(text, numeric) from public, anon;
grant execute on function public.termometro_etapa(text, numeric) to authenticated, service_role;

-- v_pedidos_operacao: cópia de 20261125160000_cliente_decidiu.sql, com horas_na_etapa também em 'avisar_cliente'
-- (mesma lista e ordem de colunas).
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
  public.termometro_etapa(p.status, te.horas) as termometro,
  (dt.r->>'decididas')::int as troca_decididas,
  (dt.r->>'abertas')::int as troca_pecas_abertas,
  ((dt.r->>'decididas')::int > 0) as cliente_decidiu
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
  select case when p.status in ('novo','separacao','avisar_cliente','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio')
              then public.horas_uteis(p.status_desde, now()) end as horas offset 0
) te
cross join lateral (select public.decisao_troca(p.id, p.status) as r offset 0) dt;

revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;
