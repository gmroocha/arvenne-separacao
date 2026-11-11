-- Vistoria de 11/11/2026: dinheiro, prazo e importação da Shopify.
-- Tudo que é novo leva GRANT explícito (este projeto não dá GRANT automático): "anon" não recebe nada
-- e "authenticated" nunca recebe DELETE em pedidos e itens. Nada é apagado por aqui.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
alter table public.pedido_itens
  add column shopify_line_id text,
  add column removido_em timestamptz,
  add column devolvido_em timestamptz,
  add column reembolsado_shopify_em timestamptz;
comment on column public.pedido_itens.reembolsado_shopify_em is
  'Peça removida pela equipe cuja linha ficou com quantidade 0 na Shopify (reembolso feito lá): o total atual da Shopify já desconta, então sai do valor_removido.';
comment on column public.pedido_itens.shopify_line_id is 'Id da linha do pedido na Shopify (casa o preço pago por linha, não por variante).';
comment on column public.pedido_itens.removido_em is 'Quando a peça virou removida (o gatilho zera ao voltar).';
comment on column public.pedido_itens.devolvido_em is 'Quando o valor da peça removida (cliente desistiu) foi devolvido à cliente.';

alter table public.pedidos add column pago_em_estimado boolean not null default false;
comment on column public.pedidos.pago_em_estimado is
  'true = pago_em veio da data do pedido (a Shopify não informou a transação); um Sincronizar futuro corrige.';

-- Tipos novos no histórico (todos os atuais preservados).
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado', 'troca_acerto',
  'devolvido', 'devolvido_desfeito', 'shopify_alerta']));

-- Gatilho: removido_em acompanha o status; ao voltar de removido, zera também devolvido_em.
create or replace function public.tg_itens_antes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if new.status = 'removido' and old.status is distinct from 'removido' then
    new.removido_em := now();
  elsif new.status <> 'removido' and old.status = 'removido' then
    new.removido_em := null;
    new.devolvido_em := null;
    new.reembolsado_shopify_em := null;
  end if;
  return new;
end $$;
revoke all on function public.tg_itens_antes() from public, anon;

create or replace function public.tg_itens_antes_ins() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'removido' and new.removido_em is null then new.removido_em := now(); end if;
  return new;
end $$;
revoke all on function public.tg_itens_antes_ins() from public, anon;
create trigger itens_antes_ins before insert on public.pedido_itens
for each row execute function public.tg_itens_antes_ins();

-- Peças já removidas: removido_em = última alteração (sem mexer em updated_at).
alter table public.pedido_itens disable trigger itens_antes;
update public.pedido_itens set removido_em = updated_at where status = 'removido' and removido_em is null;
alter table public.pedido_itens enable trigger itens_antes;

-- Pedido cancelado: as trocas ativas (rascunho, enviada, respondida) são canceladas junto.
create or replace function public.tg_pedidos_cancela_trocas() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.trocas set status = 'cancelada'
   where pedido_id = new.id and status in ('rascunho', 'enviada', 'respondida');
  return null;
end $$;
revoke all on function public.tg_pedidos_cancela_trocas() from public, anon;
create trigger pedidos_cancela_trocas after update of status on public.pedidos
for each row when (new.status = 'cancelado' and old.status is distinct from 'cancelado')
execute function public.tg_pedidos_cancela_trocas();

-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------
create index if not exists catalogo_site_produto_id on public.catalogo_site (produto_id);
create index if not exists troca_pecas_escolha_opcao on public.troca_pecas (escolha_opcao_id);
create index if not exists pedido_eventos_item on public.pedido_eventos (item_id);

-- ---------------------------------------------------------------------------
-- 3. Feriados de 2028 (Páscoa em 16/04/2028) e prazo de envio
-- ---------------------------------------------------------------------------
insert into public.feriados (data, nome) values
  ('2028-01-01', 'Confraternização Universal'),
  ('2028-02-28', 'Carnaval (ponto facultativo)'),
  ('2028-02-29', 'Carnaval (ponto facultativo)'),
  ('2028-04-14', 'Sexta-feira Santa'),
  ('2028-04-21', 'Tiradentes'),
  ('2028-05-01', 'Dia do Trabalho'),
  ('2028-06-15', 'Corpus Christi (ponto facultativo)'),
  ('2028-09-07', 'Independência do Brasil'),
  ('2028-10-12', 'Nossa Senhora Aparecida'),
  ('2028-11-02', 'Finados'),
  ('2028-11-15', 'Proclamação da República'),
  ('2028-11-20', 'Consciência Negra'),
  ('2028-12-25', 'Natal')
on conflict (data) do nothing;

-- Pago em sábado, domingo ou feriado: a contagem começa às 00:00 do 1º dia útil seguinte
-- (sábado 10h -> quarta 00h). Pago em dia útil: +2 dias úteis na mesma hora (sexta 15h -> terça 15h).
create or replace function public.prazo_envio(pago timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d timestamp;
  n int := 0;
begin
  if pago is null then return null; end if;
  d := pago at time zone 'America/Sao_Paulo';
  if extract(isodow from d) >= 6 or exists (select 1 from public.feriados f where f.data = d::date) then
    d := date_trunc('day', d);
    loop
      d := d + interval '1 day';
      exit when extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d::date);
    end loop;
  end if;
  while n < 2 loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d::date) then
      n := n + 1;
    end if;
  end loop;
  return d at time zone 'America/Sao_Paulo';
