-- Carrinho na troca e falta parcial (11/11/2026).
-- 1) marcar_falta: "faltam 1 de 4" divide a linha do pedido (3 seguem, 1 vai para a troca/defeito).
-- 2) troca_escolhas: a cliente soma várias peças/quantidades (carrinho) para cada peça em falta.
-- Este projeto não dá GRANT automático: tudo que é novo leva GRANT explícito. "anon" não recebe nada
-- (só as funções públicas da troca) e "authenticated" nunca recebe DELETE em pedidos e itens.

-- ---------------------------------------------------------------------------
-- 1. Falta parcial
-- Insert em pedido_itens não gera evento; o gatilho de status gera. Por isso a linha nova nasce
-- 'pendente' e logo depois muda para falta/defeito (o histórico registra pendente -> falta).
-- ---------------------------------------------------------------------------
create or replace function public.marcar_falta(p_item uuid, p_qtd int, p_status text default 'falta')
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_i pedido_itens%rowtype;
  v_ped text;
  v_novo uuid;
begin
  if p_status is null or p_status not in ('falta', 'defeito') then
    raise exception 'Status inválido para peça com problema';
  end if;
  if p_qtd is null or p_qtd < 1 then
    raise exception 'Informe quantas peças faltam';
  end if;
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;
  select status into v_ped from pedidos where id = v_i.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;

  if p_qtd >= v_i.qtd then
    -- Linha inteira: zera as etapas (conferência, etiqueta, bipagem).
    update pedido_itens
       set status = p_status, conferido_em = null, etiquetado_em = null,
           etiqueta_previa = false, qtd_bipada = 0, bipado_em = null
     where id = p_item;
    return p_item;
  end if;

  update pedido_itens
     set qtd = v_i.qtd - p_qtd, qtd_bipada = least(v_i.qtd_bipada, v_i.qtd - p_qtd)
   where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem, null,
    'pendente', p_qtd)
  returning id into v_novo;
  update pedido_itens set status = p_status where id = v_novo;
  return v_novo;
