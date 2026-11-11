-- Troca v2: preço pago certo, aprovar na tela, acerto e página da cliente.
-- Substitui a antiga 20261113130000_fator_shopify (nunca aplicada).
--
-- O "total de descontos" da Shopify soma o desconto das peças com o frete grátis. Aqui os dois
-- ficam separados: o desconto do pedido incide só nas peças; o frete grátis é outro desconto.
-- A Shopify informa o preço pago por linha (discountedUnitPriceAfterAllDiscountsSet) e o frete
-- original/cobrado (shippingLine); o app guarda esses valores exatos e a tela não calcula nada.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
alter table public.pedido_itens
  add column preco_pago numeric(10,2),
  add constraint pedido_itens_preco_pago_nao_negativo check (preco_pago >= 0);
comment on column public.pedido_itens.preco_pago is
  'Preço unitário pago pela cliente depois de todos os descontos (Shopify). Nulo = usar preço x fator.';

alter table public.pedidos
  add column frete_original numeric(10,2),
  add column desconto_frete numeric(10,2),
  add constraint pedidos_frete_original_nao_negativo check (frete_original >= 0),
  add constraint pedidos_desconto_frete_nao_negativo check (desconto_frete >= 0);
comment on column public.pedidos.frete_original is 'Frete da Shopify antes de descontos (frete grátis).';
comment on column public.pedidos.desconto_frete is 'Desconto de frete (frete original - frete cobrado). Fora do desconto das peças.';

-- null = escolhida pela cliente (link); 'equipe' = aprovada pela equipe depois de falar no WhatsApp.
alter table public.troca_pecas
  add column escolhida_por text check (escolhida_por in ('cliente', 'equipe'));

-- Acerto (cobrar a diferença ou registrar o crédito) depois que a troca é concluída.
alter table public.trocas
  add column acerto_status text
    check (acerto_status in ('pendente', 'recebido', 'credito_registrado', 'sem_diferenca')),
  add column acerto_em timestamptz,
  add column acerto_por text;

-- Novo tipo de evento no histórico (todos os atuais preservados).
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado', 'troca_acerto']));

-- ---------------------------------------------------------------------------
-- 2. Backfill dos pedidos da Shopify (a partir do pedido bruto já guardado)
-- Provisório até o próximo Sincronizar, que grava os valores exatos da Shopify.
-- ---------------------------------------------------------------------------
create temporary table _shopify_calc as
select p.id,
       (p.shopify_bruto->'subtotalPriceSet'->'shopMoney'->>'amount')::numeric as sub,
       (p.shopify_bruto->'totalPriceSet'->'shopMoney'->>'amount')::numeric as tot,
       (select sum((n->>'currentQuantity')::int * (n->'originalUnitPriceSet'->'shopMoney'->>'amount')::numeric)
          from jsonb_array_elements(p.shopify_bruto->'lineItems'->'nodes') n) as soma
from public.pedidos p
where p.origem = 'shopify' and p.shopify_bruto is not null;

delete from _shopify_calc where sub is null or tot is null or soma is null or soma <= 0;

-- Preço pago provisório das peças vindas da Shopify (peças de troca ficam sem: usam preço x fator).
update public.pedido_itens i
set preco_pago = round(i.preco * least(1, greatest(0, c.sub / c.soma)), 2)
from _shopify_calc c
where i.pedido_id = c.id and i.origem = 'shopify' and i.preco is not null
  and coalesce(i.observacao, '') not like 'troca de%';

-- Frete: o que a cliente pagou = total - subtotal das peças. Desconto das peças = linhas - subtotal.
update public.pedidos p
set frete_original  = coalesce(p.frete_cobrado, greatest(0, c.tot - c.sub)),
    frete_cobrado   = greatest(0, round(c.tot - c.sub, 2)),
    desconto_frete  = greatest(0, round(coalesce(p.frete_cobrado, greatest(0, c.tot - c.sub))
                                        - greatest(0, c.tot - c.sub), 2)),
    desconto_valor  = case when c.soma - c.sub > 0.004 then round(c.soma - c.sub, 2) end,
    desconto_tipo   = case when c.soma - c.sub > 0.004 then 'valor' end,
    frete_pago_por  = case when greatest(0, c.tot - c.sub) > 0 then 'cliente' else 'arvenne' end
