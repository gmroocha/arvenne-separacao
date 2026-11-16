-- Zera os dados de teste antes de começar a usar o app de verdade.
-- NÃO RODAR sem o "sim" do Gustavo, na hora. Antes: ajustar o segredo SHOPIFY_IMPORTAR_DESDE
-- (painel do Supabase → Edge Functions → Secrets, ou `npx supabase secrets set`) para a data de
-- início, senão o próximo Sincronizar traz de volta os pedidos antigos da Shopify.
-- Apaga: pedidos, peças, eventos, bipagens, trocas (com opções e carrinho), movimentos financeiros,
-- feedbacks e clientes. Mantém: catalogo_site, catalogo_sincronizacao, pecas_clube, feriados,
-- vistoria_execucoes e as fotos do bucket.
-- TRUNCATE (e não DELETE) porque os movimentos financeiros são imutáveis por gatilho de linha e
-- há chaves em ciclo (pedidos ↔ trocas ↔ peças); TRUNCATE limpa o conjunto inteiro de uma vez.
-- Rodar: npx supabase db query --remote --file scripts/zerar-testes.sql (com --yes em modo agente)
-- Validado por tests/banco/zerar.test.mjs.
begin;
truncate table
  public.movimentos_financeiros,
  public.troca_escolhas,
  public.troca_opcoes,
  public.troca_pecas,
  public.trocas,
  public.bipagens,
  public.feedbacks,
  public.pedido_eventos,
  public.pedido_itens,
  public.pedidos,
  public.clientes
  restart identity;
alter sequence public.pedido_whatsapp_seq restart with 1;
commit;
