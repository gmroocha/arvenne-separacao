-- Cartão da Expedição: as fotos das peças em falta vêm primeiro (pedido do Gustavo, 18/11/2026). No "Avisar cliente" a
-- equipe vê na hora quais peças faltam. Mesmas colunas da rodada3; só muda a ordem das até 3 fotos do cartão.
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
    coalesce((select jsonb_agg(x.foto_url order by x.falta desc, x.ordem) from (
      select foto_url, status in ('falta','defeito') as falta, ordem from public.pedido_itens
       where pedido_id=p.id and status<>'removido' and foto_url is not null
       order by status in ('falta','defeito') desc, ordem limit 3) x),'[]'::jsonb) as fotos
  from public.pedido_itens where pedido_id=p.id and status<>'removido'
) a
cross join lateral (select case when p.status in ('em_aberto','aguardando_pagamento') then 'venda'
  when p.status in ('enviado','cancelado','perdida','somada') then 'arquivo' else 'expedicao' end as fase) f
cross join lateral (select case when f.fase='expedicao' then public.prazo_envio(p.pago_em) end as prazo offset 0) z
cross join lateral (select public.acerto_operacional(p.id) as r offset 0) ac;

revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;
