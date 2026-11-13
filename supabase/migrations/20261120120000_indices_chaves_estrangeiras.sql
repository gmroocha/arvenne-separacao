-- V48: índices de apoio às cinco relações sinalizadas pelo advisor.
-- Nenhum índice ou dado existente é removido.
create index if not exists bipagens_item_idx on public.bipagens(item_id);
create index if not exists movimentos_financeiros_estorna_pedido_idx on public.movimentos_financeiros(estorna_id,pedido_id);
create index if not exists pedido_itens_peca_clube_idx on public.pedido_itens(peca_clube_id);
create index if not exists pedidos_acerto_troca_idx on public.pedidos(acerto_troca_id);
create index if not exists troca_escolhas_opcao_peca_idx on public.troca_escolhas(opcao_id,troca_peca_id);
