-- A esteira não precisa recalcular o financeiro de todos os pedidos a cada peça.
-- Mantém a RLS do chamador; o acerto continua vindo da regra financeira original.
create function public.acerto_operacional(p_pedido uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not exists(select 1 from public.trocas where pedido_id=p_pedido and status<>'cancelada' and acerto_status='pendente')
    and not exists(select 1 from public.pedido_itens where pedido_id=p_pedido and status='removido'
      and observacao='cliente desistiu' and devolvido_em is null and reembolsado_shopify_em is null) then
    return jsonb_build_object('pendente',false,'devolver',0);
  end if;
  return (select jsonb_build_object('pendente',acerto_pendente,'devolver',a_devolver)
    from public.v_pedidos where id=p_pedido);
end $$;
revoke all on function public.acerto_operacional(uuid) from public, anon;
grant execute on function public.acerto_operacional(uuid) to authenticated, service_role;

create view public.v_pedidos_operacao with (security_invoker=true) as
select p.id,p.numero,p.origem,p.status,p.status_desde,p.cliente_nome,p.cliente_telefone,
  p.shopify_url,p.pedido_em,p.etapa_antes_desvio,p.responsaveis,
  a.qtd_pecas,a.qtd_linhas,a.qtd_encontradas,a.qtd_conferidas,a.qtd_etiquetadas,a.qtd_bipadas,a.fotos,
  f.fase, (p.origem<>'shopify' and p.status='enviado' and p.rastreio_enviado_em is null) as pendente_rastreio,
  z.prazo,case when z.prazo>now() then public.horas_uteis(now(),z.prazo) end as prazo_horas_uteis,
  (ac.r->>'pendente')::boolean as acerto_pendente,(ac.r->>'devolver')::numeric(10,2) as a_devolver,
  public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',a.qtd_linhas,'pecas',a.qtd_pecas,'encontradas',a.qtd_encontradas,
    'conferidas',a.qtd_conferidas,'etiquetadas',a.qtd_etiquetadas,'bipadas',a.qtd_bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',(ac.r->>'pendente')::boolean)) as etapas_permitidas
from public.pedidos p
cross join lateral (
  select coalesce(sum(qtd),0)::int as qtd_pecas,count(*)::int as qtd_linhas,
    (count(*) filter(where status='encontrado'))::int as qtd_encontradas,
    (count(*) filter(where status='encontrado' and conferido_em is not null))::int as qtd_conferidas,
    (count(*) filter(where status='encontrado' and etiquetado_em is not null))::int as qtd_etiquetadas,
    coalesce(sum(qtd_bipada),0)::int as qtd_bipadas,
    coalesce((select jsonb_agg(x.foto_url) from (
      select foto_url from public.pedido_itens where pedido_id=p.id and status<>'removido' and foto_url is not null
      order by ordem limit 3) x),'[]'::jsonb) as fotos
  from public.pedido_itens where pedido_id=p.id and status<>'removido'
) a
cross join lateral (select case when p.status in ('em_aberto','aguardando_pagamento') then 'venda'
  when p.status in ('enviado','cancelado','perdida','somada') then 'arquivo' else 'expedicao' end as fase) f
cross join lateral (select case when f.fase='expedicao' then public.prazo_envio(p.pago_em) end as prazo offset 0) z
cross join lateral (select public.acerto_operacional(p.id) as r offset 0) ac;
revoke all on public.v_pedidos_operacao from public, anon;
grant select on public.v_pedidos_operacao to authenticated, service_role;

create function public.contagens_pedidos() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('emAberto',count(*) filter(where status='em_aberto'),
    'atrasados',count(*) filter(where status in ('novo','separacao','avisar_cliente','aguardando_cliente',
      'conferencia','etiquetagem','bipagem','faturamento','embalagem','frete','pronto_envio')
      and public.prazo_envio(pago_em)<now()))
  from public.pedidos where excluido_em is null
    and status not in ('aguardando_pagamento','enviado','cancelado','perdida','somada');
$$;
revoke all on function public.contagens_pedidos() from public, anon;
grant execute on function public.contagens_pedidos() to authenticated, service_role;
