-- Vigia só observa. Não move, não apaga e não altera dinheiro de nenhum pedido.
create table public.vistoria_execucoes (
  id bigint generated always as identity primary key,
  executada_em timestamptz not null default now(),
  ocorrencias jsonb not null check (jsonb_typeof(ocorrencias) = 'array'),
  qtd_ocorrencias int not null check (qtd_ocorrencias >= 0),
  constraint vistoria_contagem_confere check (qtd_ocorrencias = jsonb_array_length(ocorrencias))
);
alter table public.vistoria_execucoes enable row level security;
create policy equipe_le on public.vistoria_execucoes for select to authenticated using (true);
revoke all on public.vistoria_execucoes from public, anon, authenticated, service_role;
grant select on public.vistoria_execucoes to authenticated, service_role;

create function public.listar_inconsistencias()
returns table (pedido_id uuid, numero text, regra text, detalhe text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with valores as materialized (select * from public.v_pedidos)
  select v.id, v.numero, 'composicao_total'::text,
         'O total difere de peças menos descontos e mais frete.'::text
    from valores v where v.status <> 'somada'
     and abs(v.total - (v.subtotal - v.desconto - v.desconto_pix + v.frete_na_conta)) > 0.005
  union all
  select v.id, v.numero, 'total_negativo', 'O total do pedido ficou negativo.'
    from valores v where v.total < 0 or v.total_geral < 0
  union all
  select v.id, v.numero, 'etapa_adiantada', 'Há peças pendentes, em falta ou com trabalho incompleto nesta etapa.'
    from valores v
   where v.status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado')
     and exists (
       select 1 from public.pedido_itens i where i.pedido_id = v.id and i.status <> 'removido'
         and (i.status <> 'encontrado'
              or (v.status in ('etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado') and i.conferido_em is null)
              or (v.status in ('bipagem','faturamento','embalagem','pronto_envio','enviado') and i.etiquetado_em is null)
              or (v.status in ('faturamento','embalagem','pronto_envio','enviado') and i.qtd_bipada < i.qtd)))
  union all
  select p.id, p.numero, 'bipagem_invalida', 'Contagem de bipagem fora da quantidade do pedido.'
    from public.pedidos p where exists (
      select 1 from public.pedido_itens i where i.pedido_id=p.id and (i.qtd_bipada < 0 or i.qtd_bipada > i.qtd))
  union all
  select v.id, v.numero, 'somada_sem_composicao', 'A venda somada tem valor registrado, mas o romaneio perdeu as peças ou o total.'
    from valores v join public.pedidos p on p.id=v.id
   where v.status='somada' and p.somada_valor > 0 and (v.total=0 or v.qtd_pecas=0)
  union all
  select v.id, v.numero, 'pagamento_a_conferir', 'O total atual difere do pagamento registrado; confira trocas, acréscimos e acertos.'
    from valores v where v.fase='expedicao' and v.total_pago is not null
     and abs(v.total_geral-v.total_pago) > 0.005 and v.a_devolver=0
     and not exists (select 1 from public.trocas t where t.pedido_id=v.id and t.status <> 'cancelada'
                       and (t.status in ('rascunho','enviada','respondida') or t.acerto_status='pendente'))
  union all
  select p.id, p.numero, 'acerto_zero_pendente', 'O acerto permanece pendente apesar de o saldo líquido ser zero.'
    from public.v_pedido_acerto a join public.pedidos p on p.id=a.pedido_id
   where a.acerto_status='pendente' and abs(a.saldo) < 0.005
  union all
  select p.id, p.numero, 'troca_inativa_pendente', 'A troca espera peças que já deixaram de faltar.'
    from public.trocas t join public.pedidos p on p.id=t.pedido_id
   where t.status in ('enviada','respondida')
     and exists (select 1 from public.troca_pecas tp where tp.troca_id=t.id and tp.concluida_em is null)
     and not exists (select 1 from public.troca_pecas tp join public.pedido_itens i on i.id=tp.item_id
                      where tp.troca_id=t.id and tp.concluida_em is null and i.status in ('falta','defeito'));
$$;
revoke all on function public.listar_inconsistencias() from public, anon;
grant execute on function public.listar_inconsistencias() to authenticated, service_role;

create function public.registrar_vistoria() returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_ocorrencias jsonb;
begin
  -- Duas chamadas simultâneas do agendador não duplicam uma execução em andamento.
  if not pg_try_advisory_xact_lock(1710002026) then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.numero,x.regra), '[]'::jsonb)
    into v_ocorrencias from public.listar_inconsistencias() x;
  insert into public.vistoria_execucoes(ocorrencias,qtd_ocorrencias)
    values (v_ocorrencias,jsonb_array_length(v_ocorrencias)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_vistoria() from public, anon, authenticated, service_role;
-- Só postgres/agendador executa a escrita. Nenhum botão do app chama essa função.

create view public.v_vistoria_resumo with (security_invoker = true) as
select id, executada_em, qtd_ocorrencias, ocorrencias
from public.vistoria_execucoes order by id desc limit 1;
revoke all on public.v_vistoria_resumo from public, anon;
grant select on public.v_vistoria_resumo to authenticated, service_role;

-- Infraestrutura hospedada: nos testes só o agendador é simulado, como o Realtime e Storage.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('arvenne-vistoria-diaria', '0 6 * * *', 'select public.registrar_vistoria();');
-- 06h UTC = 03h em São Paulo. Registra uma primeira fotografia para não esperar até amanhã.
select public.registrar_vistoria();
