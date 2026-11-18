-- Peças repetidas também em etapas avançadas: a tela ganha a opção de ver as peças de pedidos que já passaram
-- da separação (Conferência, Bipagem, Nota fiscal, Embalagem, Frete, Postagem, Enviar rastreio).
-- Concluídos (status "enviado"), cancelados, perdidos e somados nunca entram.
-- p_avancadas = false mantém a regra de sempre: Novo/Separação e só peça pendente.
-- p_avancadas = true soma as etapas avançadas e conta a peça pendente ou já encontrada (falta e removida não).
-- Cada pedido da lista traz a etapa ("status") para a tela mostrar onde ele está.
--
-- A assinatura muda (parâmetro novo): a view do selo depende da função, então sai e volta igual.
drop view public.v_pecas_em_varios_pedidos;
drop function public.pecas_repetidas(uuid[]);

create function public.pecas_repetidas(p_pedidos uuid[] default null, p_avancadas boolean default false)
returns table (chave text, sku text, nome text, variante text, foto_url text, qtd_total int, qtd_pedidos int, pedidos jsonb)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    coalesce(nullif(i.sku, ''), i.nome || ' · ' || coalesce(i.variante, '')) as chave,
    max(i.sku)        as sku,
    max(i.nome)       as nome,
    max(i.variante)   as variante,
    max(i.foto_url)   as foto_url,
    sum(i.qtd)::int   as qtd_total,
    count(distinct p.id)::int as qtd_pedidos,
    jsonb_agg(jsonb_build_object(
      'pedido_id', p.id, 'numero', p.numero, 'cliente', p.cliente_nome, 'qtd', i.qtd, 'status', p.status,
      'prazo', pz.prazo,
      'prazo_horas_uteis', case when pz.prazo > now() then public.horas_uteis(now(), pz.prazo) end
    ) order by pz.prazo nulls last, p.pedido_em) as pedidos
  from public.pedido_itens i
  join public.pedidos p on p.id = i.pedido_id
  cross join lateral (select public.prazo_envio(p.pago_em) as prazo) pz
  where (p.status in ('novo', 'separacao')
         or (p_avancadas and p.status in ('avisar_cliente', 'aguardando_cliente', 'conferencia', 'bipagem', 'faturamento',
                                          'embalagem', 'frete', 'pronto_envio', 'enviar_rastreio')))
    and (i.status = 'pendente' or (p_avancadas and i.status = 'encontrado'))
    and (p_pedidos is null or p.id = any(p_pedidos))
  group by 1
  having count(distinct p.id) > 1
$$;

revoke all on function public.pecas_repetidas(uuid[], boolean) from public, anon;
grant execute on function public.pecas_repetidas(uuid[], boolean) to authenticated, service_role;

create view public.v_pecas_em_varios_pedidos
with (security_invoker = true) as
select * from public.pecas_repetidas(null, false);

grant select on public.v_pecas_em_varios_pedidos to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.pecas_repetidas(uuid[], boolean) to supabase_read_only_user;
    grant select on public.v_pecas_em_varios_pedidos to supabase_read_only_user;
  end if;
end $$;
