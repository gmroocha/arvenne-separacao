-- Peças repetidas por seleção de pedidos: a equipe escolhe os pedidos que vai separar no dia e vê só as
-- peças que se repetem entre eles. Contagens e prazo continuam calculados no banco.
-- p_pedidos nulo = todos os pedidos em Novo/Separação (o mesmo que a view sempre mostrou).
-- Cada pedido da lista traz o prazo de envio (48 h úteis do pagamento) e vem do mais urgente ao menos.
create or replace function public.pecas_repetidas(p_pedidos uuid[] default null)
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
      'pedido_id', p.id, 'numero', p.numero, 'cliente', p.cliente_nome, 'qtd', i.qtd,
      'prazo', pz.prazo,
      'prazo_horas_uteis', case when pz.prazo > now() then public.horas_uteis(now(), pz.prazo) end
    ) order by pz.prazo nulls last, p.pedido_em) as pedidos
  from public.pedido_itens i
  join public.pedidos p on p.id = i.pedido_id
  cross join lateral (select public.prazo_envio(p.pago_em) as prazo) pz
  where p.status in ('novo', 'separacao')
    and i.status = 'pendente'
    and (p_pedidos is null or p.id = any(p_pedidos))
  group by 1
  having count(distinct p.id) > 1
$$;

revoke all on function public.pecas_repetidas(uuid[]) from public, anon;
grant execute on function public.pecas_repetidas(uuid[]) to authenticated, service_role;

-- A view (selo da barra lateral) passa a usar a mesma regra, sem seleção. Mesmas colunas e tipos.
create or replace view public.v_pecas_em_varios_pedidos
with (security_invoker = true) as
select * from public.pecas_repetidas(null);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.pecas_repetidas(uuid[]) to supabase_read_only_user;
  end if;
end $$;
