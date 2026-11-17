-- Tempo real mais leve (pedido do Gustavo, 17/11/2026, plano Free/Nano).
-- Antes: postgres_changes em 6 tabelas. O Realtime lia o WAL o tempo todo e conferia a RLS de cada mudança
-- para cada aba conectada (maior consumo do banco: 202 mil leituras, ~1.500 s acumulados).
-- Agora: um aviso curto por comando ("mudou", com a tabela e os pedidos afetados) no canal privado "pedidos"
-- (Broadcast a partir do banco). O app recarrega o que já recarregava; nenhum dado de pedido vai na mensagem.

create function public.tg_avisar_mudanca() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_col   text := coalesce(tg_argv[0], '');   -- coluna com o pedido ('' = a tabela não tem)
  v_fonte text := case tg_op when 'INSERT' then 'novos' when 'DELETE' then 'antigos'
                             else '(select * from novos union all select * from antigos)' end;
  v_n     bigint;
  v_ids   jsonb;
begin
  execute format('select count(*), %s from %s x',
                 case when v_col = '' then 'null::jsonb'
                      else format('jsonb_agg(distinct x.%I) filter (where x.%I is not null)', v_col, v_col) end,
                 v_fonte)
    into v_n, v_ids;
  if v_n = 0 then return null; end if;
  -- realtime.send nunca derruba a gravação: em caso de erro só registra um aviso.
  perform realtime.send(jsonb_build_object('t', tg_table_name, 'p', coalesce(v_ids, '[]'::jsonb)), 'mudou', 'pedidos', true);
  return null;
end $$;
revoke all on function public.tg_avisar_mudanca() from public, anon, authenticated, service_role;

do $$
declare
  r record;
begin
  for r in select * from (values ('pedidos', 'id'), ('pedido_itens', 'pedido_id'), ('trocas', 'pedido_id'),
                                 ('troca_pecas', ''), ('troca_opcoes', '')) as t(tabela, coluna)
  loop
    execute format('create trigger avisar_ins after insert on public.%I referencing new table as novos
                    for each statement execute function public.tg_avisar_mudanca(%L)', r.tabela, r.coluna);
    execute format('create trigger avisar_upd after update on public.%I referencing old table as antigos new table as novos
                    for each statement execute function public.tg_avisar_mudanca(%L)', r.tabela, r.coluna);
    execute format('create trigger avisar_del after delete on public.%I referencing old table as antigos
                    for each statement execute function public.tg_avisar_mudanca(%L)', r.tabela, r.coluna);
  end loop;
end $$;

-- Só a equipe logada entra no canal privado "pedidos".
create policy equipe_recebe_pedidos on realtime.messages for select to authenticated
  using (realtime.topic() = 'pedidos' and extension = 'broadcast');

-- Fim do postgres_changes: as tabelas saem da publicação do Realtime (o WAL deixa de ser lido para elas).
do $$
declare
  t text;
begin
  foreach t in array array['pedidos', 'pedido_itens', 'trocas', 'troca_pecas', 'troca_opcoes', 'troca_escolhas'] loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

-- Selo "Peças repetidas" da barra lateral: só a contagem, sem calcular prazo de cada peça (a view completa
-- calcula prazo_envio e horas_uteis linha a linha: ~100 ms; a contagem leva poucos ms).
create function public.contagem_repetidas() returns int
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::int from (
    select 1
      from public.pedido_itens i
      join public.pedidos p on p.id = i.pedido_id
     where p.status in ('novo', 'separacao') and i.status = 'pendente'
     group by coalesce(nullif(i.sku, ''), i.nome || ' · ' || coalesce(i.variante, ''))
    having count(distinct p.id) > 1) x
$$;
revoke all on function public.contagem_repetidas() from public, anon;
grant execute on function public.contagem_repetidas() to authenticated, service_role;
