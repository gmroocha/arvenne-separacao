-- Fase 2a/2b (19/11/2026): login por nome de usuário e papéis de volta.
--
-- 1) Cada pessoa do Time pode ter um acesso por "usuário" e senha, criado pelo gestor. O Supabase exige e-mail, então a
--    função Edge `equipe-acesso` cria um e-mail interno (usuario + arroba + equipe.arvenne.invalid, domínio que não existe) que ninguém vê e grava aqui o
--    `usuario` e o `user_id` (o id em auth.users, sem chave estrangeira: o schema auth não é nosso).
-- 2) membro_atual(): quem está logado, pelo user_id do login ou, para quem entra com e-mail real (o Gustavo), pelo e-mail.
-- 3) Papéis voltam (estavam suspensos desde 20261124100000): sou_gestor() = pessoa ativa com papel gestor. Sem login de
--    usuário (cron, gatilhos, service_role das funções Edge) vale como sistema e passa.
-- Nenhum e-mail fica nesta migration.

alter table public.equipe add column usuario text unique
  check (usuario is null or usuario ~ '^[a-z0-9._-]{2,30}$');
alter table public.equipe add column user_id uuid unique;
comment on column public.equipe.usuario is 'Nome de usuário do login por nome (minúsculas, sem acento). Criado pela função equipe-acesso.';
comment on column public.equipe.user_id is 'id do login em auth.users. Preenchido pela função equipe-acesso.';

-- Chamada sem usuário (cron, gatilhos, service_role): não há JWT de pessoa. Um JWT de pessoa sempre traz "role".
create or replace function public.sou_sistema() returns boolean
language sql stable set search_path to 'public','pg_temp' as $$
  select case when nullif(current_setting('request.jwt.claims', true), '') is null then true
              else coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' end
$$;
revoke all on function public.sou_sistema() from public, anon;
grant execute on function public.sou_sistema() to authenticated, service_role;

-- Id da pessoa ativa do Time que está logada: pelo user_id (login por usuário) ou, na falta, pelo e-mail do login.
create or replace function public.membro_atual() returns uuid
language sql stable security definer set search_path to 'public','pg_temp' as $$
  with c as (select nullif(current_setting('request.jwt.claims', true), '')::jsonb as j)
  select e.id from public.equipe e, c
   where e.ativo and (
         (e.user_id is not null and e.user_id::text = c.j ->> 'sub')
      or (e.email is not null and btrim(e.email) <> '' and lower(btrim(e.email)) = lower(btrim(coalesce(c.j ->> 'email', '')))))
   order by (e.user_id is not null and e.user_id::text = c.j ->> 'sub') desc, e.id
   limit 1
$$;
revoke all on function public.membro_atual() from public, anon;
grant execute on function public.membro_atual() to authenticated, service_role;

create or replace function public.sou_gestor() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select public.sou_sistema() or exists (
    select 1 from public.equipe e where e.id = public.membro_atual() and e.ativo and e.papel = 'gestor')
$$;
revoke all on function public.sou_gestor() from public, anon;
grant execute on function public.sou_gestor() to authenticated, service_role;

-- Ler continua com todos; escrever só o gestor (a RLS recusa a funcionária).
drop policy if exists equipe_cria on public.equipe;
drop policy if exists equipe_edita on public.equipe;
create policy equipe_cria on public.equipe for insert to authenticated with check ((select public.sou_gestor()));
create policy equipe_edita on public.equipe for update to authenticated
  using ((select public.sou_gestor())) with check ((select public.sou_gestor()));
-- A função Edge (service_role) grava usuario e user_id depois de criar o login.
grant select, update on public.equipe to service_role;

-- Excluir pessoa: só o gestor.
create or replace function public.excluir_membro(p_membro uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.sou_gestor() then raise exception 'Só o gestor pode excluir pessoas do time'; end if;
  if not exists (select 1 from public.equipe where id = p_membro) then raise exception 'Pessoa não encontrada'; end if;
  update public.pedidos set responsaveis = coalesce((
      select jsonb_object_agg(e.key, e.value) from jsonb_each(responsaveis) e where e.value #>> '{}' <> p_membro::text), '{}'::jsonb)
    where exists (select 1 from jsonb_each(responsaveis) e where e.value #>> '{}' = p_membro::text);
  delete from public.equipe where id = p_membro;
end $$;
revoke all on function public.excluir_membro(uuid) from public, anon;
grant execute on function public.excluir_membro(uuid) to authenticated, service_role;

-- Ninguém tira o último gestor ativo (excluindo, desativando ou passando para funcionária).
create or replace function public.tg_equipe_ultimo_gestor() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if old.papel = 'gestor' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'gestor' or not new.ativo)
     and not exists (select 1 from public.equipe e where e.id <> old.id and e.papel = 'gestor' and e.ativo) then
    raise exception 'O time precisa de pelo menos um gestor ativo';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.tg_equipe_ultimo_gestor() from public, anon, authenticated;
drop trigger if exists equipe_ultimo_gestor on public.equipe;
create trigger equipe_ultimo_gestor before update or delete on public.equipe
  for each row execute function public.tg_equipe_ultimo_gestor();

-- Quem cuida de cada etapa quando o pedido chega nela sem responsável (usado no gatilho de pedidos, próxima migration).
create table public.responsavel_padrao (
  etapa text primary key check (etapa in ('separacao','conferencia','bipagem','faturamento','embalagem','pronto_envio','enviar_rastreio')),
  membro_id uuid references public.equipe(id) on delete set null
);
create index responsavel_padrao_membro on public.responsavel_padrao (membro_id);
insert into public.responsavel_padrao (etapa) values
  ('separacao'), ('conferencia'), ('bipagem'), ('faturamento'), ('embalagem'), ('pronto_envio'), ('enviar_rastreio');
alter table public.responsavel_padrao enable row level security;
create policy padrao_le on public.responsavel_padrao for select to authenticated using (true);
create policy padrao_edita on public.responsavel_padrao for update to authenticated
  using ((select public.sou_gestor())) with check ((select public.sou_gestor()));
revoke all on public.responsavel_padrao from public, anon;
grant select, update on public.responsavel_padrao to authenticated;
grant select on public.responsavel_padrao to service_role;
