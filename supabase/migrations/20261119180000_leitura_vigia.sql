-- Conferência somente leitura pelo CLI também pode rodar a lista do vigia (só lê; não grava execução).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.listar_inconsistencias() to supabase_read_only_user;
    grant execute on function public.feriados_ate() to supabase_read_only_user;
  end if;
end $$;