end $$;
revoke all on function public.prazo_envio(timestamptz) from public, anon;
grant execute on function public.prazo_envio(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Fator do pedido: na Shopify, o que foi pago / o que as peças importadas custam
-- ---------------------------------------------------------------------------
create or replace function public.fator_pedido(p_pedido uuid) returns numeric
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(
    -- Pedido da Shopify com preço pago por linha: Σ pago x qtd / Σ preço x qtd (peças importadas, não as de troca).
    (select least(1, greatest(0, sum(i.qtd * i.preco_pago) / sum(i.qtd * i.preco)))
       from pedido_itens i join pedidos p on p.id = i.pedido_id
      where i.pedido_id = p_pedido and p.origem = 'shopify' and i.origem = 'shopify'
        and i.preco_pago is not null and i.preco > 0
        and coalesce(i.observacao, '') not like 'troca de%'
      having sum(i.qtd * i.preco) > 0),
    (select least(1, greatest(0, x.sub / x.soma))
       from (select (p.shopify_bruto->'subtotalPriceSet'->'shopMoney'->>'amount')::numeric as sub,
                    (select sum((n->>'currentQuantity')::int * (n->'originalUnitPriceSet'->'shopMoney'->>'amount')::numeric)
                       from jsonb_array_elements(p.shopify_bruto->'lineItems'->'nodes') n) as soma
             from pedidos p
             where p.id = p_pedido and p.origem = 'shopify' and p.shopify_bruto is not null) x
      where x.sub is not null and x.soma > 0),
    (select case when v.subtotal > 0
        then greatest(0, 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
        else 1 end
       from v_pedidos v where v.id = p_pedido),
    1);
$$;
revoke all on function public.fator_pedido(uuid) from public, anon;
grant execute on function public.fator_pedido(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. v_troca_valores: opção sem preço não vira crédito (nem peça nova de graça)
-- Mesmas colunas e tipos.
-- ---------------------------------------------------------------------------
create or replace view public.v_troca_valores with (security_invoker = true) as
with base as (
  select p.id as troca_peca_id, t.id as troca_id, t.pedido_id, p.item_id, i.qtd,
         t.fator_desconto as fator,
         coalesce(i.preco_pago, coalesce(i.preco, 0) * t.fator_desconto) as pago_unit
  from public.troca_pecas p
  join public.trocas t on t.id = p.troca_id
  join public.pedido_itens i on i.id = p.item_id
),
pago as (
  select b.*, round(b.qtd * b.pago_unit, 2) as valor_pago_item from base b
)
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, o.id as opcao_id, 'opcao'::text as tipo, g.qtd,
       g.valor_pago_item,
       round(g.qtd * o.preco * g.fator, 2) as valor_opcao,
       round(g.qtd * o.preco * g.fator, 2) - g.valor_pago_item as diferenca,
       case
         when round(g.qtd * o.preco * g.fator, 2) - g.valor_pago_item > 0 then 'paga_diferenca'
         when round(g.qtd * o.preco * g.fator, 2) - g.valor_pago_item < 0 then 'credito'
         else 'sem_diferenca'
       end as situacao
from pago g
join public.troca_opcoes o on o.troca_peca_id = g.troca_peca_id and o.preco is not null
union all
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, null::uuid, 'credito'::text, g.qtd,
       g.valor_pago_item, 0::numeric, -g.valor_pago_item, 'credito'::text
from pago g;

-- ---------------------------------------------------------------------------
-- 6. v_pedidos: mesmas colunas e ordem de antes; novas no fim (a_devolver, valor_removido)
-- Sem "c.*": tudo é calculado numa cadeia de LATERAL, uma vez por pedido (os filtros de status entram
-- antes da soma das peças e o prazo é calculado uma vez só).
-- ---------------------------------------------------------------------------
create or replace view public.v_pedidos
with (security_invoker = true) as
select
  p.id, p.numero, p.origem, p.status, p.status_desde,
  p.cliente_nome, p.cliente_telefone, p.cliente_email, p.valor_total,
  p.shopify_order_id, p.shopify_url, p.carrinho_url, p.rastreio, p.observacoes,
  p.pedido_em, p.created_at, p.updated_at,
  p.cliente_id, p.cliente_cpf,
  p.entrega_cep, p.entrega_logradouro, p.entrega_numero, p.entrega_complemento,
  p.entrega_bairro, p.entrega_cidade, p.entrega_uf,
  p.desconto_tipo, p.desconto_valor, p.cupom, p.desconto_codigos,
  p.frete_tipo, p.frete_pago_por, p.frete_cobrado, p.frete_custo,
  p.forma_pagamento, p.valor_pago, p.pago_em, p.data_compra, p.token_publico,
  p.nf_numero, p.nf_emitida_em, p.frete_gerado_em, p.frete_servico, p.rastreio_url,
  p.pedido_fornecedor_numero, p.pedido_fornecedor_em,
  p.embalado_em, p.postado_em, p.rastreio_enviado_em,
  a.subtotal, a.qtd_pecas, a.qtd_linhas, a.qtd_encontradas, a.qtd_problemas,
  a.qtd_conferidas, a.qtd_etiquetadas, a.qtd_bipadas, a.fotos,
  d.desconto,
  d.frete_na_conta,
  d.fase,
  -- Pedido da Shopify: o que a Shopify cobrou (valor atual) + diferença das trocas - peças que a cliente
  -- tirou depois de pagar. Venda manual: soma das peças.
  tot.v                                                                                  as total,
  (a.subtotal - d.desconto - pix.v)::numeric(10,2)                                       as valor_pecas_com_desconto,
  (d.frete_na_conta - p.frete_custo)::numeric(10,2)                                      as frete_diferenca,
  (p.origem <> 'shopify' and p.status = 'enviado' and p.rastreio_enviado_em is null)     as pendente_rastreio,
  pz.prazo                                                                               as prazo,
  ph.horas                                                                               as prazo_horas_uteis,
  -- Colunas novas SEMPRE no fim: create or replace view não deixa mudar a ordem das antigas.
  p.cliente_razao_social,
  p.cliente_ie,
  pix.v                                                                                  as desconto_pix,
  p.frete_original,
  p.desconto_frete,
  (exists (select 1 from public.trocas ta
            where ta.pedido_id = p.id and ta.acerto_status = 'pendente')
   or dev.v > 0)                                                                         as acerto_pendente,
  dev.v                                                                                  as a_devolver,
  (case when p.origem = 'shopify' then rem.total else 0 end)::numeric(10,2)              as valor_removido
from public.pedidos p
-- Fator das peças sem preço pago (peças de troca): o da troca mais recente.
cross join lateral (
  select case when p.origem = 'shopify'
              then coalesce((select t.fator_desconto from public.trocas t
                              where t.pedido_id = p.id order by t.created_at desc limit 1), 1)
              else 1 end as f
  offset 0
) fr
cross join lateral (
  select
    coalesce(sum(i.qtd * coalesce(i.preco, 0)), 0)::numeric(10,2)                          as subtotal,
    coalesce(sum(i.qtd), 0)::int                                                           as qtd_pecas,
    count(i.id)::int                                                                       as qtd_linhas,
    (count(i.id) filter (where i.status = 'encontrado'))::int                              as qtd_encontradas,
    (count(i.id) filter (where i.status in ('falta', 'defeito')))::int                     as qtd_problemas,
    (count(i.id) filter (where i.status = 'encontrado' and i.conferido_em is not null))::int as qtd_conferidas,
    (count(i.id) filter (where i.status = 'encontrado' and i.etiquetado_em is not null))::int as qtd_etiquetadas,
    coalesce(sum(i.qtd_bipada), 0)::int                                                    as qtd_bipadas,
    coalesce((
      select jsonb_agg(f.foto_url)
      from (select x.foto_url from public.pedido_itens x
            where x.pedido_id = p.id and x.status <> 'removido' and x.foto_url is not null
            order by x.ordem limit 3) f
    ), '[]'::jsonb)                                                                        as fotos,
    count(i.preco_pago)::int                                                               as n_pago,
    coalesce(sum(round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2)), 0) as pago_vivo
  from public.pedido_itens i
  where i.pedido_id = p.id and i.status <> 'removido'
) a
cross join lateral (
  select
    -- Shopify com preço pago por linha: desconto = peças vivas a preço cheio - o que a cliente pagou por elas
    -- (assim subtotal - desconto + frete = total). Sem preço pago, vale o desconto registrado.
    (case when p.origem = 'shopify' and a.n_pago > 0
          then greatest(0, a.subtotal - a.pago_vivo)
          else least(a.subtotal, case p.desconto_tipo
            when 'percentual' then round(a.subtotal * coalesce(p.desconto_valor, 0) / 100, 2)
            when 'valor'      then coalesce(p.desconto_valor, 0)
            else 0 end) end)::numeric(10,2)                                                as desconto,
    (case when p.frete_pago_por = 'cliente' then coalesce(p.frete_cobrado, 0) else 0 end)::numeric(10,2) as frete_na_conta,
    case
      when p.status in ('em_aberto', 'aguardando_pagamento') then 'venda'
      when p.status in ('enviado', 'cancelado', 'perdida')   then 'arquivo'
      else 'expedicao' end                                                                 as fase
  offset 0
) d
cross join lateral (
  -- Pix: 10% sobre o valor cheio das peças (frete fora), somado ao desconto/cupom existente.
  -- Só vendas do WhatsApp pagas no Pix; nunca passa do que sobra depois do desconto.
  select case when p.origem = 'whatsapp' and p.forma_pagamento = 'Pix'
              then least(round(a.subtotal * 0.10, 2), a.subtotal - d.desconto)
              else 0 end::numeric(10,2) as v
  offset 0
) pix
cross join lateral (
  -- Peças que a cliente tirou ("cliente desistiu") depois de pagar.
  select
    coalesce(sum(round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2)), 0)::numeric(10,2) as total,
    coalesce(sum(round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2))
             filter (where i.devolvido_em is null), 0)::numeric(10,2)                                      as pendente,
    (count(i.id) filter (where i.devolvido_em is null))::int                                               as n_pendente
  from public.pedido_itens i
  where i.pedido_id = p.id and i.status = 'removido' and i.observacao = 'cliente desistiu'
    and p.pago_em is not null and i.removido_em > p.pago_em
    and i.reembolsado_shopify_em is null  -- reembolsada na Shopify: o valor_total atual já desconta
) rem
cross join lateral (
  select case when p.origem = 'shopify'
              then coalesce((select sum(tp.resultado_diferenca) from public.troca_pecas tp
                              join public.trocas t on t.id = tp.troca_id
                             where t.pedido_id = p.id and tp.concluida_em is not null
                               and t.status <> 'cancelada'), 0)
              else 0 end as dif
  offset 0
) sh
cross join lateral (
  select (case when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total
               else a.subtotal - d.desconto - pix.v + d.frete_na_conta end)::numeric(10,2) as v
  offset 0
) tot
cross join lateral (
  -- A devolver: Shopify = peças removidas ainda não devolvidas; WhatsApp = o que foi pago a mais que o total.
  select (case
            when p.status in ('cancelado', 'perdida') then 0
            when p.origem = 'shopify' then rem.pendente
            when rem.n_pendente > 0 and p.valor_pago is not null then greatest(0, p.valor_pago - tot.v)
            else 0 end)::numeric(10,2) as v
  offset 0
) dev
cross join lateral (
  select case when d.fase = 'expedicao' then public.prazo_envio(p.pago_em) end as prazo
  offset 0
) pz
cross join lateral (
  select case when pz.prazo > now() then public.horas_uteis(now(), pz.prazo) end as horas
  offset 0
) ph;

