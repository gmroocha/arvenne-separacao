-- Mantém o desconto apresentado à cliente quando as peças do pedido são substituídas.
-- Sem isso, um desconto fixo é redistribuído depois de cada peça concluída.
alter table public.trocas add column fator_desconto numeric;

update public.trocas t
set fator_desconto = case when v.subtotal > 0
  then greatest(0, 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
  else 1 end
from public.v_pedidos v where v.id = t.pedido_id;

alter table public.trocas alter column fator_desconto set not null;
alter table public.trocas add constraint trocas_fator_desconto_check
  check (fator_desconto between 0 and 1);

create or replace function public.tg_trocas_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select case when v.subtotal > 0
      then greatest(0, 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
      else 1 end into new.fator_desconto
    from v_pedidos v where v.id = new.pedido_id;
  else
    new.fator_desconto := old.fator_desconto;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger trocas_antes on public.trocas;
create trigger trocas_antes before insert or update on public.trocas
for each row execute function public.tg_trocas_antes();

-- Usado também pelas sugestões e pelo cabeçalho, inclusive após uma conclusão parcial.
create function public.troca_fator(p_item uuid) returns numeric
language sql stable security invoker set search_path = public as $$
  select coalesce(
    (select t.fator_desconto from trocas t join troca_pecas p on p.troca_id = t.id
      where p.item_id = p_item and t.status in ('rascunho', 'enviada', 'respondida')
      limit 1),
    (select case when v.subtotal > 0
       then greatest(0, 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
       else 1 end
     from pedido_itens i join v_pedidos v on v.id = i.pedido_id where i.id = p_item), 1);
$$;
revoke all on function public.troca_fator(uuid) from public;
grant execute on function public.troca_fator(uuid) to authenticated;

-- Ao tirar uma opção escolhida, a peça volta a aguardar resposta. O FK sozinho
-- limpava só o id, deixando a tela anunciar uma escolha que já não existia.
create function public.tg_troca_pecas_validar() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.concluida_em is not null and (
    new.escolha_tipo is distinct from old.escolha_tipo or
    new.escolha_opcao_id is distinct from old.escolha_opcao_id) then
    raise exception 'Não é possível alterar a escolha de uma troca já concluída';
  end if;
  if new.escolha_tipo = 'opcao' and new.escolha_opcao_id is null then
    new.escolha_tipo := null;
    new.respondida_em := null;
    update trocas set status = 'enviada', respondida_em = null
      where id = new.troca_id and status = 'respondida';
  end if;
  return new;
end $$;
create trigger troca_pecas_validar before update on public.troca_pecas
for each row execute function public.tg_troca_pecas_validar();
revoke all on function public.tg_troca_pecas_validar() from public;

-- A conclusão inteira ocorre numa transação. Bloqueia a troca antes da peça, na mesma
-- ordem de troca_escolher, e confere a escolha que a equipe viu antes de confirmar.
create function public.troca_concluir_peca(
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
  if v_t.status not in ('enviada', 'respondida') then
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
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and concluida_em is null) then
    update trocas set status = 'concluida', concluida_em = now() where id = v_t.id;
  end if;
  if not exists (select 1 from pedido_itens where pedido_id = v_t.pedido_id and status in ('falta', 'defeito')) then
    update pedidos set status = 'separacao'
      where id = v_t.pedido_id and status in ('avisar_cliente', 'aguardando_cliente');
  end if;
  return true;
end $$;
revoke all on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) from public;
grant execute on function public.troca_concluir_peca(uuid, uuid, text, uuid, text) to authenticated;

-- Valores e sugestões usam o mesmo desconto preservado.
create or replace view public.v_troca_valores with (security_invoker = true) as
with base as (
  select p.id as troca_peca_id, t.id as troca_id, t.pedido_id, p.item_id, i.qtd,
         t.fator_desconto as fator,
         coalesce(i.preco, 0) as preco_item
  from public.troca_pecas p
  join public.trocas t on t.id = p.troca_id
  join public.pedido_itens i on i.id = p.item_id
),
pago as (
  select b.*, round(b.qtd * b.preco_item * b.fator, 2) as valor_pago_item from base b
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


create or replace function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_faixa numeric default 0.2,
  p_busca text default null)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text,
               preco_cliente numeric, diferenca numeric, situacao text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_qtd integer;
  v_pedido uuid;
  v_fator numeric := 1;
  v_pago_unit numeric;
  v_pago_item numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.qtd, i.pedido_id
    into v_variant, v_preco, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  v_fator := public.troca_fator(p_item);

  v_pago_unit := round(v_preco * v_fator, 2);
  v_pago_item := round(v_qtd * v_preco * v_fator, 2);

  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end
      from (
        select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca
        from catalogo_site c
        where v_produto_id is not null and c.produto_id = v_produto_id
          and c.variant_id is distinct from v_variant
          and (c.status is null or upper(c.status) = 'ACTIVE')
      ) x
      order by x.variante
      limit 60;
  else
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end
      from (
        select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_fator, 2) as preco_cliente,
               round(v_qtd * c.preco * v_fator, 2) - v_pago_item as diferenca
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
      order by abs(x.preco_cliente - v_pago_unit), x.produto, x.variante
      limit 40;
  end if;
end $$;

revoke all on function public.sugerir_troca(uuid, text, text, numeric, text) from public;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text) to authenticated;

-- Quanto a cliente pagou pela peça (total da linha e por unidade), para o cabeçalho da troca.
create or replace function public.troca_valor_pago(p_item uuid)
returns table (valor_pago numeric, valor_pago_unit numeric, qtd integer)
language sql stable security invoker set search_path = public as $$
  select round(i.qtd * coalesce(i.preco, 0) * f.fator, 2),
         round(coalesce(i.preco, 0) * f.fator, 2),
         i.qtd
  from pedido_itens i
  cross join lateral (select public.troca_fator(p_item) as fator) f
  where i.id = p_item;
$$;

revoke all on function public.troca_valor_pago(uuid) from public;
grant execute on function public.troca_valor_pago(uuid) to authenticated;
