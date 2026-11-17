-- Feedback de uma peça: opção "Feedback" no menu "…" das peças (separação, conferência, etiquetagem).
-- Serve para avisar que a foto está diferente da peça, que o código não bate etc.
-- Guarda a linha do pedido (item_id) e o código (sku) do momento, para análises futuras mesmo que a
-- peça mude depois. Nada é apagado pelo app.

alter table public.feedbacks
  add column item_id uuid references public.pedido_itens(id) on delete set null,
  add column sku     text;

create index feedbacks_item on public.feedbacks (item_id) where item_id is not null;
create index feedbacks_sku  on public.feedbacks (sku) where sku is not null;

-- Permissões explícitas (este projeto não dá GRANT automático): a equipe passa a preencher também
-- a peça e o código. SELECT já cobre a tabela inteira; UPDATE continua só em "resolvido_em".
grant insert (item_id, sku) on public.feedbacks to authenticated;