from _shopify_calc c
where p.id = c.id;

drop table _shopify_calc;

-- ---------------------------------------------------------------------------
-- 3. Fator do pedido (desconto sobre as peças) e gatilhos
-- ---------------------------------------------------------------------------
create function public.fator_pedido(p_pedido uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
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
revoke all on function public.fator_pedido(uuid) from public;
grant execute on function public.fator_pedido(uuid) to authenticated;

create or replace function public.tg_trocas_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.fator_desconto := public.fator_pedido(new.pedido_id);
  else
    new.fator_desconto := old.fator_desconto;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.troca_fator(p_item uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select t.fator_desconto from trocas t join troca_pecas p on p.troca_id = t.id
      where p.item_id = p_item and t.status in ('rascunho', 'enviada', 'respondida')
      limit 1),
    (select public.fator_pedido(i.pedido_id) from pedido_itens i where i.id = p_item), 1);
$$;

-- Trocas ativas ganham o fator certo (o gatilho guarda o fator antigo em updates, por isso é desligado).
alter table public.trocas disable trigger trocas_antes;
update public.trocas t
set fator_desconto = public.fator_pedido(t.pedido_id)
where t.status in ('rascunho', 'enviada', 'respondida');
alter table public.trocas enable trigger trocas_antes;

-- Trocas já concluídas: define o acerto pelo sinal da diferença.
update public.trocas t
set acerto_status = case
  when abs(coalesce((select sum(resultado_diferenca) from public.troca_pecas p where p.troca_id = t.id), 0)) < 0.005
    then 'sem_diferenca' else 'pendente' end
where t.status = 'concluida' and t.acerto_status is null;

-- ---------------------------------------------------------------------------
-- 4. Valor pago: preco_pago exato (Shopify) ou preço x fator. As opções usam preço x fator.
-- Mesmas colunas e tipos da versão anterior.
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
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) as valor_opcao,
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item as diferenca,
       case
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item > 0 then 'paga_diferenca'
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item < 0 then 'credito'
         else 'sem_diferenca'
       end as situacao
from pago g
join public.troca_opcoes o on o.troca_peca_id = g.troca_peca_id
union all
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, null::uuid, 'credito'::text, g.qtd,
       g.valor_pago_item, 0::numeric, -g.valor_pago_item, 'credito'::text
from pago g;

create or replace function public.troca_valor_pago(p_item uuid)
returns table (valor_pago numeric, valor_pago_unit numeric, qtd integer)
language sql stable security invoker set search_path = public as $$
  select round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * f.fator), 2),
         round(coalesce(i.preco_pago, coalesce(i.preco, 0) * f.fator), 2),
         i.qtd
  from pedido_itens i
  cross join lateral (select public.troca_fator(p_item) as fator) f
  where i.id = p_item;
$$;

-- ---------------------------------------------------------------------------
-- 5. sugerir_troca: parâmetro p_incluir_pedido e coluna no_pedido
-- ---------------------------------------------------------------------------
drop function public.sugerir_troca(uuid, text, text, numeric, text);
create function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_faixa numeric default 0.2,
  p_busca text default null,
  p_incluir_pedido boolean default false)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text,
               preco_cliente numeric, diferenca numeric, situacao text, no_pedido boolean)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_pago_unit_exato numeric;
  v_qtd integer;
  v_pedido uuid;
  v_fator numeric := 1;
  v_pago_unit numeric;
  v_pago_item numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.preco_pago, i.qtd, i.pedido_id
    into v_variant, v_preco, v_pago_unit_exato, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  v_fator := public.troca_fator(p_item);

  v_pago_unit := round(coalesce(v_pago_unit_exato, v_preco * v_fator), 2);
  v_pago_item := round(v_qtd * coalesce(v_pago_unit_exato, v_preco * v_fator), 2);

  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end,
             x.no_pedido
      from (
        select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido
        from catalogo_site c
        where v_produto_id is not null and c.produto_id = v_produto_id
          and c.variant_id is distinct from v_variant
          and (c.status is null or upper(c.status) = 'ACTIVE')
      ) x
      where p_incluir_pedido or not x.no_pedido
      order by x.variante
      limit 60;
  else
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end,
             x.no_pedido
      from (
        select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido
        from catalogo_site c
        where c.variant_id is distinct from v_variant
          and c.produto_id is distinct from v_produto_id
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (p_faixa is null
               or round(c.preco * v_fator, 2) between v_pago_unit * (1 - p_faixa) and v_pago_unit * (1 + p_faixa))
          and (p_categoria is null or upper(split_part(c.produto, ' ', 1)) = upper(p_categoria))
          and (v_busca is null or c.produto ilike '%' || v_busca || '%' or c.sku ilike '%' || v_busca || '%'
               or c.variante ilike '%' || v_busca || '%')
      ) x
      where p_incluir_pedido or not x.no_pedido
      order by abs(x.preco_cliente - v_pago_unit), x.produto, x.variante
      limit 40;
  end if;
