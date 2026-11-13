-- V44: a vistoria pelo CLI precisa das mesmas funções de LEITURA do painel da troca.
-- Não concede escrita e não expõe consultas internas a anon. O papel existe no Supabase hospedado.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant execute on function public.troca_painel(uuid) to supabase_read_only_user;
    grant execute on function public.sugerir_troca(uuid,text,text,numeric,text,boolean,boolean) to supabase_read_only_user;
    grant execute on function public.troca_valor_pago(uuid) to supabase_read_only_user;
    grant execute on function public.troca_fator(uuid) to supabase_read_only_user;
    grant execute on function public.fator_pedido(uuid) to supabase_read_only_user;
  end if;
end $$;
