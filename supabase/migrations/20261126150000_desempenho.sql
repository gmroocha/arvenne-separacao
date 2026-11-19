-- V115 (19/11/2026): banco mais leve, SEM mudar nenhum comportamento.
-- O app caiu por ~10 minutos com 6 aparelhos: 278 "statement timeout" no plano gratuito (Nano, CPU compartilhada).
-- Aqui só custo: a mesma regra de quem vê o quê, com menos trabalho por consulta.
--
-- 1) RLS das tabelas filhas: a política chamava `pode_ver_pedido(pedido_id)` por linha, e cada chamada refazia tudo (quem é a pessoa,
--    se é gestor, a etapa e o pedido). Agora é `(select sou_gestor()) or membro_ve_pedido(pedido_id, (select membro_atual()))`:
--    o gestor sai de cara (initPlan, calculado UMA vez por consulta, padrão do Supabase) e a funcionária paga uma busca por chave por
--    linha, com a pessoa já calculada. Mesma regra e mesma semântica de antes (a função de política é opaca, sem expandir a RLS do pedido
--    dentro de cada view, que deixava o planejamento lento).

-- Funções de política: opacas e baratas (uma busca por chave), com a pessoa passada de fora para ser calculada UMA vez
-- por consulta, em `(select membro_atual())`. Mesma regra de pode_ver_pedido(): o `responsaveis` da etapa atual é a pessoa.
-- São security definer e ficam abertas a quem está logado: por isso só valem para a PRÓPRIA pessoa. Se p_membro não for
-- quem está logado, devolvem false (ninguém espia o que outra pessoa vê).
create or replace function public.membro_ve_pedido(p_pedido uuid, p_membro uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select p_membro = (select public.membro_atual()) and exists (select 1 from public.pedidos p
   where p.id = p_pedido and p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = p_membro::text)
$$;
create or replace function public.membro_ve_troca(p_troca uuid, p_membro uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select p_membro = (select public.membro_atual()) and exists (select 1 from public.trocas t join public.pedidos p on p.id = t.pedido_id
   where t.id = p_troca and p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = p_membro::text)
$$;
create or replace function public.membro_ve_peca_troca(p_peca uuid, p_membro uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select p_membro = (select public.membro_atual()) and exists (select 1 from public.troca_pecas tp join public.trocas t on t.id = tp.troca_id join public.pedidos p on p.id = t.pedido_id
   where tp.id = p_peca and p.responsaveis ->> public.etapa_da_esteira(p.status, p.etapa_antes_desvio) = p_membro::text)
$$;
revoke all on function public.membro_ve_pedido(uuid, uuid), public.membro_ve_troca(uuid, uuid), public.membro_ve_peca_troca(uuid, uuid) from public, anon;
grant execute on function public.membro_ve_pedido(uuid, uuid), public.membro_ve_troca(uuid, uuid), public.membro_ve_peca_troca(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Políticas
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists equipe_le on public.pedido_itens;
drop policy if exists equipe_cria on public.pedido_itens;
drop policy if exists equipe_edita on public.pedido_itens;
create policy equipe_le on public.pedido_itens for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_cria on public.pedido_itens for insert to authenticated
  with check ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_edita on public.pedido_itens for update to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())))
  with check ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.pedido_eventos;
drop policy if exists equipe_nota on public.pedido_eventos;
create policy equipe_le on public.pedido_eventos for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_nota on public.pedido_eventos for insert to authenticated
  with check (tipo in ('nota', 'reiniciado')
    and ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual()))));

drop policy if exists equipe_le on public.bipagens;
drop policy if exists equipe_cria on public.bipagens;
create policy equipe_le on public.bipagens for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_cria on public.bipagens for insert to authenticated
  with check ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.creditos_cliente;
create policy equipe_le on public.creditos_cliente for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.movimentos_financeiros;
create policy equipe_le on public.movimentos_financeiros for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

