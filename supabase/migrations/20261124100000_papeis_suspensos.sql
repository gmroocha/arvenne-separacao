-- Papéis suspensos (pedido do Gustavo em 18/11/2026): por enquanto todo mundo logado pode fazer tudo no Time
-- (adicionar, editar, desativar e excluir pessoas). A coluna equipe.papel e os dados continuam guardados, só não valem.
-- Para voltar com os papéis depois: recriar sou_gestor() e o gatilho equipe_ultimo_gestor como em
-- 20261123090000_rodada3.sql (a função tg_equipe_ultimo_gestor fica no banco, sem uso).
create or replace function public.sou_gestor() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select true
$$;
revoke all on function public.sou_gestor() from public, anon;
grant execute on function public.sou_gestor() to authenticated, service_role;

-- Sem papéis, não há "último gestor" a proteger.
drop trigger if exists equipe_ultimo_gestor on public.equipe;