end $$;
revoke all on function public.sugerir_troca(uuid, text, text, numeric, text, boolean) from public;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. Histórico do acerto (security definer: a política de pedido_eventos só aceita 'nota' da tela)
-- ---------------------------------------------------------------------------
create or replace function public.tg_trocas_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_texto text;
  v_saldo numeric;
begin
  if new.status = 'enviada' and new.status is distinct from old.status then
    select count(*) into v_n from troca_pecas where troca_id = new.id;
    select string_agg(concat_ws(' · ', i.sku, i.nome, i.variante), '; ' order by i.ordem) into v_texto
      from troca_pecas p join pedido_itens i on i.id = p.item_id where p.troca_id = new.id;
    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_enviada', old.status, new.status,
            v_n || case when v_n = 1 then ' peça: ' else ' peças: ' end || coalesce(v_texto, ''),
            public.usuario_atual_email());
  end if;
  -- Acerto marcado ou desfeito pela equipe (a primeira definição, ao concluir, já tem o evento da troca).
  if old.acerto_status is not null and new.acerto_status is distinct from old.acerto_status then
    select coalesce(sum(resultado_diferenca), 0) into v_saldo from troca_pecas where troca_id = new.id;
    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_acerto', old.acerto_status, new.acerto_status,
            case new.acerto_status
              when 'recebido' then 'Diferença recebida: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'credito_registrado' then 'Crédito registrado: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'pendente' then 'Acerto voltou para pendente'
              else new.acerto_status end,
            public.usuario_atual_email());
  end if;
  return null;
end $$;
revoke all on function public.tg_trocas_depois() from public;

-- ---------------------------------------------------------------------------
-- 7. Acerto: pendente -> recebido / credito_registrado (e desfazer)
-- ---------------------------------------------------------------------------
create function public.troca_acerto(p_troca uuid, p_status text) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  v_t trocas%rowtype;
  v_saldo numeric;
begin
  if p_status is null or p_status not in ('pendente', 'recebido', 'credito_registrado') then
    raise exception 'Status de acerto inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  if v_t.status <> 'concluida' or v_t.acerto_status is null or v_t.acerto_status = 'sem_diferenca' then
    raise exception 'Esta troca não tem acerto a registrar';
  end if;
  select coalesce(sum(resultado_diferenca), 0) into v_saldo from troca_pecas where troca_id = v_t.id;
  if p_status = 'recebido' and v_saldo <= 0 then
    raise exception 'Não há diferença a receber nesta troca';
  end if;
  if p_status = 'credito_registrado' and v_saldo >= 0 then
    raise exception 'Não há crédito a registrar nesta troca';
  end if;
  update trocas set acerto_status = p_status,
    acerto_em = case when p_status = 'pendente' then null else now() end,
    acerto_por = case when p_status = 'pendente' then null else public.usuario_atual_email() end
  where id = v_t.id;
  return true;
