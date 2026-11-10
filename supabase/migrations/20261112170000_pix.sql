-- Desconto Pix: 10% sobre o valor cheio das peças (subtotal) nas vendas do WhatsApp pagas no Pix.
-- Soma-se ao desconto/cupom que já existir; o frete não entra. Pedidos da Shopify não mudam.
-- A v_pedidos ganha a coluna desconto_pix no FIM (create or replace não deixa mudar a ordem das antigas).

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
  -- Pedido da Shopify: o total é o que a Shopify cobrou. Venda manual: soma das peças.
  case when c.origem = 'shopify' and c.valor_total is not null then c.valor_total
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
  pix.v                                                                                   as desconto_pix
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

-- A troca usa o mesmo fator de desconto do pedido: agora ele inclui o desconto Pix.
-- Mesmas colunas e tipos da definição anterior.
create or replace view public.v_troca_valores with (security_invoker = true) as
with base as (
  select p.id as troca_peca_id, t.id as troca_id, t.pedido_id, p.item_id, i.qtd,
         case when coalesce(v.subtotal, 0) > 0 then 1 - (coalesce(v.desconto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal else 1 end as fator,
         coalesce(i.preco, 0) as preco_item
  from public.troca_pecas p
  join public.trocas t on t.id = p.troca_id
  join public.pedido_itens i on i.id = p.item_id
  join public.v_pedidos v on v.id = t.pedido_id
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

-- Romaneio público: devolve também o desconto Pix (continua security definer, sem dados pessoais).
create or replace function public.romaneio_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