revoke all on public.v_pedidos from anon;
grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;

-- ---------------------------------------------------------------------------
-- 7. v_pedido_acerto: mesma forma, mas o saldo é o da MESMA troca cujo troca_id/acerto_status sai.
-- valor_pago_original continua sendo o que a cliente pagou (todas as trocas e peças removidas).
-- ---------------------------------------------------------------------------
create or replace view public.v_pedido_acerto with (security_invoker = true) as
with pecas as (
  select t.pedido_id, t.id as troca_id, tp.id as troca_peca_id, tp.concluida_em,
         tp.escolha_tipo, tp.escolhida_por, coalesce(tp.resultado_diferenca, 0) as diferenca,
         i.qtd, i.sku as sku_antes, i.nome as nome_antes, i.variante as variante_antes, i.foto_url as foto_antes,
         o.sku as sku_depois, o.nome as nome_depois, o.variante as variante_depois, o.foto_url as foto_depois,
         c.valor_pago_item
  from public.troca_pecas tp
  join public.trocas t on t.id = tp.troca_id
  join public.pedido_itens i on i.id = tp.item_id
  left join public.troca_opcoes o on o.id = tp.escolha_opcao_id
  left join public.v_troca_valores c on c.troca_peca_id = tp.id and c.tipo = 'credito'
  where tp.concluida_em is not null and t.status <> 'cancelada'
),
alvo as (
  -- Uma troca por pedido: a pendente primeiro, depois a mais recente com diferença.
  select distinct on (t.pedido_id) t.pedido_id, t.id as troca_id, t.acerto_status, t.acerto_em, t.acerto_por
  from public.trocas t
  where t.status <> 'cancelada'
    and exists (select 1 from public.troca_pecas tp where tp.troca_id = t.id and tp.concluida_em is not null)
  order by t.pedido_id, (t.acerto_status = 'pendente') desc nulls last,
           (coalesce(t.acerto_status, '') <> 'sem_diferenca') desc,
           t.concluida_em desc nulls last, t.created_at desc
),
agg as (
  select pc.pedido_id,
         sum(pc.diferenca) as saldo_todas,
         coalesce(sum(pc.diferenca) filter (where pc.troca_id = al.troca_id), 0)::numeric(10,2) as saldo,
         coalesce(sum(pc.diferenca) filter (where pc.troca_id = al.troca_id and pc.diferenca > 0), 0)::numeric(10,2) as total_a_cobrar,
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
                       'variante', pc.variante_depois, 'foto_url', pc.foto_depois) end)
           order by pc.concluida_em, pc.troca_peca_id) as pecas
  from pecas pc
  join alvo al on al.pedido_id = pc.pedido_id
  group by pc.pedido_id
)
select a.pedido_id,
       (v.total - a.saldo_todas + v.valor_removido)::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       a.total_a_cobrar,
       a.total_credito,
       a.saldo,
       v.total::numeric(10,2) as novo_total,
       al.troca_id,
       al.acerto_status,
       al.acerto_em,
       al.acerto_por,
       a.pecas
