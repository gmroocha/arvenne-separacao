-- Pedido de venda da LR direto no Bling (API v3), pela etapa Nota fiscal e pela página PDV LR.
-- Tudo o que fala com o Bling passa pela função Edge `bling`. Aqui ficam só os dados:
--   bling_conexao  a conexão com o Bling da LR (tokens). Linha única. NINGUÉM do app lê: só o service_role (a Edge).
--   bling_codigos  código do app (SKU) -> código no Bling da LR, para os SKUs que são diferentes. O app lembra.
--   bling_pedidos  o que já foi gerado no Bling (serve para não duplicar e para o histórico da página PDV LR).
--   bling_situacao() diz se está conectado, sem nunca devolver token.
-- Nada disto entra em caminho quente (a esteira e as listas não tocam nestas tabelas).

-- 1. Conexão: tokens que só a função Edge enxerga ----------------------------------------------------------------
create table if not exists public.bling_conexao (
  id boolean primary key default true check (id),            -- linha única
  access_token text,
  refresh_token text,
  expira_em timestamptz,                                      -- do access_token (6 h); o refresh vale 30 dias
  estado_oauth text,                                          -- anti-falsificação do "Conectar ao Bling" (CSRF)
  estado_expira timestamptz,
  contato_id bigint,                                          -- a Arvenne como cliente no Bling da LR
  contato_nome text,
  conectado_por text,
  conectado_em timestamptz
);
alter table public.bling_conexao enable row level security;
-- Sem política e sem GRANT para anon/authenticated: o navegador nunca lê nem grava esta tabela.
revoke all on public.bling_conexao from public, anon, authenticated;
grant select, insert, update on public.bling_conexao to service_role;

-- 2. Códigos que o app lembra ------------------------------------------------------------------------------------
create table if not exists public.bling_codigos (
  sku text primary key,
  codigo_bling text not null check (btrim(codigo_bling) <> ''),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
alter table public.bling_codigos enable row level security;
drop policy if exists equipe_le on public.bling_codigos;
create policy equipe_le on public.bling_codigos for select to authenticated using (true);
revoke all on public.bling_codigos from public, anon, authenticated;
grant select on public.bling_codigos to authenticated;               -- a gravação é só pela Edge (service_role)
grant select, insert, update, delete on public.bling_codigos to service_role;

-- 3. Pedidos gerados no Bling ------------------------------------------------------------------------------------
create table if not exists public.bling_pedidos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id),               -- nulo quando veio da página PDV LR
  bling_id bigint not null,
  bling_numero text,
  itens jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,                     -- calculado na Edge; a tela só exibe
  criado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists bling_pedidos_pedido on public.bling_pedidos (pedido_id) where pedido_id is not null;
create index if not exists bling_pedidos_recentes on public.bling_pedidos (criado_em desc);
alter table public.bling_pedidos enable row level security;
drop policy if exists equipe_le on public.bling_pedidos;
create policy equipe_le on public.bling_pedidos for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
revoke all on public.bling_pedidos from public, anon, authenticated;
grant select on public.bling_pedidos to authenticated;               -- sem DELETE: nada é apagado pelo app
grant select, insert, update on public.bling_pedidos to service_role;

-- 4. Situação da conexão, sem token ------------------------------------------------------------------------------
create or replace function public.bling_situacao()
returns table (conectado boolean, contato_definido boolean, contato_nome text, expira_em timestamptz)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(c.refresh_token is not null, false), coalesce(c.contato_id is not null, false), c.contato_nome, c.expira_em
  from (select 1) x left join public.bling_conexao c on true
$$;
revoke all on function public.bling_situacao() from public, anon;
grant execute on function public.bling_situacao() to authenticated, service_role;