end $$;
revoke all on function public.troca_acerto(uuid, text) from public;
grant execute on function public.troca_acerto(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Aprovar: a equipe registra a escolha (cliente respondeu pelo WhatsApp) e conclui na mesma transação
-- ---------------------------------------------------------------------------
create function public.troca_aprovar(p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
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
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id) then
      raise exception 'Opção não pertence a esta peça';
    end if;
  else
    p_opcao := null;
  end if;
  update troca_pecas set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao,
    escolhida_por = 'equipe', respondida_em = now()
  where id = v_p.id;
  return public.troca_concluir_peca(v_t.id, v_p.id, p_tipo, p_opcao, p_tipo);
end $$;
revoke all on function public.troca_aprovar(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_aprovar(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Concluir peça: aceita troca em rascunho (aprovação da equipe) e define o acerto
-- ---------------------------------------------------------------------------
create or replace function public.troca_concluir_peca(
  p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text)
returns boolean language plpgsql security invoker set search_path = public as $$
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
revoke all on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) from public;
grant execute on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. v_pedidos: mesmas colunas e ordem de antes; novas no fim (frete_original, desconto_frete, acerto_pendente)
-- ---------------------------------------------------------------------------
create or replace view public.v_pedidos
with (security_invoker = true) as
with itens as (
  select
    p.id as pedido_id,
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
    ), '[]'::jsonb)                                                                        as fotos
  from public.pedidos p
  left join public.pedido_itens i on i.pedido_id = p.id and i.status <> 'removido'
  group by p.id
),
calc as (
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
    least(a.subtotal, case p.desconto_tipo
      when 'percentual' then round(a.subtotal * coalesce(p.desconto_valor, 0) / 100, 2)
      when 'valor'      then coalesce(p.desconto_valor, 0)
      else 0 end)::numeric(10,2)                                                          as desconto,
    case when p.frete_pago_por = 'cliente' then coalesce(p.frete_cobrado, 0) else 0 end::numeric(10,2) as frete_na_conta,
    case
      when p.status in ('em_aberto', 'aguardando_pagamento') then 'venda'
      when p.status in ('enviado', 'cancelado', 'perdida')   then 'arquivo'
      else 'expedicao' end                                                                as fase
  from public.pedidos p
  join itens a on a.pedido_id = p.id
)
select
  c.*,
  -- Pedido da Shopify: o que a Shopify cobrou mais a diferença das trocas concluídas. Venda manual: soma das peças.
  case when c.origem = 'shopify' and c.valor_total is not null then
         c.valor_total + coalesce((
           select sum(tp.resultado_diferenca) from public.troca_pecas tp
           join public.trocas t on t.id = tp.troca_id
           where t.pedido_id = c.id and tp.concluida_em is not null), 0)
       else (c.subtotal - c.desconto - pix.v + c.frete_na_conta) end::numeric(10,2)       as total,
  (c.subtotal - c.desconto - pix.v)::numeric(10,2)                                        as valor_pecas_com_desconto,
  (c.frete_cobrado - c.frete_custo)::numeric(10,2)                                        as frete_diferenca,
  (c.origem <> 'shopify' and c.status = 'enviado' and c.rastreio_enviado_em is null)      as pendente_rastreio,
  case when c.fase = 'expedicao' then public.prazo_envio(c.pago_em) end                   as prazo,
  case when c.fase = 'expedicao' and public.prazo_envio(c.pago_em) > now()
       then public.horas_uteis(now(), public.prazo_envio(c.pago_em)) end                  as prazo_horas_uteis,
  -- Colunas novas SEMPRE no fim: create or replace view não deixa mudar a ordem das antigas.
  px.cliente_razao_social,
  px.cliente_ie,
  pix.v                                                                                   as desconto_pix,
  px.frete_original,
  px.desconto_frete,
  exists (select 1 from public.trocas ta
           where ta.pedido_id = c.id and ta.acerto_status = 'pendente')                    as acerto_pendente
from calc c
join public.pedidos px on px.id = c.id
cross join lateral (
  -- Pix: 10% sobre o valor cheio das peças (frete fora), somado ao desconto/cupom existente.
  -- Só vendas do WhatsApp pagas no Pix; nunca passa do que sobra depois do desconto.
  select case when c.origem = 'whatsapp' and c.forma_pagamento = 'Pix'
              then least(round(c.subtotal * 0.10, 2), c.subtotal - c.desconto)
              else 0 end::numeric(10,2) as v
) pix;

grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;

