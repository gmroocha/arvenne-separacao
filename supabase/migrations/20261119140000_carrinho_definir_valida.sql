-- V27: o auxiliar troca_carrinho_definir (usado por troca_escolher e troca_aprovar, e executável pela equipe)
-- não verificava se a troca/peça já terminou. A opção de outra peça já é barrada pela chave composta
-- (20261117090000); aqui também se confere o vínculo, para a mensagem ser clara.
create or replace function public.troca_carrinho_definir(p_peca uuid, p_opcao uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_qtd int;
  v_concluida timestamptz;
  v_status text;
begin
  select i.qtd, p.concluida_em, t.status into v_qtd, v_concluida, v_status
    from troca_pecas p join pedido_itens i on i.id = p.item_id join trocas t on t.id = p.troca_id
   where p.id = p_peca for update of p;
  if not found then raise exception 'Peça da troca não encontrada'; end if;
  if v_concluida is not null or v_status in ('concluida', 'cancelada') then
    raise exception 'Esta troca já foi concluída ou cancelada; a escolha não pode mudar';
  end if;
  if p_opcao is not null and not exists (select 1 from troca_opcoes o where o.id = p_opcao and o.troca_peca_id = p_peca) then
    raise exception 'Esta opção não pertence a esta peça';
  end if;
  perform set_config('arvenne.sem_recalculo', '1', true);
  if p_opcao is not null then
    insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values (p_peca, p_opcao, v_qtd)
      on conflict (troca_peca_id, opcao_id) do update set qtd = excluded.qtd;
  end if;
  delete from troca_escolhas where troca_peca_id = p_peca and opcao_id is distinct from p_opcao;
  perform set_config('arvenne.sem_recalculo', '', true);
end $$;
revoke all on function public.troca_carrinho_definir(uuid, uuid) from public, anon;
grant execute on function public.troca_carrinho_definir(uuid, uuid) to authenticated;
