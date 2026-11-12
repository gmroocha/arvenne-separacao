-- V28: depois de concluída, a peça da troca tinha as opções editáveis; mudar o preço reescrevia o resumo
-- público (recalculado com o preço atual) enquanto o resultado financeiro ficava congelado.
-- Agora opção de peça concluída (ou de troca encerrada) não muda nem recebe opção nova.
create function public.tg_troca_opcoes_historico() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_peca uuid := case when tg_op = 'DELETE' then old.troca_peca_id else new.troca_peca_id end;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then return new; end if;
  if exists (select 1 from public.troca_pecas p join public.trocas t on t.id = p.troca_id
             where p.id in (v_peca, case when tg_op = 'UPDATE' then old.troca_peca_id end)
               and (p.concluida_em is not null or t.status in ('concluida', 'cancelada'))) then
    raise exception 'Esta troca já foi concluída: as opções fazem parte do histórico e não podem mudar';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.tg_troca_opcoes_historico() from public, anon, authenticated, service_role;
create trigger troca_opcoes_historico before insert or update on public.troca_opcoes
  for each row execute function public.tg_troca_opcoes_historico();