-- ---------------------------------------------------------------------------
-- 11. Importação da Shopify: preco_pago por item e frete original/cobrado separados
-- ---------------------------------------------------------------------------
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id        uuid;
  v_status    text;
  v_cancel    boolean := coalesce((p->>'cancelado')::boolean, false);
  v_desp      boolean := coalesce((p->>'despachado')::boolean, false);
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
begin
  select array_agg(x) into v_codigos from jsonb_array_elements_text(coalesce(p->'desconto_codigos', '[]'::jsonb)) x;
  v_cupom := nullif(array_to_string(v_codigos, ', '), '');
  if v_desc is not null and v_desc <= 0 then v_desc := null; end if;
  v_tipo := case
    when v_titulo = '' then null
    when v_titulo like '%sedex%' then 'SEDEX'
    when v_titulo like '%pac%' then 'PAC'
    when v_titulo like '%retirada%' then 'retirada'
    else 'outro' end;
  v_pagopor := case when v_frete is null then null when v_frete > 0 then 'cliente' else 'arvenne' end;
  v_dfrete := case when v_fo is not null and v_frete is not null then greatest(0, v_fo - v_frete) end;

  select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is not null then
    -- Já importado: completa só o que está nulo (a equipe pode ter editado), guarda a versão mais
    -- nova do pedido bruto e acompanha cancelamento e despacho. Nunca volta etapa.
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
      valor_pago           = coalesce(valor_pago, nullif(p->>'valor_pago', '')::numeric),
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
           or (valor_pago is null and nullif(p->>'valor_pago', '') is not null)
           or (rastreio is null and nullif(p->>'rastreio', '') is not null)
           or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

    -- Quantidade por variante/SKU diferente das peças originais da Shopify (inclui as removidas/trocadas pela equipe, para não dar alarme falso): avisa uma vez.
    -- Dados da Shopify (a equipe não edita): a versão exata sobrescreve o provisório do backfill.
    if v_exato then
      update pedidos set
        frete_cobrado  = coalesce(v_frete, frete_cobrado),
        frete_original = v_fo,
        desconto_frete = v_dfrete,
        frete_pago_por = coalesce(v_pagopor, frete_pago_por),
        desconto_tipo  = case when v_desc is not null then 'valor' end,
        desconto_valor = v_desc
      where id = v_id
        and (frete_cobrado is distinct from coalesce(v_frete, frete_cobrado)
             or frete_original is distinct from v_fo
             or desconto_frete is distinct from v_dfrete
             or frete_pago_por is distinct from coalesce(v_pagopor, frete_pago_por)
             or desconto_valor is distinct from v_desc
             or desconto_tipo is distinct from case when v_desc is not null then 'valor' end);
    end if;
    if p ? 'itens' then
      update pedido_itens i set preco_pago = round((x->>'preco_pago')::numeric, 2)
      from jsonb_array_elements(p->'itens') x
      where i.pedido_id = v_id and i.origem = 'shopify'
        and coalesce(i.observacao, '') not like 'troca de%'
        and i.shopify_variant_id = nullif(x->>'shopify_variant_id', '')::bigint
        and nullif(x->>'preco_pago', '') is not null
        and i.preco_pago is distinct from round((x->>'preco_pago')::numeric, 2);
    end if;

    if p ? 'itens' and not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alterado') then
      select exists (
        select 1 from (
          select coalesce(i->>'shopify_variant_id', 'sku:' || coalesce(i->>'sku', '')) as chave, sum((i->>'qtd')::int) as qtd
          from jsonb_array_elements(p->'itens') i where (i->>'qtd')::int > 0 group by 1
        ) s full join (
          select coalesce(shopify_variant_id::text, 'sku:' || coalesce(sku, '')) as chave, sum(qtd) as qtd
          from pedido_itens where pedido_id = v_id and origem = 'shopify' group by 1
        ) l using (chave)
        where s.qtd is distinct from l.qtd
      ) into v_mudou;
      if v_mudou then
        insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
        values (v_id, 'shopify_alterado', 'As peças do pedido mudaram na Shopify depois da importação.', 'shopify');
      end if;
    end if;

    if p ? 'shopify_bruto' then
      update pedidos set shopify_bruto = p->'shopify_bruto'
      where id = v_id and shopify_bruto is distinct from p->'shopify_bruto';
    end if;

    if v_cancel then
      update pedidos set status = 'cancelado'
      where id = v_id and status not in ('cancelado', 'enviado');
    elsif v_desp and v_status in ('embalagem', 'pronto_envio') then
      update pedidos set status = 'enviado',
             postado_em = coalesce(postado_em, nullif(p->>'postado_em', '')::timestamptz, now())
      where id = v_id and status in ('embalagem', 'pronto_envio');
    end if;
    return false;
  end if;

  -- Pedido novo: cancelado ou que já saiu antes de entrar no app não vira pedido.
  if v_cancel or v_desp then
    return false;
  end if;

  insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                       valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em,
                       cliente_cpf, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                       entrega_bairro, entrega_cidade, entrega_uf,
                       desconto_tipo, desconto_valor, desconto_codigos, cupom,
                       frete_cobrado, frete_tipo, frete_pago_por, frete_original, desconto_frete,
                       forma_pagamento, valor_pago, shopify_bruto, rastreio, rastreio_url)
  values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
          p->>'cliente_email', (p->>'valor_total')::numeric,
          (p->>'shopify_order_id')::bigint, p->>'shopify_url',
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()),
          v_cpf,
          nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), ''),
          nullif(p->>'entrega_logradouro', ''), nullif(p->>'entrega_numero', ''),
          nullif(p->>'entrega_complemento', ''), nullif(p->>'entrega_bairro', ''),
          nullif(p->>'entrega_cidade', ''), nullif(p->>'entrega_uf', ''),
          case when v_desc is not null then 'valor' end, v_desc, v_codigos, v_cupom,
          v_frete, v_tipo, v_pagopor, v_fo, v_dfrete,
          nullif(p->>'forma_pagamento', ''), nullif(p->>'valor_pago', '')::numeric,
          p->'shopify_bruto', nullif(p->>'rastreio', ''), nullif(p->>'rastreio_url', ''))
  returning id into v_id;

  insert into pedido_itens (pedido_id, origem, shopify_variant_id, sku, nome, variante,
                            foto_url, qtd, preco, preco_pago, ordem)
  select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, i->>'sku', i->>'nome',
         i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
         round(nullif(i->>'preco_pago', '')::numeric, 2), ord::int
  from jsonb_array_elements(p->'itens') with ordinality as t(i, ord)
  where (i->>'qtd')::int > 0;

  return true;