drop policy if exists ocorrencias_le on public.ocorrencias;
create policy ocorrencias_le on public.ocorrencias for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.trocas;
drop policy if exists equipe_cria on public.trocas;
drop policy if exists equipe_altera on public.trocas;
create policy equipe_le on public.trocas for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_cria on public.trocas for insert to authenticated
  with check ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));
create policy equipe_altera on public.trocas for update to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())))
  with check ((select public.sou_gestor()) or public.membro_ve_pedido(pedido_id, (select public.membro_atual())));

-- Peças, opções e escolhas da troca seguem a troca (a RLS da troca já filtra o exists); o gestor sai de cara.
drop policy if exists equipe_le on public.troca_pecas;
drop policy if exists equipe_cria on public.troca_pecas;
drop policy if exists equipe_altera on public.troca_pecas;
create policy equipe_le on public.troca_pecas for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_troca(troca_id, (select public.membro_atual())));
create policy equipe_cria on public.troca_pecas for insert to authenticated
  with check ((select public.sou_gestor()) or public.membro_ve_troca(troca_id, (select public.membro_atual())));
create policy equipe_altera on public.troca_pecas for update to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_troca(troca_id, (select public.membro_atual())))
  with check ((select public.sou_gestor()) or public.membro_ve_troca(troca_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.troca_opcoes;
drop policy if exists equipe_cria on public.troca_opcoes;
drop policy if exists equipe_altera on public.troca_opcoes;
drop policy if exists equipe_apaga on public.troca_opcoes;
create policy equipe_le on public.troca_opcoes for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())));
create policy equipe_cria on public.troca_opcoes for insert to authenticated
  with check ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())));
create policy equipe_altera on public.troca_opcoes for update to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())))
  with check ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())));
create policy equipe_apaga on public.troca_opcoes for delete to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())));

drop policy if exists equipe_le on public.troca_escolhas;
create policy equipe_le on public.troca_escolhas for select to authenticated
  using ((select public.sou_gestor()) or public.membro_ve_peca_troca(troca_peca_id, (select public.membro_atual())));

-- Metas: a função em política vai dentro de (select ...) (uma vez por consulta).
drop policy if exists metas_cria on public.metas_etapa;
drop policy if exists metas_edita on public.metas_etapa;
create policy metas_cria on public.metas_etapa for insert to authenticated with check ((select public.sou_gestor()));
create policy metas_edita on public.metas_etapa for update to authenticated
  using ((select public.sou_gestor())) with check ((select public.sou_gestor()));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Valores das trocas e da peça: sem janela e sem CTE repetido, para o filtro por pedido/peça entrar na conta.
--    v_cobertura_troca_peca e v_item_liquido usavam `sum() over (partition by ...)`: o Postgres não empurra
--    "pedido_id = x" para dentro de uma janela, então CADA consulta recalculava todas as peças de todos os pedidos
--    (e conferia a RLS de cada uma). Agora o rateio é uma subconsulta por linha, só das peças irmãs (mesma troca ou
--    mesma peça de origem). Mesmas fórmulas e mesmos arredondamentos: o resultado é idêntico (testado linha a linha).
-- ---------------------------------------------------------------------------------------------------------------
create or replace view public.v_cobertura_troca_peca with (security_invoker=true) as
select tp.id as troca_peca_id, t.id as troca_id, t.pedido_id, i.venda_origem_id,
  (case when s.positivas > 0 then
    round(least(greatest(s.saldo, 0), t.cobrir_ate) * s.acumulado / s.positivas, 2)
    - round(least(greatest(s.saldo, 0), t.cobrir_ate) * (s.acumulado - greatest(tp.resultado_diferenca, 0)) / s.positivas, 2)
    else 0 end)::numeric(12,2) as coberto
from public.troca_pecas tp
join public.trocas t on t.id = tp.troca_id
join public.pedido_itens i on i.id = tp.item_id
cross join lateral (
  select sum(x.resultado_diferenca) as saldo,
         sum(greatest(x.resultado_diferenca, 0)) as positivas,
         sum(greatest(x.resultado_diferenca, 0)) filter (where x.id <= tp.id) as acumulado
  from public.troca_pecas x
  where x.troca_id = t.id and x.concluida_em is not null) s
