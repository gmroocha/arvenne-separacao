-- Conferência dos números reais pelo CLI em modo somente leitura (npx supabase db query --remote --read-only).
-- O papel supabase_read_only_user já lê todas as tabelas, mas não podia executar as funções usadas pela
-- view v_pedidos (prazo e regras de etapa), então a view inteira falhava. Só EXECUTE; a sessão continua
-- somente leitura, então nenhuma função consegue gravar por esse caminho. anon segue sem acesso.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.prazo_envio(timestamptz) to supabase_read_only_user;
    grant execute on function public.horas_uteis(timestamptz, timestamptz) to supabase_read_only_user;
    grant execute on function public.regras_etapas(jsonb) to supabase_read_only_user;
    grant execute on function public.saldo_financeiro(uuid) to supabase_read_only_user;
  end if;
end $$;
