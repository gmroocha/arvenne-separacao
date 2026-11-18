-- Shopify automática: de hora em hora (00:00, 01:00, ... 23:00) o banco chama a função Edge shopify-sync.
-- O botão "Sincronizar" continua igual. A função Edge é idempotente: pedido novo entra inteiro; pedido que já entrou só
-- completa o que está nulo e não mexe no andamento. Se a sincronização parar no teto de tempo (resposta "continuar"),
-- a próxima hora completa.
--
-- O segredo NÃO está neste arquivo: a função lê o valor `cron_secret` do Vault do Supabase (o mesmo texto do segredo
-- CRON_SECRET das funções Edge), que o Gustavo grava direto no painel (SQL Editor). Sem o segredo no Vault, a função não
-- chama nada e deixa um aviso no log do Postgres: nada quebra.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function public.sincronizar_shopify_agendado() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_segredo text; v_pedido bigint;
begin
  select ds.decrypted_secret into v_segredo from vault.decrypted_secrets ds where ds.name = 'cron_secret' limit 1;
  if v_segredo is null or v_segredo = '' then
    raise warning 'shopify-sync agendada: falta o segredo cron_secret no Vault; nada foi chamado';
    return null;
  end if;
  -- A requisição sai assíncrona (pg_net); o resultado fica em net._http_response e no log da função Edge.
  select net.http_post(
    url := 'https://fdcjpqnwkdzqipkikocl.supabase.co/functions/v1/shopify-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  ) into v_pedido;
  return v_pedido;
end $$;
-- Só o agendador (postgres) executa. Nenhum botão do app, nem anon nem authenticated nem service_role, chama esta função.
revoke all on function public.sincronizar_shopify_agendado() from public, anon, authenticated, service_role;

-- Um agendamento só, pelo nome: rodar de novo troca o horário e o comando, sem duplicar. 0 * * * * = toda hora cheia
-- (UTC; de hora em hora é o mesmo em qualquer fuso).
select cron.schedule('shopify-sync', '0 * * * *', 'select public.sincronizar_shopify_agendado();');