where tp.concluida_em is not null and t.status <> 'cancelada';

-- O valor pago de cada linha (a parte "pagos" da v_item_liquido), separado para poder ser consultado por linha.
create view public.v_item_pago with (security_invoker=true) as
select i.id, i.pedido_id, i.venda_origem_id, i.troca_peca_origem_id,
  coalesce(i.valor_pago_linha, round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) *
    case when p.origem = 'shopify' then coalesce((select t.fator_desconto from public.trocas t
      where t.pedido_id = p.id order by t.created_at desc limit 1), 1) else 1 end), 2)) as valor
from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id;
revoke all on public.v_item_pago from public, anon;
grant select on public.v_item_pago to authenticated, service_role;

-- Cobertura da loja que cabe a UMA peça de uma troca (rateio por diferença de acumulados entre as peças irmãs). Fica numa função
-- (plpgsql, security invoker: vale a RLS de quem chama) para o planejador não repetir a conta em cada view que usa v_item_liquido;
-- só é chamada para as peças que vieram de uma troca.
create or replace function public.item_coberto(p_item uuid, p_origem uuid, p_valor numeric) returns numeric
language plpgsql stable set search_path to 'public','pg_temp' as $$
declare
  v_base numeric;
  v_acum numeric;
  v_cob numeric;
begin
  select sum(x.valor), sum(x.valor) filter (where x.id <= p_item) into v_base, v_acum
    from public.v_item_pago x where x.troca_peca_origem_id = p_origem;
  if v_base is null or v_base <= 0 then return 0; end if;
  select coalesce(max(c.coberto), 0) into v_cob from public.v_cobertura_troca_peca c where c.troca_peca_id = p_origem;
  return round(v_cob * v_acum / v_base, 2) - round(v_cob * (v_acum - p_valor) / v_base, 2);
end $$;
revoke all on function public.item_coberto(uuid, uuid, numeric) from public, anon;
grant execute on function public.item_coberto(uuid, uuid, numeric) to authenticated, service_role;

create or replace view public.v_item_liquido with (security_invoker=true) as
select s.id, s.pedido_id, s.venda_origem_id, s.valor::numeric(12,2) as valor_antes_cobertura,
  g.coberto::numeric(12,2) as coberto,
  (s.valor - g.coberto)::numeric(12,2) as valor_liquido
from public.v_item_pago s
cross join lateral (
  select case when s.troca_peca_origem_id is null then 0::numeric
    else public.item_coberto(s.id, s.troca_peca_origem_id, s.valor) end as coberto) g;

-- v_troca_valores: a base (referenciada duas vezes, logo materializada e sem filtro) vira uma view comum.
create view public.v_troca_base with (security_invoker=true) as
select p.id as troca_peca_id, t.id as troca_id, t.pedido_id, p.item_id, i.qtd, t.cobrir_ate,
  case when (i.adicional or i.valor_pago_linha is not null) and i.qtd*coalesce(i.preco,0)>0
    then greatest(0,least(li.valor_liquido,i.qtd*i.preco))
    when i.adicional or i.valor_pago_linha is not null then 1 else t.fator_desconto end as numerador,
  case when (i.adicional or i.valor_pago_linha is not null) and i.qtd*coalesce(i.preco,0)>0
    then i.qtd*i.preco else 1 end as denominador,
  case when i.valor_pago_linha is not null then li.valor_liquido
    else round(i.qtd*coalesce(i.preco_pago,coalesce(i.preco,0)*t.fator_desconto),2) end as pago
from public.troca_pecas p join public.trocas t on t.id=p.troca_id
join public.pedido_itens i on i.id=p.item_id join public.v_item_liquido li on li.id=i.id;
revoke all on public.v_troca_base from public, anon;
grant select on public.v_troca_base to authenticated, service_role;

