-- Zera os dados de teste antes de começar a usar o app de verdade.
-- NÃO RODAR sem o "sim" do Gustavo, na hora. Antes: ajustar o segredo SHOPIFY_IMPORTAR_DESDE
-- (painel do Supabase → Edge Functions → Secrets) para a data de início, senão o próximo
-- Sincronizar traz de volta os pedidos antigos da Shopify.
-- Mantém: catalogo_site, pecas_clube, feriados e as fotos do bucket.
-- Rodar: npx supabase db query --remote --file scripts/zerar-testes.sql (com --yes em modo agente)
begin;
delete from public.troca_opcoes;
delete from public.troca_pecas;
delete from public.trocas;
delete from public.bipagens;
update public.feedbacks set pedido_id = null;
delete from public.feedbacks;
delete from public.pedido_eventos;
delete from public.pedido_itens;
delete from public.pedidos;
delete from public.clientes;
alter sequence public.pedido_whatsapp_seq restart with 1;
commit;
