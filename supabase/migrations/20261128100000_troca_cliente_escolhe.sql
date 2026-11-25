-- Correção (25/11/2026): a cliente não conseguia escolher na página da troca ("Este pedido não está com você.").
-- Causa: a Fase 2 (20261126100000) pôs `exigir_pedido_da_peca_troca` no começo de troca_carrinho_definir, que também é
-- chamada por troca_escolher (página pública, anon). A cliente não é ninguém do Time, então a conferência recusava.
-- Correção: o miolo vira troca_carrinho_aplicar (interna, sem GRANT para ninguém); troca_carrinho_definir (equipe) confere
-- o pedido e chama o miolo; troca_escolher (cliente, já validada pelo token) chama o miolo direto.

create or replace function public.troca_carrinho_aplicar(p_peca uuid, p_opcao uuid)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
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
revoke all on function public.troca_carrinho_aplicar(uuid, uuid) from public, anon, authenticated;

create or replace function public.troca_carrinho_definir(p_peca uuid, p_opcao uuid)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  perform public.exigir_pedido_da_peca_troca(p_peca);
  perform public.troca_carrinho_aplicar(p_peca, p_opcao);
end $$;
revoke all on function public.troca_carrinho_definir(uuid, uuid) from public, anon;
grant execute on function public.troca_carrinho_definir(uuid, uuid) to authenticated;

create or replace function public.troca_escolher(p_token uuid, p_item uuid, p_tipo text, p_opcao uuid default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
begin
  if p_tipo is null or p_tipo not in ('opcao', 'credito', 'whatsapp') then
    raise exception 'Escolha inválida';
  end if;
  select * into v_t from trocas where token = p_token for update;
  if not found or v_t.status not in ('enviada', 'respondida') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select status into v_ped from pedidos where id = v_t.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select * into v_p from troca_pecas where troca_id = v_t.id and item_id = p_item for update;
  if not found or v_p.concluida_em is not null or not exists (
      select 1 from pedido_itens i where i.id=v_p.item_id and i.status in ('falta','defeito')) then
    raise exception 'Peça inválida';
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id and preco is not null) then
      raise exception 'Opção inválida';
    end if;
  else
    p_opcao := null;
  end if;
  -- "Quero esta" = carrinho só com essa opção (quantidade da linha); crédito/WhatsApp esvaziam o carrinho.
  perform public.troca_carrinho_aplicar(v_p.id, p_opcao);
  update troca_pecas
     set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now(), escolhida_por = null
   where id = v_p.id;
  -- Respondida quando todas as peças (ainda não feitas) têm escolha.
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null
                   and i.status in ('falta','defeito') and tp.escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_escolher(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_escolher(uuid, uuid, text, uuid) to anon, authenticated;
