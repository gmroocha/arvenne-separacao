-- Catálogo público do site (copiado de products.json pela função catalogo-sync).
-- O carrinho da cliente e a busca da aba "Site" leem daqui: nenhuma chamada externa na hora.
create table public.catalogo_site (
  variant_id     bigint primary key,
  produto_id     bigint,
  sku            text,
  produto        text not null,
  variante       text,
  preco          numeric(10,2),
  foto_url       text,
  atualizado_em  timestamptz not null default now()
);
create index catalogo_site_sku     on public.catalogo_site (lower(sku));
create index catalogo_site_produto on public.catalogo_site (lower(produto));

alter table public.catalogo_site enable row level security;
create policy equipe_le on public.catalogo_site for select to authenticated using (true);

grant select on public.catalogo_site to authenticated;
grant all    on public.catalogo_site to service_role;

-- Romaneio público passa a mostrar o código (SKU) da peça: é o mesmo do fornecedor e não é segredo.
-- Continua sem CPF, e-mail, telefone, endereço, custo e histórico.
create or replace function public.romaneio_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from public.v_pedidos where token_publico = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'numero',   v.numero,
    'cliente',  nullif(split_part(trim(coalesce(v.cliente_nome, '')), ' ', 1), ''),
    'fase',     v.fase,
    'status',   v.status,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'sku', i.sku, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
      from public.pedido_itens i
      where i.pedido_id = v.id and i.status <> 'removido'), '[]'::jsonb),
    'subtotal',      v.subtotal,
    'desconto',      v.desconto,
    'cupom',         v.cupom,
    'frete_tipo',    v.frete_tipo,
    'frete_cobrado', v.frete_na_conta,
    'total',         v.total
  );
end $$;

revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated;