end $$;
revoke all on function public.marcar_falta(uuid, int, text) from public, anon;
grant execute on function public.marcar_falta(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tabela do carrinho
-- ---------------------------------------------------------------------------
create table public.troca_escolhas (
  id uuid primary key default gen_random_uuid(),
  troca_peca_id uuid not null references public.troca_pecas(id) on delete cascade,
  opcao_id uuid not null references public.troca_opcoes(id) on delete cascade,
  qtd int not null check (qtd > 0),
  created_at timestamptz not null default now(),
  -- ordem de inclusão no carrinho (vale mesmo dentro de uma única transação / mesmo milissegundo)
  seq bigint generated always as identity,
  unique (troca_peca_id, opcao_id)
);
create index troca_escolhas_opcao_idx on public.troca_escolhas (opcao_id);

alter table public.troca_escolhas enable row level security;
create policy equipe_le on public.troca_escolhas for select to authenticated using (true);
revoke all on public.troca_escolhas from anon, authenticated;
grant select on public.troca_escolhas to authenticated, service_role;

-- Tempo real: o carrinho da cliente aparece na hora para a equipe.
alter publication supabase_realtime add table public.troca_escolhas;

-- Escolhas atuais viram carrinho com a quantidade inteira da linha.
insert into public.troca_escolhas (troca_peca_id, opcao_id, qtd)
select p.id, p.escolha_opcao_id, i.qtd
from public.troca_pecas p
join public.pedido_itens i on i.id = p.item_id
where p.escolha_tipo = 'opcao' and p.escolha_opcao_id is not null;

-- escolha_tipo 'opcao' = carrinho com pelo menos 1 escolha; escolha_opcao_id = a 1ª escolha (compatibilidade).
-- Recalcula depois que uma escolha some (ex.: a equipe apagou a opção e o ON DELETE CASCADE apagou a linha).
create or replace function public.troca_recalcular_escolha(p_peca uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p troca_pecas%rowtype;
  v_primeira uuid;
begin
  select * into v_p from troca_pecas where id = p_peca for update;
  if not found or v_p.concluida_em is not null or v_p.escolha_tipo is distinct from 'opcao' then
    return;
  end if;
  select e.opcao_id into v_primeira
    from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
   where e.troca_peca_id = p_peca order by e.seq limit 1;
  if v_primeira is null then
    update troca_pecas set escolha_tipo = null, escolha_opcao_id = null, respondida_em = null where id = p_peca;
    update trocas set status = 'enviada', respondida_em = null
     where id = v_p.troca_id and status = 'respondida';
  elsif v_primeira is distinct from v_p.escolha_opcao_id then
    update troca_pecas set escolha_opcao_id = v_primeira where id = p_peca;
  end if;
end $$;
revoke all on function public.troca_recalcular_escolha(uuid) from public, anon, authenticated;

create or replace function public.tg_troca_escolhas_apagada() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- As funções do carrinho cuidam do recálculo sozinhas (e avisam por esta chave).
  if coalesce(current_setting('arvenne.sem_recalculo', true), '') = '1' then
    return null;
  end if;
  perform public.troca_recalcular_escolha(old.troca_peca_id);
  return null;
end $$;
revoke all on function public.tg_troca_escolhas_apagada() from public, anon, authenticated;
create trigger troca_escolhas_apagada after delete on public.troca_escolhas
for each row execute function public.tg_troca_escolhas_apagada();

-- Se a opção "escolhida" some (FK vira null) mas há outra no carrinho, a peça aponta para ela.
create or replace function public.tg_troca_pecas_validar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_resto uuid;
begin
  if old.concluida_em is not null and (
    new.escolha_tipo is distinct from old.escolha_tipo or
    new.escolha_opcao_id is distinct from old.escolha_opcao_id) then
    raise exception 'Não é possível alterar a escolha de uma troca já concluída';
  end if;
  if new.escolha_tipo = 'opcao' and new.escolha_opcao_id is null then
    select e.opcao_id into v_resto
      from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
     where e.troca_peca_id = new.id order by e.seq limit 1;
    if v_resto is not null then
      new.escolha_opcao_id := v_resto;
    else
      new.escolha_tipo := null;
      new.respondida_em := null;
      update trocas set status = 'enviada', respondida_em = null
        where id = new.troca_id and status = 'respondida';
    end if;
  end if;
  return new;
end $$;

-- Define o carrinho como UMA opção com a quantidade da linha (p_opcao null = esvazia). Uso interno.
create or replace function public.troca_carrinho_definir(p_peca uuid, p_opcao uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_qtd int;
begin
  perform set_config('arvenne.sem_recalculo', '1', true);
  if p_opcao is not null then
    select i.qtd into v_qtd from troca_pecas p join pedido_itens i on i.id = p.item_id where p.id = p_peca;
    insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values (p_peca, p_opcao, v_qtd)
      on conflict (troca_peca_id, opcao_id) do update set qtd = excluded.qtd;
  end if;
  delete from troca_escolhas where troca_peca_id = p_peca and opcao_id is distinct from p_opcao;
  perform set_config('arvenne.sem_recalculo', '', true);
end $$;
revoke all on function public.troca_carrinho_definir(uuid, uuid) from public, anon;
grant execute on function public.troca_carrinho_definir(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Valores: valor_unit no fim de v_troca_valores; v_troca_carrinho nova; v_troca_resumo usa o carrinho
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
       end as situacao,
       round(o.preco * g.fator, 2) as valor_unit
from pago g
join public.troca_opcoes o on o.troca_peca_id = g.troca_peca_id and o.preco is not null
union all
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, null::uuid, 'credito'::text, g.qtd,
       g.valor_pago_item, 0::numeric, -g.valor_pago_item, 'credito'::text, null::numeric
from pago g;

revoke all on public.v_troca_valores from anon;
grant select on public.v_troca_valores to authenticated, service_role;

create view public.v_troca_carrinho with (security_invoker = true) as
select e.troca_peca_id, c.troca_id, c.pedido_id, c.item_id,
       sum(e.qtd)::int                                                          as unidades,
       sum(e.qtd * x.valor_unit)::numeric(10,2)                                 as valor_escolhido,
       c.valor_pago_item::numeric(10,2)                                         as valor_pago_item,
       (sum(e.qtd * x.valor_unit) - c.valor_pago_item)::numeric(10,2)           as diferenca,
       jsonb_agg(jsonb_build_object('opcao_id', e.opcao_id, 'qtd', e.qtd, 'valor_unit', x.valor_unit,
                                    'valor', round(e.qtd * x.valor_unit, 2))
                 order by e.seq)                                   as itens
from public.troca_escolhas e
join public.v_troca_valores x on x.troca_peca_id = e.troca_peca_id and x.opcao_id = e.opcao_id
join public.v_troca_valores c on c.troca_peca_id = e.troca_peca_id and c.tipo = 'credito'
group by e.troca_peca_id, c.troca_id, c.pedido_id, c.item_id, c.valor_pago_item;

revoke all on public.v_troca_carrinho from anon;
grant select on public.v_troca_carrinho to authenticated, service_role;

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
  left join public.v_troca_valores c on c.troca_peca_id = p.id and c.tipo = 'credito'
  left join public.v_troca_carrinho x on x.troca_peca_id = p.id
  group by t.id, t.pedido_id, t.cobrir_ate
) r
cross join lateral (
  select case when r.bruta > 0 then least(r.bruta, r.cobrir_ate) else 0 end as v
) cv;

revoke all on public.v_troca_resumo from anon;
grant select on public.v_troca_resumo to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. v_pedido_acerto: depois_lista (todas as peças novas da peça trocada); depois = a 1ª
-- ---------------------------------------------------------------------------
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
  join alvo al on al.pedido_id = pc.pedido_id
  group by pc.pedido_id
)
select a.pedido_id,
       -- v.total já desconta a cobertura de todas as trocas; soma de volta para não distorcer o que a cliente pagou.
       (v.total - a.saldo_todas + v.troca_coberto + v.valor_removido)::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       (a.a_cobrar_bruto - cv.v)::numeric(10,2) as total_a_cobrar,
       a.total_credito,
       (a.saldo_bruto - cv.v)::numeric(10,2) as saldo,
       v.total::numeric(10,2) as novo_total,
       al.troca_id,
       al.acerto_status,
       al.acerto_em,
       al.acerto_por,
       a.pecas,
       cv.v as coberto
from agg a
join alvo al on al.pedido_id = a.pedido_id
join public.v_pedidos v on v.id = a.pedido_id
join public.trocas tt on tt.id = al.troca_id
cross join lateral (
  select (case when a.saldo_bruto > 0 then least(a.saldo_bruto, tt.cobrir_ate) else 0 end)::numeric(10,2) as v
) cv;

revoke all on public.v_pedido_acerto from anon;
grant select on public.v_pedido_acerto to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Cliente: troca_carrinho (soma/tira uma opção) e troca_escolher (atalho / crédito / WhatsApp)
-- ---------------------------------------------------------------------------
create or replace function public.troca_carrinho(p_token uuid, p_item uuid, p_opcao uuid, p_qtd int)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_ped text;
  v_outras int;
  v_primeira uuid;
begin
  if p_qtd is null or p_qtd < 0 then raise exception 'Quantidade inválida'; end if;
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
  if p_opcao is null or not exists (
      select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id and preco is not null) then
    raise exception 'Opção inválida';
  end if;
  select coalesce(sum(qtd), 0) into v_outras from troca_escolhas
   where troca_peca_id = v_p.id and opcao_id <> p_opcao;
  if v_outras + p_qtd > 20 then
    raise exception 'O limite é de 20 peças por troca. Tire alguma peça do carrinho antes de somar outra.';
  end if;

  perform set_config('arvenne.sem_recalculo', '1', true);
  if p_qtd = 0 then
    delete from troca_escolhas where troca_peca_id = v_p.id and opcao_id = p_opcao;
  else
    insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values (v_p.id, p_opcao, p_qtd)
      on conflict (troca_peca_id, opcao_id) do update set qtd = excluded.qtd;
  end if;
  perform set_config('arvenne.sem_recalculo', '', true);

  select e.opcao_id into v_primeira from troca_escolhas e
   where e.troca_peca_id = v_p.id order by e.seq limit 1;
  update troca_pecas
     set escolha_tipo = case when v_primeira is not null then 'opcao' end,
         escolha_opcao_id = v_primeira,
         respondida_em = case when v_primeira is not null then now() end,
         escolhida_por = null
   where id = v_p.id;
  -- Respondida quando todas as peças têm escolha; volta a enviada se a cliente esvaziou uma.
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  elsif v_t.status = 'respondida' then
    update trocas set status = 'enviada', respondida_em = null where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_carrinho(uuid, uuid, uuid, int) from public;
grant execute on function public.troca_carrinho(uuid, uuid, uuid, int) to anon, authenticated;

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
  -- "Quero esta" = carrinho só com essa opção (quantidade da linha); crédito/WhatsApp esvaziam o carrinho.
  perform public.troca_carrinho_definir(v_p.id, p_opcao);
  update troca_pecas
     set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now(), escolhida_por = null
   where id = v_p.id;
  -- Respondida quando todas as peças (ainda não feitas) têm escolha.
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  end if;
  return true;
end $$;
revoke all on function public.troca_escolher(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_escolher(uuid, uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. troca_publica: carrinho, valor_escolhido, unidades, novas[] e valor_unit nas opções
-- ---------------------------------------------------------------------------
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
          join v_troca_valores x on x.opcao_id = o.id
          where o.troca_peca_id = p.id), '[]'::jsonb)
      ) order by i.ordem, p.created_at)
      from troca_pecas p
      join pedido_itens i on i.id = p.item_id
      where p.troca_id = v_t.id), '[]'::jsonb));