create or replace view public.v_troca_valores with (security_invoker=true) as
select g.troca_peca_id,g.troca_id,g.pedido_id,g.item_id,o.id as opcao_id,'opcao'::text as tipo,g.qtd,
  g.pago as valor_pago_item,round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2) as valor_opcao,
  round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago as diferenca,
  case when round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)>g.pago then 'paga_diferenca'
       when round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)<g.pago then 'credito' else 'sem_diferenca' end as situacao,
  round(o.preco*g.numerador/g.denominador,2) as valor_unit,
  least(greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0),g.cobrir_ate)::numeric(12,2) as coberto_previsto,
  (greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0)
    -least(greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0),g.cobrir_ate))::numeric(12,2) as cliente_paga_previsto
from public.v_troca_base g join public.troca_opcoes o on o.troca_peca_id=g.troca_peca_id and o.preco is not null
union all
select g.troca_peca_id,g.troca_id,g.pedido_id,g.item_id,null::uuid,'credito'::text,g.qtd,
  g.pago,0::numeric,-g.pago,'credito'::text,null::numeric,0::numeric(12,2),0::numeric(12,2) from public.v_troca_base g;

-- v_troca_resumo: valores e carrinho entram por peça (lateral), não calculados para todas as trocas de uma vez.
create or replace view public.v_troca_resumo with (security_invoker = true) as
select r.troca_id, r.pedido_id, r.pecas_total, r.pecas_respondidas, r.total_pago,
       (r.bruta - cv.v)::numeric                                   as diferenca_total,
       r.bruta::numeric                                            as diferenca_bruta,
       cv.v::numeric(10,2)                                         as coberto,
       r.cobrir_ate
from (
  select t.id as troca_id, t.pedido_id,
         count(p.id)::integer as pecas_total,
         count(p.escolha_tipo)::integer as pecas_respondidas,
         coalesce(sum(c.valor_pago_item), 0) as total_pago,
         coalesce(sum(case
           when p.escolha_tipo = 'credito' then c.diferenca
           when p.escolha_tipo = 'opcao' then coalesce(x.diferenca, 0)
           else 0 end), 0) as bruta,
         t.cobrir_ate
  from public.trocas t
  left join public.troca_pecas p on p.troca_id = t.id
        and (p.concluida_em is not null
             or exists (select 1 from public.pedido_itens pi
                         where pi.id = p.item_id and pi.status in ('falta', 'defeito')))
  left join lateral (select v.valor_pago_item, v.diferenca from public.v_troca_valores v
                      where v.troca_peca_id = p.id and v.tipo = 'credito') c on true
  left join lateral (select k.diferenca from public.v_troca_carrinho k where k.troca_peca_id = p.id) x on true
  group by t.id, t.pedido_id, t.cobrir_ate
) r
cross join lateral (
  select case when r.bruta > 0 then least(r.bruta, r.cobrir_ate) else 0 end as v
) cv;

-- A troca "alvo" de cada pedido (a pendente primeiro, depois a mais recente com diferença): era um CTE usado duas vezes
-- dentro da v_pedido_acerto (calculado para todos os pedidos); como view, o filtro por pedido entra.
create view public.v_troca_alvo with (security_invoker=true) as
select distinct on (t.pedido_id) t.pedido_id, t.id as troca_id, t.acerto_status, t.acerto_em, t.acerto_por
from public.trocas t join public.pedidos p on p.id=t.pedido_id
where t.status <> 'cancelada'
  and exists (select 1 from public.troca_pecas tp where tp.troca_id = t.id and tp.concluida_em is not null)
order by t.pedido_id,coalesce(t.id=p.acerto_troca_id,false) desc, (t.acerto_status = 'pendente') desc nulls last,
         (coalesce(t.acerto_status, '') <> 'sem_diferenca') desc,
         t.concluida_em desc nulls last, t.created_at desc, t.id desc;