end $$;

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 12. v_pedido_acerto: por pedido com peça trocada, o que a cliente pagou, cada troca, o saldo e o status.
-- Várias trocas no mesmo pedido: soma tudo; o status é o da troca pendente (ou a mais recente com diferença).
-- ---------------------------------------------------------------------------
create view public.v_pedido_acerto with (security_invoker = true) as
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
  where tp.concluida_em is not null
),
agg as (
  select pc.pedido_id,
         sum(pc.diferenca)::numeric(10,2) as saldo,
         sum(case when pc.diferenca > 0 then pc.diferenca else 0 end)::numeric(10,2) as total_a_cobrar,
         sum(case when pc.diferenca < 0 then -pc.diferenca else 0 end)::numeric(10,2) as total_credito,
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
  group by pc.pedido_id
)
select a.pedido_id,
       (v.total - a.saldo)::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       a.total_a_cobrar,
       a.total_credito,
       a.saldo,
       v.total::numeric(10,2) as novo_total,
       ac.troca_id,
       ac.acerto_status,
       ac.acerto_em,
       ac.acerto_por,
       a.pecas
from agg a
join public.v_pedidos v on v.id = a.pedido_id
left join lateral (
  select t.id as troca_id, t.acerto_status, t.acerto_em, t.acerto_por
  from public.trocas t
  where t.pedido_id = a.pedido_id and t.acerto_status is not null
  order by (t.acerto_status = 'pendente') desc, (t.acerto_status <> 'sem_diferenca') desc,
           t.concluida_em desc nulls last
  limit 1
) ac on true;

revoke all on public.v_pedido_acerto from anon;
grant select on public.v_pedido_acerto to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. troca_publica (cliente, sem login): acrescenta escolha da equipe, peça nova, resultado e acerto.
-- Nunca CPF, telefone, e-mail, endereço ou custo.
-- ---------------------------------------------------------------------------
create or replace function public.troca_publica(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
        'nova', (select jsonb_build_object('foto_url', o.foto_url, 'nome', o.nome,
                                           'variante', o.variante, 'sku', o.sku)
                   from troca_opcoes o
                  where o.id = p.escolha_opcao_id and p.escolha_tipo = 'opcao'),
        'opcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante, 'sku', o.sku,
            'valor', x.valor_opcao, 'diferenca', x.diferenca, 'situacao', x.situacao)
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