from agg a
join alvo al on al.pedido_id = a.pedido_id
join public.v_pedidos v on v.id = a.pedido_id;

revoke all on public.v_pedido_acerto from anon;
grant select on public.v_pedido_acerto to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Romaneio público (mesmo conteúdo; search_path endurecido)
-- ---------------------------------------------------------------------------
create or replace function public.romaneio_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
begin
  select * into v from public.v_pedidos where token_publico = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'numero',   v.numero,
    'cliente',  nullif(split_part(trim(coalesce(v.cliente_nome, '')), ' ', 1), ''),
    'fase',     v.fase,
    'status',   v.status,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'sku', i.sku, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
      from public.pedido_itens i
      where i.pedido_id = v.id and i.status <> 'removido'), '[]'::jsonb),
    'subtotal',      v.subtotal,
    'desconto',      v.desconto,
    'desconto_pix',  v.desconto_pix,
    'cupom',         v.cupom,
    'frete_tipo',    v.frete_tipo,
    'frete_cobrado', v.frete_na_conta,
    'total',         v.total
  );
end $$;
revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Troca: escolher (cliente), concluir e aprovar (equipe)
-- ---------------------------------------------------------------------------
create or replace function public.troca_escolher(p_token uuid, p_item uuid, p_tipo text, p_opcao uuid default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
begin
  if p_tipo not in ('opcao', 'credito', 'whatsapp') then
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
  if not found or v_p.concluida_em is not null then
    raise exception 'Peça inválida';
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id and preco is not null) then
      raise exception 'Opção inválida';
    end if;
  else
    p_opcao := null;
  end if;
  update troca_pecas
     set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now()
   where id = v_p.id;
  -- Respondida quando todas as peças (ainda não feitas) têm escolha.
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_escolher(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_escolher(uuid, uuid, text, uuid) to anon, authenticated;

create or replace function public.troca_concluir_peca(
  p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_i pedido_itens%rowtype;
  v_o troca_opcoes%rowtype;
  v_valor record;
  v_ordem integer;
  v_observacao text;
  v_p_ped pedidos%rowtype;
  v_alvo numeric;
  v_sub numeric;
  v_pix numeric;
  v_ped_status text;
begin
  if p_tipo is null or p_tipo not in ('opcao', 'credito') then
    raise exception 'Tipo de conclusão inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  select * into v_p from troca_pecas where id = p_peca and troca_id = v_t.id for update;
  if not found then raise exception 'Peça não pertence a esta troca'; end if;
  -- Uma resposta perdida pode ser repetida, mas nunca refaz uma troca cancelada.
  if v_t.status = 'cancelada' then raise exception 'Esta troca foi cancelada'; end if;
  if v_p.concluida_em is not null then return true; end if;
  if v_t.status not in ('rascunho', 'enviada', 'respondida') then
    raise exception 'Esta troca ainda não pode ser concluída';
  end if;
  select status into v_ped_status from pedidos where id = v_t.pedido_id;
  if v_ped_status in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais troca', case v_ped_status when 'enviado' then 'enviado' else 'cancelado' end;
  end if;
  if v_p.escolha_tipo is distinct from p_escolha_tipo
     or v_p.escolha_opcao_id is distinct from p_opcao then
    raise exception 'A cliente mudou a escolha. Confira a resposta atual antes de confirmar.';
  end if;
  select * into v_i from pedido_itens where id = v_p.item_id and pedido_id = v_t.pedido_id for update;
  if not found or v_i.status not in ('falta', 'defeito') then
    raise exception 'Esta peça não está mais em falta';
  end if;

  if p_tipo = 'opcao' then
    if v_p.escolha_tipo is distinct from 'opcao' or p_opcao is null then
      raise exception 'A cliente ainda não escolheu uma opção para esta peça';
    end if;
    select * into v_o from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id for update;
    if not found then raise exception 'Opção não pertence a esta peça'; end if;
    if v_o.preco is null then
      raise exception 'Esta opção está sem preço. Informe o preço da opção antes de concluir a troca.';
    end if;
  end if;
  select * into v_valor from v_troca_valores where troca_peca_id = v_p.id
    and ((p_tipo = 'credito' and tipo = 'credito') or (p_tipo = 'opcao' and opcao_id = p_opcao));
  if not found or v_valor.diferenca is null then raise exception 'Não foi possível calcular a troca'; end if;

  -- Total anunciado = valor das peças (com desconto) antes da troca + diferença da troca.
  select * into v_p_ped from pedidos where id = v_t.pedido_id for update;
  select valor_pecas_com_desconto + v_valor.diferenca into v_alvo from v_pedidos where id = v_t.pedido_id;

  if p_tipo = 'opcao' then
    select coalesce(max(ordem), 0) + 1 into v_ordem from pedido_itens where pedido_id = v_t.pedido_id;
    insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
      variante, foto_url, qtd, preco, ordem, observacao)
    values (v_t.pedido_id, case when v_o.origem = 'site' then 'shopify' else 'clube' end,
      v_o.shopify_variant_id, v_o.peca_clube_id, v_o.sku, v_o.nome, v_o.variante, v_o.foto_url,
      v_i.qtd, v_o.preco, v_ordem, 'troca de ' || coalesce(v_i.sku, v_i.nome));
    v_observacao := 'trocada por ' || concat_ws(' · ', v_o.sku, v_o.variante, v_o.nome);
  else
    v_observacao := 'crédito R$ ' || replace(v_valor.valor_pago_item::numeric(10,2)::text, '.', ',');
  end if;
  update pedido_itens set status = 'removido', observacao = v_observacao where id = v_i.id;
  update troca_pecas set escolha_tipo = p_tipo,
    escolha_opcao_id = case when p_tipo = 'opcao' then p_opcao end,
    concluida_em = now(), resultado_diferenca = v_valor.diferenca where id = v_p.id;
  -- Venda do WhatsApp com desconto em R$: reajusta o desconto para o total fechar com o anunciado.
  -- (Percentual já acompanha o subtotal; na Shopify o total soma a diferença na view.)
  if v_p_ped.origem = 'whatsapp' and v_p_ped.desconto_tipo = 'valor' and v_alvo is not null then
    select coalesce(sum(qtd * coalesce(preco, 0)), 0) into v_sub
      from pedido_itens where pedido_id = v_t.pedido_id and status <> 'removido';
    v_pix := case when v_p_ped.forma_pagamento = 'Pix' then round(v_sub * 0.10, 2) else 0 end;
    update pedidos set desconto_valor = round(greatest(0, v_sub - v_pix - v_alvo), 2)
      where id = v_t.pedido_id;
  end if;
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and concluida_em is null) then
    -- Acerto: pendente se a troca deixou diferença (a cobrar ou crédito), senão sem diferença.
    update trocas set status = 'concluida', concluida_em = now(),
      acerto_status = case when abs(coalesce((select sum(resultado_diferenca) from troca_pecas
                                               where troca_id = v_t.id), 0)) < 0.005
                           then 'sem_diferenca' else 'pendente' end
    where id = v_t.id;
  end if;
  if not exists (select 1 from pedido_itens where pedido_id = v_t.pedido_id and status in ('falta', 'defeito')) then
    update pedidos set status = 'separacao'
      where id = v_t.pedido_id and status in ('avisar_cliente', 'aguardando_cliente');
  end if;
  return true;
