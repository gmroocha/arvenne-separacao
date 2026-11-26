-- Etiqueta "para a live" (26/11/2026): SKU, preço cheio e preço com desconto, sem código de barras.
-- A conta do desconto fica no banco (a tela não calcula dinheiro): preço * (1 - pct/100), arredondado ao centavo.
-- Lê só peças que a pessoa já enxerga (security invoker: vale a RLS de pecas_clube).
create or replace function public.precos_etiqueta_live(p_ids uuid[], p_pct numeric)
returns table (id uuid, codigo text, preco numeric, preco_desconto numeric)
language plpgsql stable security invoker set search_path to 'public','pg_temp' as $$
begin
  if p_pct is null or p_pct <= 0 or p_pct >= 100 then
    raise exception 'O desconto precisa ser maior que 0%% e menor que 100%%';
  end if;
  return query
    select c.id, c.codigo, c.preco::numeric, round(c.preco * (1 - p_pct / 100), 2)::numeric
      from public.pecas_clube c
     where c.id = any(p_ids) and c.preco is not null;
end $$;
revoke all on function public.precos_etiqueta_live(uuid[], numeric) from public, anon;
grant execute on function public.precos_etiqueta_live(uuid[], numeric) to authenticated, service_role;
