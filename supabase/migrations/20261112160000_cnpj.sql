-- CNPJ: razão social e inscrição estadual no pedido e no cadastro de clientes.
-- A v_pedidos é substituída (create or replace) com as colunas novas no fim, para não quebrar
-- quem depende dela (v_troca_valores e as funções da troca).

alter table public.pedidos  add column cliente_razao_social text, add column cliente_ie text;
alter table public.clientes add column razao_social text,         add column ie text;

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
       else (c.subtotal - c.desconto + c.frete_na_conta) end::numeric(10,2)               as total,
  (c.subtotal - c.desconto)::numeric(10,2)                                                as valor_pecas_com_desconto,
  (c.frete_cobrado - c.frete_custo)::numeric(10,2)                                        as frete_diferenca,
  (c.origem <> 'shopify' and c.status = 'enviado' and c.rastreio_enviado_em is null)      as pendente_rastreio,
  case when c.fase = 'expedicao' then public.prazo_envio(c.pago_em) end                   as prazo,
  case when c.fase = 'expedicao' and public.prazo_envio(c.pago_em) > now()
       then public.horas_uteis(now(), public.prazo_envio(c.pago_em)) end                  as prazo_horas_uteis,
  -- Colunas novas SEMPRE no fim: create or replace view não deixa mudar a ordem das antigas.
  px.cliente_razao_social,
  px.cliente_ie
from calc c
join public.pedidos px on px.id = c.id;

grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;
