-- V23: o app usava a gravação mais recente de qualquer variante (inclusive a leitura avulsa do carrinho)
-- como se fosse o fim da última sincronização do catálogo inteiro; a seguinte pulava mudanças.
-- Agora a função catalogo-sync grava aqui o início de cada leitura completa/incremental concluída.
create table public.catalogo_sincronizacao (
  modo         text primary key check (modo in ('completo', 'incremental')),
  iniciado_em  timestamptz not null,
  concluido_em timestamptz not null default now(),
  variantes    int not null default 0 check (variantes >= 0)
);
alter table public.catalogo_sincronizacao enable row level security;
create policy equipe_le on public.catalogo_sincronizacao for select to authenticated using (true);
revoke all on public.catalogo_sincronizacao from public, anon, authenticated;
grant select on public.catalogo_sincronizacao to authenticated;
grant all on public.catalogo_sincronizacao to service_role;