end $$;
revoke all on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) to authenticated;

create or replace function public.troca_aprovar(p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
begin
  if p_tipo is null or p_tipo not in ('opcao', 'credito') then
    raise exception 'Tipo de aprovação inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  select * into v_p from troca_pecas where id = p_peca and troca_id = v_t.id for update;
  if not found then raise exception 'Peça não pertence a esta troca'; end if;
  if v_t.status = 'cancelada' then raise exception 'Esta troca foi cancelada'; end if;
  if v_p.concluida_em is not null then return true; end if;
  if v_t.status not in ('rascunho', 'enviada', 'respondida') then
    raise exception 'Esta troca não pode ser aprovada';
  end if;
  select status into v_ped from pedidos where id = v_t.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais troca', v_ped;
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id) then
      raise exception 'Opção não pertence a esta peça';
    end if;
    if exists (select 1 from troca_opcoes where id = p_opcao and preco is null) then
      raise exception 'Esta opção está sem preço. Informe o preço da opção antes de aprovar a troca.';
    end if;
  else
    p_opcao := null;
  end if;
  update troca_pecas set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao,
    escolhida_por = 'equipe', respondida_em = now()
  where id = v_p.id;
  return public.troca_concluir_peca(v_t.id, v_p.id, p_tipo, p_opcao, p_tipo);