revoke all on public.v_troca_alvo from public, anon;
grant select on public.v_troca_alvo to authenticated, service_role;

create or replace view public.v_pedido_acerto with (security_invoker = true) as
with pecas as (
  select t.pedido_id, t.id as troca_id, tp.id as troca_peca_id, tp.concluida_em,
         tp.escolha_tipo, tp.escolhida_por, coalesce(tp.resultado_diferenca, 0) as diferenca,
         i.qtd, i.sku as sku_antes, i.nome as nome_antes, i.variante as variante_antes, i.foto_url as foto_antes,
         o.sku as sku_depois, o.nome as nome_depois, o.variante as variante_depois, o.foto_url as foto_depois,
         c.valor_pago_item,
         (select jsonb_agg(jsonb_build_object('sku', oo.sku, 'nome', oo.nome, 'variante', oo.variante,
                                              'foto_url', oo.foto_url, 'qtd', e.qtd)
                           order by e.seq)
            from public.troca_escolhas e
            join public.troca_opcoes oo on oo.id = e.opcao_id
           where e.troca_peca_id = tp.id) as depois_lista
  from public.troca_pecas tp
  join public.trocas t on t.id = tp.troca_id
  join public.pedido_itens i on i.id = tp.item_id
  left join public.troca_opcoes o on o.id = tp.escolha_opcao_id
  left join public.v_troca_valores c on c.troca_peca_id = tp.id and c.tipo = 'credito'
  where tp.concluida_em is not null and t.status <> 'cancelada'
),
agg as (
  select pc.pedido_id,
         sum(pc.diferenca) as saldo_todas,
         coalesce(sum(pc.diferenca) filter (where pc.troca_id = al.troca_id), 0)::numeric(10,2) as saldo_bruto,
         coalesce(sum(pc.diferenca) filter (where pc.troca_id = al.troca_id and pc.diferenca > 0), 0)::numeric(10,2) as a_cobrar_bruto,
         coalesce(sum(-pc.diferenca) filter (where pc.troca_id = al.troca_id and pc.diferenca < 0), 0)::numeric(10,2) as total_credito,
         sum(coalesce(pc.valor_pago_item, 0))::numeric(10,2) as valor_pago_pecas_trocadas,
         jsonb_agg(jsonb_build_object(
           'troca_id', pc.troca_id, 'troca_peca_id', pc.troca_peca_id, 'qtd', pc.qtd,
           'tipo', pc.escolha_tipo, 'escolhida_por', coalesce(pc.escolhida_por, 'cliente'),
           'valor_pago', pc.valor_pago_item, 'diferenca', pc.diferenca, 'concluida_em', pc.concluida_em,
           'antes', jsonb_build_object('sku', pc.sku_antes, 'nome', pc.nome_antes,
                                       'variante', pc.variante_antes, 'foto_url', pc.foto_antes),
           'depois', case when pc.escolha_tipo = 'opcao' then jsonb_build_object(
                       'sku', pc.sku_depois, 'nome', pc.nome_depois,
                       'variante', pc.variante_depois, 'foto_url', pc.foto_depois) end,
           'depois_lista', case when pc.escolha_tipo = 'opcao' then coalesce(pc.depois_lista, '[]'::jsonb)
                                else '[]'::jsonb end)
           order by pc.concluida_em, pc.troca_peca_id) as pecas
  from pecas pc
  join public.v_troca_alvo al on al.pedido_id = pc.pedido_id
  group by pc.pedido_id
)
select a.pedido_id,
       -- v.total já desconta a cobertura de todas as trocas; soma de volta para não distorcer o que a cliente pagou.
       (coalesce(v.valor_pago,0)+coalesce(v.valor_pago_somado,0))::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       greatest(sf.v,0)::numeric(10,2) as total_a_cobrar,
       greatest(-sf.v,0)::numeric(10,2) as total_credito,
       sf.v::numeric(10,2) as saldo,
       v.total_geral::numeric(10,2) as novo_total,
       al.troca_id,
       al.acerto_status,
       al.acerto_em,
       al.acerto_por,
       a.pecas,
       cv.v as coberto,
       v.total_pago as total_pago_atual,
       case when v.total_pago is null or v.total_pago<0 or v.total_geral<0 then 'Confira o pagamento original e os acertos antigos antes de registrar o saldo.' end::text as bloqueio
