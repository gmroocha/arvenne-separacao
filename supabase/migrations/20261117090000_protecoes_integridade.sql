-- Fase 2 da vistoria: proteções locais, sem apagar ou corrigir pedidos antigos.
-- Aplicação remota depende de dry-run e do "sim" específico do Gustavo.

alter table public.pedido_itens
  add constraint pedido_itens_bipagem_limite check (qtd_bipada <= qtd) not valid,
  add constraint pedido_itens_vinculo_adicional
    check (adicional = (venda_origem_id is not null) and venda_origem_id is distinct from pedido_id) not valid;
alter table public.pedido_itens validate constraint pedido_itens_bipagem_limite;
alter table public.pedido_itens validate constraint pedido_itens_vinculo_adicional;

-- A opção precisa pertencer à mesma peça: a FK antiga só verificava se ela existia.
alter table public.troca_opcoes add constraint troca_opcoes_id_peca unique (id, troca_peca_id);
alter table public.troca_escolhas
  add constraint troca_escolhas_opcao_da_peca foreign key (opcao_id, troca_peca_id)
    references public.troca_opcoes(id, troca_peca_id) on delete cascade not valid;
alter table public.troca_escolhas validate constraint troca_escolhas_opcao_da_peca;

-- Endurecimento dos quatro caminhos apontados pelo advisor. Sem alteração da regra de negócio.
alter function public.tg_clientes_antes() set search_path = public, pg_temp;
alter function public.usuario_atual_email() set search_path = public, pg_temp;
alter function public.tg_pedidos_antes() set search_path = public, pg_temp;
alter function public.criar_venda(jsonb) set search_path = public, pg_temp;
revoke all on function public.tg_itens_depois() from public, anon, authenticated;
revoke all on function public.tg_pedidos_depois() from public, anon, authenticated;
-- Funções de gatilho são executadas pelo gatilho; o app não precisa chamá-las como RPC.
revoke all on function public.criar_venda(jsonb) from public, anon;
grant execute on function public.criar_venda(jsonb) to authenticated;