end $$;
revoke all on function public.troca_aprovar(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.troca_aprovar(uuid, uuid, text, uuid) to authenticated;

revoke all on function public.troca_acerto(uuid, text) from public, anon;
revoke all on function public.sugerir_troca(uuid, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.troca_acerto(uuid, text) to authenticated;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Reiniciar do zero: recusa se já houve troca concluída (voltaria as peças e manteria o dinheiro)
-- ---------------------------------------------------------------------------
create or replace function public.reiniciar_pedido(p_pedido uuid, p_etapa text, p_tudo boolean)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_etapas text[] := case when p_tudo
    then array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem',
               'bipagem', 'faturamento', 'embalagem', 'pronto_envio']
    else array[p_etapa] end;
  v_pecas boolean := v_etapas && array['novo', 'separacao', 'avisar_cliente', 'aguardando_cliente'];
  v_conf  boolean := 'conferencia' = any(v_etapas);
  v_etiq  boolean := 'etiquetagem' = any(v_etapas);
  v_bip   boolean := 'bipagem' = any(v_etapas);
  v_fat   boolean := 'faturamento' = any(v_etapas);
  v_emb   boolean := 'embalagem' = any(v_etapas);
  v_post  boolean := 'pronto_envio' = any(v_etapas);
begin
  perform 1 from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if p_tudo then
    if exists (select 1 from troca_pecas tp join trocas t on t.id = tp.troca_id
                where t.pedido_id = p_pedido and tp.concluida_em is not null) then
      raise exception 'Este pedido já teve uma troca concluída. Reiniciar do zero desfaria as peças, mas não o valor já acertado. Reinicie só a etapa que precisa.';
    end if;
    update pedido_itens set status = 'removido'
     where pedido_id = p_pedido and status <> 'removido' and observacao like 'troca de%';
    update pedido_itens
       set status = 'pendente', observacao = null, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where pedido_id = p_pedido and status = 'removido'
       and (observacao is null or (observacao not like 'troca de%' and observacao <> 'removida na venda'));
    update trocas set status = 'cancelada'
     where pedido_id = p_pedido and status in ('rascunho', 'enviada', 'respondida');
  end if;

  update pedido_itens set
      status          = case when v_pecas then 'pendente' else status end,
      conferido_em    = case when v_pecas or v_conf then null else conferido_em end,
      etiquetado_em   = case when v_pecas or v_etiq then null else etiquetado_em end,
      etiqueta_previa = case when v_pecas or v_etiq then false else etiqueta_previa end,
      qtd_bipada      = case when v_pecas or v_bip then 0 else qtd_bipada end,
      bipado_em       = case when v_pecas or v_bip then null else bipado_em end
   where pedido_id = p_pedido and status <> 'removido'
     and (v_pecas or v_conf or v_etiq or v_bip);

  update pedidos set
      nf_emitida_em        = case when v_fat then null else nf_emitida_em end,
      frete_gerado_em      = case when v_fat then null else frete_gerado_em end,
      pedido_fornecedor_em = case when v_fat then null else pedido_fornecedor_em end,
      embalado_em          = case when v_emb then null else embalado_em end,
      postado_em           = case when v_post then null else postado_em end,
      rastreio_enviado_em  = case when v_post then null else rastreio_enviado_em end,
      status               = case when p_tudo then 'novo' else status end
   where id = p_pedido and (v_fat or v_emb or v_post or p_tudo);

  insert into pedido_eventos (pedido_id, tipo, de, texto, usuario_email)
  values (p_pedido, 'reiniciado', p_etapa, case when p_tudo then 'pedido inteiro' else 'etapa ' || p_etapa end,
          usuario_atual_email());
end $$;
revoke all on function public.reiniciar_pedido(uuid, text, boolean) from public, anon;
grant execute on function public.reiniciar_pedido(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Devolução ao cliente e ajuste de bipagem
-- ---------------------------------------------------------------------------
-- Marca (ou desfaz) como devolvido o valor das peças removidas pela cliente depois do pagamento.
-- Security definer: a política de pedido_eventos só deixa a tela registrar 'nota' e 'reiniciado'.
create or replace function public.marcar_devolvido(p_pedido uuid, p_desfazer boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pago timestamptz;
  v_n int;
  v_valor numeric;
begin
  select pago_em into v_pago from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_pago is null then return; end if;
  if not coalesce(p_desfazer, false) then
    select a_devolver into v_valor from v_pedidos where id = p_pedido;
    update pedido_itens set devolvido_em = now()
     where pedido_id = p_pedido and status = 'removido' and observacao = 'cliente desistiu'
       and removido_em > v_pago and devolvido_em is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
      values (p_pedido, 'devolvido', 'Devolvido à cliente: R$ ' || replace(coalesce(v_valor, 0)::numeric(10,2)::text, '.', ','),
              public.usuario_atual_email());
    end if;
  else
    update pedido_itens set devolvido_em = null
     where pedido_id = p_pedido and status = 'removido' and observacao = 'cliente desistiu'
       and removido_em > v_pago and devolvido_em is not null and reembolsado_shopify_em is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      select a_devolver into v_valor from v_pedidos where id = p_pedido;
      insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
      values (p_pedido, 'devolvido_desfeito', 'Devolução desfeita: voltou a devolver R$ ' || replace(coalesce(v_valor, 0)::numeric(10,2)::text, '.', ','),
              public.usuario_atual_email());
    end if;
  end if;
end $$;
revoke all on function public.marcar_devolvido(uuid, boolean) from public, anon;
grant execute on function public.marcar_devolvido(uuid, boolean) to authenticated;

-- "Contar 1 / Tirar 1" na bipagem: soma ou tira no banco (sem corrida) e devolve o valor novo.
-- O histórico sai do gatilho do item (evento 'bipada' com o valor de antes e de depois).
create or replace function public.bipar_ajustar(p_item uuid, p_delta int) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_novo int;
begin
  if p_delta is null then raise exception 'Ajuste inválido'; end if;
  update pedido_itens
     set qtd_bipada = least(qtd, greatest(0, qtd_bipada + p_delta)),
         bipado_em = case when least(qtd, greatest(0, qtd_bipada + p_delta)) > 0 then now() else null end
   where id = p_item
  returning qtd_bipada into v_novo;
  if not found then raise exception 'Peça não encontrada'; end if;
  return v_novo;
end $$;
revoke all on function public.bipar_ajustar(uuid, int) from public, anon;
grant execute on function public.bipar_ajustar(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Importação da Shopify
-- Novidades: reembolso cancela, despacho antecipado avisa, preço pago por linha, valor atual a cada
-- sincronização, frete_pago_por intocado, contagem de "peças mudaram" sem peças de troca ou da equipe,
-- sync simultânea sem erro, retirada antes de pac (palavra inteira) e correção do pago_em estimado.
-- ---------------------------------------------------------------------------
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        uuid;
  v_status    text;
  v_cancel    boolean := coalesce((p->>'cancelado')::boolean, false);
  v_reemb     boolean := coalesce((p->>'reembolsado')::boolean, false);
  v_desp      boolean := coalesce((p->>'despachado')::boolean, false);
  v_estimado  boolean := coalesce((p->>'pago_em_estimado')::boolean, false);
  v_codigos   text[];
  v_cupom     text;
  v_desc      numeric := nullif(p->>'desconto_valor', '')::numeric;
  v_frete     numeric := nullif(p->>'frete_cobrado', '')::numeric;
  v_titulo    text    := lower(coalesce(p->>'frete_titulo', ''));
  v_tipo      text;
  v_pagopor   text;
  v_mudou     boolean;
  v_cpf       text    := nullif(regexp_replace(coalesce(p->>'cliente_cpf', ''), '\D', '', 'g'), '');
  -- A sincronização nova manda o frete original e o cobrado já separados (valores exatos da Shopify).
  v_exato     boolean := p ? 'frete_original';
  v_fo        numeric := nullif(p->>'frete_original', '')::numeric;
  v_dfrete    numeric;
  v_total     numeric := nullif(p->>'valor_total', '')::numeric;
  v_pago      numeric := nullif(p->>'valor_pago', '')::numeric;
  v_n         int;
  v_texto     text;
begin
  select array_agg(x) into v_codigos from jsonb_array_elements_text(coalesce(p->'desconto_codigos', '[]'::jsonb)) x;
  v_cupom := nullif(array_to_string(v_codigos, ', '), '');
  if v_desc is not null and v_desc <= 0 then v_desc := null; end if;
  v_tipo := case
    when v_titulo = '' then null
    when v_titulo like '%sedex%' then 'SEDEX'
    when v_titulo like '%retirada%' then 'retirada'
    when v_titulo ~* '\mpac\M' then 'PAC'
    else 'outro' end;
  v_pagopor := case when v_frete is null then null when v_frete > 0 then 'cliente' else 'arvenne' end;
  v_dfrete := case when v_fo is not null and v_frete is not null then greatest(0, v_fo - v_frete) end;

  select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is null then
    -- Pedido novo: cancelado, reembolsado ou que já saiu antes de entrar no app não vira pedido.
    if v_cancel or v_reemb or v_desp then
      return false;
    end if;

    insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                         valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em, pago_em_estimado,
                         cliente_cpf, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                         entrega_bairro, entrega_cidade, entrega_uf,
                         desconto_tipo, desconto_valor, desconto_codigos, cupom,
                         frete_cobrado, frete_tipo, frete_pago_por, frete_original, desconto_frete,
                         forma_pagamento, valor_pago, shopify_bruto, rastreio, rastreio_url)
    values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
            p->>'cliente_email', v_total,
            (p->>'shopify_order_id')::bigint, p->>'shopify_url',
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()),
            v_estimado or nullif(p->>'pago_em', '') is null,
            v_cpf,
            nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), ''),
            nullif(p->>'entrega_logradouro', ''), nullif(p->>'entrega_numero', ''),
            nullif(p->>'entrega_complemento', ''), nullif(p->>'entrega_bairro', ''),
            nullif(p->>'entrega_cidade', ''), nullif(p->>'entrega_uf', ''),
            case when v_desc is not null then 'valor' end, v_desc, v_codigos, v_cupom,
            v_frete, v_tipo, v_pagopor, v_fo, v_dfrete,
            nullif(p->>'forma_pagamento', ''), v_pago,
            p->'shopify_bruto', nullif(p->>'rastreio', ''), nullif(p->>'rastreio_url', ''))
    on conflict (shopify_order_id) do nothing
    returning id into v_id;

    if v_id is not null then
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, shopify_line_id, sku, nome, variante,
                                foto_url, qtd, preco, preco_pago, ordem)
      select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, nullif(i->>'shopify_line_id', ''),
             i->>'sku', i->>'nome',
             i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
             round(nullif(i->>'preco_pago', '')::numeric, 2), ord::int
      from jsonb_array_elements(p->'itens') with ordinality as t(i, ord)
      where (i->>'qtd')::int > 0;
      return true;
    end if;

    -- Outra sincronização entrou na frente: segue como atualização, sem erro.
    select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;
    if v_id is null then return false; end if;
  end if;

  -- Já importado: completa só o que está nulo (a equipe pode ter editado), guarda a versão mais
  -- nova do pedido bruto e acompanha cancelamento, reembolso e despacho. Nunca volta etapa.
  update pedidos set
    cliente_cpf          = coalesce(cliente_cpf, v_cpf),
    entrega_cep          = coalesce(entrega_cep, nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), '')),
    entrega_logradouro   = coalesce(entrega_logradouro, nullif(p->>'entrega_logradouro', '')),
    entrega_numero       = coalesce(entrega_numero, nullif(p->>'entrega_numero', '')),
    entrega_complemento  = coalesce(entrega_complemento, nullif(p->>'entrega_complemento', '')),
    entrega_bairro       = coalesce(entrega_bairro, nullif(p->>'entrega_bairro', '')),
    entrega_cidade       = coalesce(entrega_cidade, nullif(p->>'entrega_cidade', '')),
    entrega_uf           = coalesce(entrega_uf, nullif(p->>'entrega_uf', '')),
    desconto_tipo        = case when desconto_tipo is null and v_desc is not null then 'valor' else desconto_tipo end,
    desconto_valor       = coalesce(desconto_valor, v_desc),
    desconto_codigos     = coalesce(desconto_codigos, v_codigos),
    cupom                = coalesce(cupom, v_cupom),
    frete_cobrado        = coalesce(frete_cobrado, v_frete),
    frete_tipo           = coalesce(frete_tipo, v_tipo),
    frete_pago_por       = coalesce(frete_pago_por, v_pagopor),
    forma_pagamento      = coalesce(forma_pagamento, nullif(p->>'forma_pagamento', '')),
    valor_pago           = coalesce(valor_pago, v_pago),
    rastreio             = coalesce(rastreio, nullif(p->>'rastreio', '')),
    rastreio_url         = coalesce(rastreio_url, nullif(p->>'rastreio_url', ''))
  where id = v_id
    and ((cliente_cpf is null and v_cpf is not null)
         or (entrega_cep is null and nullif(p->>'entrega_cep', '') is not null)
         or (entrega_logradouro is null and nullif(p->>'entrega_logradouro', '') is not null)
         or (entrega_numero is null and nullif(p->>'entrega_numero', '') is not null)
         or (entrega_cidade is null and nullif(p->>'entrega_cidade', '') is not null)
         or (entrega_uf is null and nullif(p->>'entrega_uf', '') is not null)
         or (entrega_bairro is null and nullif(p->>'entrega_bairro', '') is not null)
         or (entrega_complemento is null and nullif(p->>'entrega_complemento', '') is not null)
         or (desconto_valor is null and v_desc is not null)
         or (cupom is null and v_cupom is not null)
         or (frete_cobrado is null and v_frete is not null)
         or (frete_tipo is null and v_tipo is not null)
         or (frete_pago_por is null and v_pagopor is not null)
         or (desconto_codigos is null and v_codigos is not null)
         or (forma_pagamento is null and nullif(p->>'forma_pagamento', '') is not null)
         or (valor_pago is null and v_pago is not null)
         or (rastreio is null and nullif(p->>'rastreio', '') is not null)
         or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

  -- Dados da Shopify (a equipe não edita): o valor atual vence a cada sincronização.
  if v_total is not null then
    update pedidos set valor_total = v_total, valor_pago = coalesce(v_pago, valor_pago)
    where id = v_id and (valor_total is distinct from v_total or valor_pago is distinct from coalesce(v_pago, valor_pago));
  end if;

  -- Data real do pagamento chegou depois de uma data estimada: corrige uma vez.
  if not v_estimado and nullif(p->>'pago_em', '') is not null then
    update pedidos set pago_em = (p->>'pago_em')::timestamptz, pago_em_estimado = false
    where id = v_id and pago_em_estimado;
  end if;

  if v_exato then
    -- frete_pago_por NÃO é sobrescrito: a equipe pode ter corrigido quem paga o frete.
    update pedidos set
      frete_cobrado  = coalesce(v_frete, frete_cobrado),
      frete_original = v_fo,
      desconto_frete = v_dfrete,
      desconto_tipo  = case when v_desc is not null then 'valor' end,
      desconto_valor = v_desc
    where id = v_id
      and (frete_cobrado is distinct from coalesce(v_frete, frete_cobrado)
           or frete_original is distinct from v_fo
           or desconto_frete is distinct from v_dfrete
           or desconto_valor is distinct from v_desc
           or desconto_tipo is distinct from case when v_desc is not null then 'valor' end);
  end if;

  if p ? 'itens' then
    -- Preço pago por linha da Shopify. Linhas antigas (sem id) casam pela variante só quando ela
    -- aparece uma vez no pedido da Shopify e uma vez no app.
    with src as (
      select nullif(x->>'shopify_line_id', '') as linha,
             nullif(x->>'shopify_variant_id', '')::bigint as variante,
             round(nullif(x->>'preco_pago', '')::numeric, 2) as pago,
             count(*) over (partition by nullif(x->>'shopify_variant_id', '')) as n_var
      from jsonb_array_elements(p->'itens') x
    )
    update pedido_itens i
       set preco_pago = s.pago,
           shopify_line_id = coalesce(i.shopify_line_id, s.linha)
      from src s
     where i.pedido_id = v_id and i.origem = 'shopify'
       and coalesce(i.observacao, '') not like 'troca de%'
       and s.pago is not null
       and ((s.linha is not null and i.shopify_line_id = s.linha)
            or (i.shopify_line_id is null and s.n_var = 1 and s.variante is not null
                and i.shopify_variant_id = s.variante
                and (select count(*) from pedido_itens y
                      where y.pedido_id = v_id and y.origem = 'shopify' and y.shopify_line_id is null
                        and coalesce(y.observacao, '') not like 'troca de%'
                        and y.shopify_variant_id = s.variante) = 1))
       and (i.preco_pago is distinct from s.pago or (i.shopify_line_id is null and s.linha is not null));

    -- Peça removida pela equipe (cliente desistiu) e reembolsada na Shopify: a linha voltou com quantidade 0.
    -- O valor_total atual já desconta; marca para sair do valor_removido e conta como devolvida.
    update pedido_itens i
       set reembolsado_shopify_em = now(),
           devolvido_em = coalesce(i.devolvido_em, now())
      from jsonb_array_elements(p->'itens') x
     where i.pedido_id = v_id and i.status = 'removido' and i.reembolsado_shopify_em is null
       and i.shopify_line_id is not null
       and i.shopify_line_id = nullif(x->>'shopify_line_id', '')
       and coalesce((x->>'qtd')::int, 0) = 0;

    -- Quantidade por variante/SKU diferente das peças da Shopify (inclui as removidas pela equipe, para não
    -- dar alarme falso; ignora peças de troca e as que a equipe acrescentou): avisa uma vez.
    if not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alterado') then
      select exists (
        select 1 from (
          select coalesce(i->>'shopify_variant_id', 'sku:' || coalesce(i->>'sku', '')) as chave, sum((i->>'qtd')::int) as qtd
          from jsonb_array_elements(p->'itens') i where (i->>'qtd')::int > 0 group by 1
        ) s full join (
          select coalesce(shopify_variant_id::text, 'sku:' || coalesce(sku, '')) as chave, sum(qtd) as qtd
          from pedido_itens l
          where l.pedido_id = v_id and l.origem = 'shopify' and coalesce(l.observacao, '') not like 'troca de%'
            and (l.shopify_line_id is not null
                 or not exists (select 1 from pedido_itens z where z.pedido_id = v_id and z.shopify_line_id is not null))
          group by 1
        ) l using (chave)
        where s.qtd is distinct from l.qtd
      ) into v_mudou;
      if v_mudou then
        insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
        values (v_id, 'shopify_alterado', 'As peças do pedido mudaram na Shopify depois da importação.', 'shopify');
      end if;
    end if;
  end if;

  if p ? 'shopify_bruto' then
    update pedidos set shopify_bruto = p->'shopify_bruto'
    where id = v_id and shopify_bruto is distinct from p->'shopify_bruto';
  end if;

  if v_cancel or v_reemb then
    update pedidos set status = 'cancelado'
    where id = v_id and status not in ('cancelado', 'enviado');
    get diagnostics v_n = row_count;
    if v_reemb then
      -- Aviso uma vez só (a sincronização repete a cada poucos minutos).
      v_texto := case
        when v_n > 0 then 'Pedido reembolsado na Shopify: cancelado automaticamente.'
        when v_status = 'enviado' then 'Pedido reembolsado na Shopify, mas já foi enviado. Confira.'
        else 'Pedido reembolsado na Shopify.' end;
      insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
      select v_id, 'shopify_alerta', v_texto, 'shopify'
      where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                         and texto like 'Pedido reembolsado na Shopify%');
    end if;
  elsif v_desp and v_status in ('embalagem', 'pronto_envio') then
    update pedidos set status = 'enviado',
           postado_em = coalesce(postado_em, nullif(p->>'postado_em', '')::timestamptz, now())
    where id = v_id and status in ('embalagem', 'pronto_envio');
  elsif v_desp and v_status not in ('enviado', 'cancelado', 'perdida', 'em_aberto', 'aguardando_pagamento') then
    -- Despachado na Shopify antes de chegar à embalagem: não move o pedido, só avisa (uma vez).
    v_texto := 'A Shopify marcou este pedido como enviado, mas ele ainda está em "' || v_status || '". Confira.';
    insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
    select v_id, 'shopify_alerta', v_texto, 'shopify'
    where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                       and texto like 'A Shopify marcou este pedido como enviado%');
  end if;
  return false;
end $$;

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;