from agg a
join public.v_troca_alvo al on al.pedido_id = a.pedido_id
join public.v_pedidos v on v.id = a.pedido_id
join public.trocas tt on tt.id = al.troca_id
cross join lateral (
  select (case when a.saldo_bruto > 0 then least(a.saldo_bruto, tt.cobrir_ate) else 0 end)::numeric(10,2) as v
) cv
cross join lateral (
  select case when al.acerto_status='sem_diferenca' then 0
    when al.acerto_status in ('recebido','credito_registrado') then coalesce((
      select m.valor from public.movimentos_financeiros m where m.troca_id=al.troca_id
        and m.tipo in ('troca_recebida','troca_credito')
        and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id)
      order by m.id desc limit 1),a.saldo_bruto-cv.v)
    else coalesce(public.saldo_financeiro(v.id),0) end as v
) sf;

-- troca_publica (a página da cliente, anon com limite de 3 s): as opções entram pela peça, não pela view inteira.
create or replace function public.troca_publica(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_numero text;
  v_cliente text;
  v_nome text;
  v_res record;
begin
  select * into v_t from trocas where token = p_token and status not in ('rascunho', 'cancelada');
  if not found then return null; end if;
  select p.numero, p.cliente_nome into v_numero, v_cliente from v_pedidos p where p.id = v_t.pedido_id;
  select * into v_res from v_troca_resumo where troca_id = v_t.id;
  v_nome := nullif(split_part(coalesce(v_cliente, ''), ' ', 1), '');
  if v_nome like '%@%' then v_nome := null; end if;
  return jsonb_build_object(
    'numero', v_numero,
    'cliente', v_nome,
    'status', v_t.status,
    'resumo', jsonb_build_object(
      'total_pago', coalesce(v_res.total_pago, 0),
      'diferenca', coalesce(v_res.diferenca_total, 0),
      'diferenca_bruta', coalesce(v_res.diferenca_bruta, 0),
      'coberto', coalesce(v_res.coberto, 0),
      'cobrir_ate', coalesce(v_res.cobrir_ate, 0),
      'pecas_total', coalesce(v_res.pecas_total, 0),
      'pecas_respondidas', coalesce(v_res.pecas_respondidas, 0)),
    'pecas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'foto_url', i.foto_url, 'nome', i.nome, 'variante', i.variante,
        'sku', i.sku, 'qtd', i.qtd,
        'valor_pago_unit', round(coalesce(i.preco_pago, coalesce(i.preco, 0) * v_t.fator_desconto), 2),
        'valor_pago', coalesce((select c.valor_pago_item from v_troca_valores c
                                 where c.troca_peca_id = p.id and c.tipo = 'credito'), 0),
        'escolha_tipo', p.escolha_tipo,
        'escolha_opcao_id', p.escolha_opcao_id,
        'escolha_equipe', p.escolhida_por = 'equipe',
        'concluida', p.concluida_em is not null,
        'resultado', p.resultado_diferenca,
        'carrinho', coalesce((
          select jsonb_agg(jsonb_build_object('opcao_id', e.opcao_id, 'qtd', e.qtd) order by e.seq)
          from troca_escolhas e where e.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), '[]'::jsonb),
        'valor_escolhido', coalesce((select c.valor_escolhido from v_troca_carrinho c
                                      where c.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), 0),
        'unidades', coalesce((select c.unidades from v_troca_carrinho c
                               where c.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), 0),
        'nova', (select jsonb_build_object('foto_url', o.foto_url, 'nome', o.nome,
                                           'variante', o.variante, 'sku', o.sku)
                   from troca_opcoes o
                  where o.id = p.escolha_opcao_id and p.escolha_tipo = 'opcao'),
        'novas', coalesce((
          select jsonb_agg(jsonb_build_object('foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante,
                                              'sku', o.sku, 'qtd', e.qtd) order by e.seq)
          from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
          where e.troca_peca_id = p.id and p.escolha_tipo = 'opcao' and p.concluida_em is not null), '[]'::jsonb),
        'opcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante, 'sku', o.sku,
            'valor', x.valor_opcao, 'diferenca', x.diferenca, 'situacao', x.situacao,
            'valor_unit', x.valor_unit)
            order by o.ordem, o.created_at)
          from troca_opcoes o
          join v_troca_valores x on x.opcao_id = o.id and x.troca_peca_id = o.troca_peca_id
          where o.troca_peca_id = p.id), '[]'::jsonb)
      ) order by i.ordem, p.created_at)
      from troca_pecas p
      join pedido_itens i on i.id = p.item_id
      where p.troca_id = v_t.id
        and (p.concluida_em is not null or i.status in ('falta', 'defeito'))), '[]'::jsonb));
