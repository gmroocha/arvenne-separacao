-- Permissões explícitas nas tabelas.
-- Projetos novos do Supabase não liberam mais as tabelas do schema public para o app por padrão:
-- sem estes GRANTs o app recebe "permission denied for table ...". As regras de linha (RLS) da
-- migration inicial continuam valendo por cima.
--
-- Escolha deliberada: "anon" (quem não fez login) não recebe NADA. E "authenticated" não recebe
-- DELETE em pedidos e itens: pedido nunca é apagado pelo app.

grant usage on schema public to authenticated, service_role;

grant select, insert, update on public.pedidos       to authenticated;
grant select, insert, update on public.pedido_itens  to authenticated;
grant select, insert, update on public.pecas_clube   to authenticated;
grant select, insert         on public.pedido_eventos to authenticated;
grant select                 on public.v_pecas_em_varios_pedidos to authenticated;

grant usage, select on sequence public.pedido_whatsapp_seq to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Funções do servidor (shopify-sync) usam service_role.
grant select, insert, update on public.pedidos, public.pedido_itens, public.pecas_clube to service_role;
grant select, insert         on public.pedido_eventos to service_role;
