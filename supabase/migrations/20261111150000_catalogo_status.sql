-- O catálogo passa a vir da Admin API da Shopify (função catalogo-sync), que informa o status do
-- produto (ACTIVE, DRAFT, ARCHIVED). A busca da aba "Site" mostra só os ativos; o carrinho da
-- cliente aceita qualquer status, porque a peça já estava nele.
alter table public.catalogo_site add column if not exists status text;
