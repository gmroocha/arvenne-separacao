-- Feedbacks da equipe: botão "Feedback" no topo de todas as telas e página /feedbacks.
-- Ficam guardados para sempre e visíveis a toda a equipe logada. Nada é apagado pelo app.

create table public.feedbacks (
  id             uuid primary key default gen_random_uuid(),
  texto          text not null check (length(btrim(texto)) > 0),
  pagina         text,                                              -- rota em que a pessoa estava
  pedido_id      uuid references public.pedidos(id) on delete set null,
  usuario_email  text default public.usuario_atual_email(),
  created_at     timestamptz not null default now(),
  resolvido_em   timestamptz
);
create index feedbacks_aberto on public.feedbacks (resolvido_em, created_at desc);
create index feedbacks_pedido on public.feedbacks (pedido_id) where pedido_id is not null;

alter table public.feedbacks enable row level security;
create policy equipe_le    on public.feedbacks for select to authenticated using (true);
create policy equipe_cria  on public.feedbacks for insert to authenticated with check (true);
create policy equipe_edita on public.feedbacks for update to authenticated using (true) with check (true);

-- Permissões explícitas (padrão de 20261110180000_permissoes.sql): "anon" nada, sem DELETE.
-- Por colunas: a equipe só preenche texto/página/pedido (quem e quando vêm do banco) e só
-- altera "resolvido_em".
grant select on public.feedbacks to authenticated;
grant insert (texto, pagina, pedido_id) on public.feedbacks to authenticated;
grant update (resolvido_em)             on public.feedbacks to authenticated;
grant select on public.feedbacks to service_role;