end $$;
revoke all on function public.troca_publica(uuid) from public;
grant execute on function public.troca_publica(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Equipe: concluir (agora com várias linhas), aprovar opção e aprovar o carrinho da cliente
-- ---------------------------------------------------------------------------
drop function public.troca_concluir_peca(uuid, uuid, text, uuid, text);
create function public.troca_concluir_peca(
  p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text, p_versao timestamptz default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
  v_i pedido_itens%rowtype;
  v_e record;
  v_carr record;
  v_valor record;
  v_dif numeric;
  v_ordem integer;
  v_observacao text;
  v_p_ped pedidos%rowtype;
  v_alvo numeric;
  v_sub numeric;
  v_pix numeric;
  v_ped_status text;
  v_sem_preco int;
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
  -- Conferência otimista: com p_versao vale a data da resposta da cliente (qualquer mudança no carrinho
  -- a renova); sem ela, o tipo e a opção que a equipe viu.
  if p_versao is not null then
    if v_p.respondida_em is distinct from p_versao then
      raise exception 'A cliente mudou a escolha. Confira a resposta atual antes de confirmar.';
    end if;
  elsif v_p.escolha_tipo is distinct from p_escolha_tipo
     or v_p.escolha_opcao_id is distinct from p_opcao then
    raise exception 'A cliente mudou a escolha. Confira a resposta atual antes de confirmar.';
  end if;
  select * into v_i from pedido_itens where id = v_p.item_id and pedido_id = v_t.pedido_id for update;
  if not found or v_i.status not in ('falta', 'defeito') then
    raise exception 'Esta peça não está mais em falta';
  end if;

  if p_tipo = 'opcao' then
    if v_p.escolha_tipo is distinct from 'opcao' or not exists (
        select 1 from troca_escolhas where troca_peca_id = v_p.id) then
      raise exception 'A cliente ainda não escolheu uma opção para esta peça';
    end if;
    select count(*) into v_sem_preco from troca_escolhas e
      join troca_opcoes o on o.id = e.opcao_id where e.troca_peca_id = v_p.id and o.preco is null;
    if v_sem_preco > 0 then
      raise exception 'Esta opção está sem preço. Informe o preço da opção antes de concluir a troca.';
    end if;
    select * into v_carr from v_troca_carrinho where troca_peca_id = v_p.id;
    if not found or v_carr.diferenca is null then raise exception 'Não foi possível calcular a troca'; end if;
    v_dif := v_carr.diferenca;
  else
    select * into v_valor from v_troca_valores where troca_peca_id = v_p.id and tipo = 'credito';
    if not found or v_valor.diferenca is null then raise exception 'Não foi possível calcular a troca'; end if;
    v_dif := v_valor.diferenca;
  end if;

  -- Total anunciado = valor das peças (com desconto) antes da troca + diferença da troca.
  select * into v_p_ped from pedidos where id = v_t.pedido_id for update;
  -- A cobertura já aplicada (troca_coberto) volta à conta: o desconto em R$ guarda só o valor SEM cobertura
  -- e a view abate a cobertura nova por cima, então total final = total original + diferença líquida.
  select valor_pecas_com_desconto + troca_coberto + v_dif into v_alvo from v_pedidos where id = v_t.pedido_id;

  if p_tipo = 'opcao' then
    select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = v_t.pedido_id;
    v_observacao := null;
    -- Uma linha nova por peça do carrinho (na ordem em que a cliente montou).
    for v_e in
      select e.qtd, o.origem, o.shopify_variant_id, o.peca_clube_id, o.sku, o.nome, o.variante, o.foto_url, o.preco
        from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
       where e.troca_peca_id = v_p.id order by e.seq
    loop
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
        variante, foto_url, qtd, preco, ordem, observacao)
      values (v_t.pedido_id, case when v_e.origem = 'site' then 'shopify' else 'clube' end,
        v_e.shopify_variant_id, v_e.peca_clube_id, v_e.sku, v_e.nome, v_e.variante, v_e.foto_url,
        v_e.qtd, v_e.preco, v_ordem, 'troca de ' || coalesce(v_i.sku, v_i.nome));
      v_observacao := coalesce(v_observacao || ' + ', 'trocada por ')
                      || concat_ws(' · ', v_e.sku, v_e.variante, v_e.nome);
    end loop;
  else
    v_observacao := 'crédito R$ ' || replace(v_valor.valor_pago_item::numeric(10,2)::text, '.', ',');
  end if;
  update pedido_itens set status = 'removido', observacao = v_observacao where id = v_i.id;
  update troca_pecas set escolha_tipo = p_tipo,
    escolha_opcao_id = case when p_tipo = 'opcao' then v_p.escolha_opcao_id end,
    concluida_em = now(), resultado_diferenca = v_dif where id = v_p.id;
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
revoke all on function public.troca_concluir_peca(uuid, uuid, text, uuid, text, timestamptz) from public, anon;
grant execute on function public.troca_concluir_peca(uuid, uuid, text, uuid, text, timestamptz) to authenticated;

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
  -- A equipe escolhe uma opção: o carrinho vira só ela, com a quantidade da linha.
  perform public.troca_carrinho_definir(v_p.id, p_opcao);
  update troca_pecas set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao,
    escolhida_por = 'equipe', respondida_em = now()
  where id = v_p.id;
  return public.troca_concluir_peca(v_t.id, v_p.id, p_tipo, p_opcao, p_tipo);
end $$;
revoke all on function public.troca_aprovar(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.troca_aprovar(uuid, uuid, text, uuid) to authenticated;

-- Equipe aprova o carrinho que a cliente montou (escolhida_por continua como estava).
create or replace function public.troca_aprovar_carrinho(p_troca uuid, p_peca uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
begin
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  select * into v_p from troca_pecas where id = p_peca and troca_id = v_t.id for update;
  if not found then raise exception 'Peça não pertence a esta troca'; end if;
  if v_p.concluida_em is not null then return true; end if;
  if v_p.escolha_tipo is distinct from 'opcao' or not exists (
      select 1 from troca_escolhas where troca_peca_id = v_p.id) then
    raise exception 'A cliente ainda não montou o carrinho desta peça';
  end if;
  return public.troca_concluir_peca(v_t.id, v_p.id, 'opcao', v_p.escolha_opcao_id, 'opcao', v_p.respondida_em);
end $$;
revoke all on function public.troca_aprovar_carrinho(uuid, uuid) from public, anon;
grant execute on function public.troca_aprovar_carrinho(uuid, uuid) to authenticated;