end $$;
revoke all on function public.troca_publica(uuid) from public;
grant execute on function public.troca_publica(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Prazo e horas úteis: uma leitura dos feriados por chamada (antes, uma consulta por dia percorrido).
--    Estas duas funções rodam por LINHA nas listas (prazo, termômetro, contagem de atrasados). Mesma regra de dias úteis,
--    mesmo arredondamento e mesma resposta. Só deixam de consultar a tabela `feriados` uma vez por dia.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.prazo_envio(pago timestamp with time zone) returns timestamp with time zone
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  d timestamp;
  n int := 0;
  v_fer date[];
begin
  if pago is null then return null; end if;
  d := pago at time zone 'America/Sao_Paulo';
  select coalesce(array_agg(f.data), '{}'::date[]) into v_fer from public.feriados f where f.data >= d::date;
  if extract(isodow from d) >= 6 or d::date = any(v_fer) then
    d := date_trunc('day', d);
    loop
      d := d + interval '1 day';
      exit when extract(isodow from d) < 6 and not (d::date = any(v_fer));
    end loop;
  end if;
  while n < 2 loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 and not (d::date = any(v_fer)) then
      n := n + 1;
    end if;
  end loop;
  return d at time zone 'America/Sao_Paulo';
end $$;

create or replace function public.horas_uteis(de timestamp with time zone, ate timestamp with time zone) returns numeric
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  a timestamp;
  b timestamp;
  d date;
  ini timestamp;
  fim timestamp;
  total numeric := 0;
  v_fer date[];
begin
  if de is null or ate is null then return null; end if;
  if ate < de then return -public.horas_uteis(ate, de); end if;
  a := de at time zone 'America/Sao_Paulo';
  b := ate at time zone 'America/Sao_Paulo';
  select coalesce(array_agg(f.data), '{}'::date[]) into v_fer from public.feriados f where f.data between a::date and b::date;
  for d in select g::date from generate_series(a::date, b::date, interval '1 day') g loop
    if extract(isodow from d) < 6 and not (d = any(v_fer)) then
      ini := greatest(a, d::timestamp);
      fim := least(b, (d + 1)::timestamp);
      total := total + extract(epoch from (fim - ini)) / 3600;
    end if;
  end loop;
  return round(total, 1);
end $$;

-- Contagem da lista: o prazo é pelo menos 2 dias depois do pagamento, então quem pagou há menos de 47 h nunca está atrasado.
-- A comparação barata vai na frente e a conta do prazo só roda para quem passou dela (mesmo resultado).
create or replace function public.contagens_pedidos() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('emAberto',count(*) filter(where status='em_aberto'),
    'atrasados',count(*) filter(where status in ('novo','separacao','avisar_cliente','aguardando_cliente',
      'conferencia','bipagem','faturamento','embalagem','frete','pronto_envio')
      and pago_em < now() - interval '47 hours'
      and public.prazo_envio(pago_em)<now()))
  from public.pedidos where excluido_em is null
    and status not in ('aguardando_pagamento','enviado','cancelado','perdida','somada');
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Peças repetidas: o prazo de cada pedido é calculado uma vez por pedido (antes, uma vez por peça do pedido).
--    O selo da barra lateral usa contagem_repetidas() (só a contagem); a lista completa passa a custar bem menos.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.pecas_repetidas(p_pedidos uuid[] default null::uuid[], p_avancadas boolean default false)
returns table(chave text, sku text, nome text, variante text, foto_url text, qtd_total integer, qtd_pedidos integer, pedidos jsonb)
language sql stable set search_path to 'public', 'pg_temp' as $$
  with alvo as materialized (
    select p.id, p.numero, p.cliente_nome, p.status, p.pedido_em, pz.prazo,
           case when pz.prazo > now() then public.horas_uteis(now(), pz.prazo) end as horas
      from public.pedidos p
     cross join lateral (select public.prazo_envio(p.pago_em) as prazo) pz
     where (p.status in ('novo', 'separacao')
            or (p_avancadas and p.status in ('avisar_cliente', 'aguardando_cliente', 'conferencia', 'bipagem', 'faturamento',
                                             'embalagem', 'frete', 'pronto_envio', 'enviar_rastreio')))
       and (p_pedidos is null or p.id = any(p_pedidos))
       and exists (select 1 from public.pedido_itens x where x.pedido_id = p.id
                    and (x.status = 'pendente' or (p_avancadas and x.status = 'encontrado'))))
  select
    coalesce(nullif(i.sku, ''), i.nome || ' · ' || coalesce(i.variante, '')) as chave,
    max(i.sku)        as sku,
    max(i.nome)       as nome,
    max(i.variante)   as variante,
    max(i.foto_url)   as foto_url,
    sum(i.qtd)::int   as qtd_total,
    count(distinct p.id)::int as qtd_pedidos,
    jsonb_agg(jsonb_build_object(
      'pedido_id', p.id, 'numero', p.numero, 'cliente', p.cliente_nome, 'qtd', i.qtd, 'status', p.status,
      'prazo', p.prazo,
      'prazo_horas_uteis', p.horas
    ) order by p.prazo nulls last, p.pedido_em) as pedidos
  from public.pedido_itens i
  join alvo p on p.id = i.pedido_id
  where (i.status = 'pendente' or (p_avancadas and i.status = 'encontrado'))
  group by 1
  having count(distinct p.id) > 1
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Índices que faltavam para o que essas consultas pedem
-- ---------------------------------------------------------------------------------------------------------------
-- fator_desconto da troca mais recente de um pedido (v_item_pago, v_pedidos, troca_publica): pedido + mais nova primeiro.
create index if not exists trocas_pedido_recente on public.trocas (pedido_id, created_at desc);
-- "Quem mexeu na peça": último evento de um tipo para a peça (v_pedido_alteracoes).
create index if not exists pedido_eventos_item_tipo on public.pedido_eventos (item_id, tipo, id desc) where item_id is not null;
-- Selo de peças repetidas e lista: as peças ainda pendentes de cada pedido.
create index if not exists pedido_itens_pendentes on public.pedido_itens (pedido_id) where status = 'pendente';

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Leitura somente-leitura do CLI (auditoria): as views e a função novas entram como as antigas.
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant select on public.v_item_pago, public.v_troca_base, public.v_troca_alvo to supabase_read_only_user;
    grant execute on function public.item_coberto(uuid, uuid, numeric) to supabase_read_only_user;
    grant execute on function public.membro_ve_pedido(uuid, uuid), public.membro_ve_troca(uuid, uuid),
      public.membro_ve_peca_troca(uuid, uuid) to supabase_read_only_user;
  end if;
end $$;
