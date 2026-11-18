-- Rodada 3 (18/11/2026). Migration ainda NÃO aplicada: só entra depois do dry-run e do "sim" do Gustavo.
--  A) encontrar_peca: "Encontrada" numa peça em falta/troca (tira a peça da troca aberta e marca como encontrada).
--  B) enviar_troca não leva mais o pedido a "Aguardando cliente" (só o botão "Cliente avisada" faz isso).
--  C) Etapa "Enviar rastreio" (pedidos que não são da Shopify), entre Postagem e Concluído.
--  D) Papel na equipe (gestor / funcionária) e permissões do Time.
--  E) Clube com produto "pai" e variantes (clube_modelos) e gravação em lote.
-- Tudo novo tem GRANT explícito (o projeto não dá GRANT automático). Nenhum e-mail aqui dentro.

-- ---------------------------------------------------------------------------------------------------------------
-- A) "Encontrada": a peça em falta/troca volta à fila como encontrada (vai direto para a Conferência).
-- "Voltar a pendente" deixava a troca aberta esperando uma peça que já não faltava (troca_inativa_pendente).
-- Aqui a peça sai da troca ainda não concluída, a troca se ajusta (cancelada se ficou vazia, respondida se
-- as outras já escolheram) e o pedido sai do desvio, tudo na mesma transação (alterar_item).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.encontrar_peca(p_item uuid) returns void
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_pedido uuid;
  v_status text;
  r record;
begin
  select pedido_id, status into v_pedido, v_status from public.pedido_itens where id = p_item;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_status not in ('falta','defeito') then raise exception 'Só uma peça em falta pode ser marcada como encontrada'; end if;
  perform 1 from public.pedidos where id = v_pedido for update;
  for r in
    select tp.id, tp.troca_id, t.status from public.troca_pecas tp join public.trocas t on t.id = tp.troca_id
     where tp.item_id = p_item and tp.concluida_em is null and t.status in ('rascunho','enviada','respondida')
  loop
    delete from public.troca_pecas where id = r.id;
    if not exists (select 1 from public.troca_pecas where troca_id = r.troca_id) then
      update public.trocas set status = 'cancelada' where id = r.troca_id;
    elsif r.status = 'enviada' and not exists (
        select 1 from public.troca_pecas tp join public.pedido_itens i on i.id = tp.item_id
         where tp.troca_id = r.troca_id and tp.concluida_em is null and i.status in ('falta','defeito')
           and tp.escolha_tipo is null and tp.item_id <> p_item) then
      update public.trocas set status = 'respondida', respondida_em = now() where id = r.troca_id;
    end if;
  end loop;
  perform public.alterar_item(p_item, jsonb_build_object('status', 'encontrado', 'observacao', null));
end $$;
revoke all on function public.encontrar_peca(uuid) from public, anon;
grant execute on function public.encontrar_peca(uuid) to authenticated, service_role;
