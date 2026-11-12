-- V36: o calendário de feriados terminava em 2028; depois disso o prazo de 48 h úteis trataria feriado
-- como dia comum. Cadastra 2029 a 2040 com a mesma regra dos anos atuais (nacionais fixos, Carnaval
-- segunda e terça, Sexta-feira Santa e Corpus Christi, que dependem da Páscoa) e o vigia diário passa a
-- avisar quando faltar menos de um ano de calendário.

-- Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
create function public.pascoa(p_ano int) returns date
language sql immutable set search_path = public, pg_temp as $$
  with c as (select p_ano % 19 a, p_ano / 100 b, p_ano % 100 c2),
  d as (select a, b, c2, b / 4 d, b % 4 e, (b + 8) / 25 f from c),
  g as (select *, (b - f + 1) / 3 g from d),
  h as (select *, (19 * a + b - d - g + 15) % 30 h, c2 / 4 i, c2 % 4 k from g),
  l as (select *, (32 + 2 * e + 2 * i - h - k) % 7 l from h),
  m as (select *, (a + 11 * h + 22 * l) / 451 m from l)
  select make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1) from m
$$;
revoke all on function public.pascoa(int) from public, anon;
grant execute on function public.pascoa(int) to authenticated, service_role;

insert into public.feriados (data, nome)
select x.data, x.nome from generate_series(2029, 2040) ano
cross join lateral (values
  (make_date(ano, 1, 1), 'Confraternização Universal'),
  (public.pascoa(ano) - 48, 'Carnaval (ponto facultativo)'),
  (public.pascoa(ano) - 47, 'Carnaval (ponto facultativo)'),
  (public.pascoa(ano) - 2, 'Sexta-feira Santa'),
  (make_date(ano, 4, 21), 'Tiradentes'),
  (make_date(ano, 5, 1), 'Dia do Trabalho'),
  (public.pascoa(ano) + 60, 'Corpus Christi (ponto facultativo)'),
  (make_date(ano, 9, 7), 'Independência do Brasil'),
  (make_date(ano, 10, 12), 'Nossa Senhora Aparecida'),
  (make_date(ano, 11, 2), 'Finados'),
  (make_date(ano, 11, 15), 'Proclamação da República'),
  (make_date(ano, 11, 20), 'Consciência Negra'),
  (make_date(ano, 12, 25), 'Natal')
) as x(data, nome)
on conflict (data) do nothing;

-- Último dia coberto pelo calendário (a tabela não é lida direto pelo app).
create function public.feriados_ate() returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select max(data) from public.feriados
$$;
revoke all on function public.feriados_ate() from public, anon;
grant execute on function public.feriados_ate() to authenticated, service_role;

create or replace function public.listar_inconsistencias()
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
                      where tp.troca_id=t.id and tp.concluida_em is null and i.status in ('falta','defeito'))
  union all
  select v.id,v.numero,'pagamento_sem_conferencia','Confira o pagamento inicial e os acertos antigos: o saldo confirmado ainda não está disponível.'
    from valores v where v.total_pago is null and v.pago_em is not null
      and v.status not in ('em_aberto','aguardando_pagamento','perdida')
  union all
  -- V36: prazo de 48 h úteis depende do calendário; avisa com um ano de antecedência.
  select null::uuid, 'Calendário', 'calendario_feriados',
         'O calendário de feriados termina em ' || to_char(public.feriados_ate(), 'DD/MM/YYYY')
         || '. Cadastre os próximos anos para o prazo de envio continuar certo.'
   where public.feriados_ate() is null or public.feriados_ate() < current_date + 365;
$$;
revoke all on function public.listar_inconsistencias() from public, anon;
grant execute on function public.listar_inconsistencias() to authenticated, service_role;
