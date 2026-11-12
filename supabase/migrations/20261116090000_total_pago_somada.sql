-- Venda somada, dois ajustes pedidos pelo Gustavo (12/11/2026), só na v_pedidos (colunas novas no fim):
--   total_pago       pagamento do pedido + pagamentos das vendas somadas (a tela não soma dinheiro);
--   somada_a_numero  número do pedido principal de uma venda (lista e Arquivo: "Somada a ARV-1274").
-- A view é recriada a partir da 20261115110000_venda_somada.sql, sem mudar nada além disso.

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
  (d.desconto + cb.v)::numeric(10,2)                                                     as desconto,
  d.frete_na_conta,
  d.fase,
  -- Pedido da Shopify: o que a Shopify cobrou (valor atual) + diferença das trocas - peças que a cliente
  -- tirou depois de pagar. Venda manual: soma das peças.
  tot.v                                                                                  as total,
  (a.subtotal - d.desconto - cb.v - pix.v)::numeric(10,2)                                as valor_pecas_com_desconto,
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
  (case when p.origem = 'shopify' then rem.total else 0 end)::numeric(10,2)              as valor_removido,
  cb.v                                                                                   as troca_coberto,
  ad.qtd                                                                                 as qtd_adicionais,
  sm.valor                                                                               as valor_somado,
  sm.pago                                                                                as valor_pago_somado,
  (tot.v + sm.valor)::numeric(10,2)                                                      as total_geral,
  sm.partes,
  p.somar_em,
  p.somada_em,
  -- Total pago: pagamento do pedido + pagamentos das vendas somadas (soma no banco, não na tela).
  (case when p.valor_pago is null and sm.pago = 0 then null
        else coalesce(p.valor_pago, 0) + sm.pago end)::numeric(10,2)                    as total_pago,
  -- Venda somada: número do pedido principal, para a lista e o Arquivo mostrarem "Somada a ARV-1274".
  (select x.numero from public.pedidos x where x.id = p.somar_em)                        as somada_a_numero
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
    coalesce(sum(i.qtd * coalesce(i.preco, 0)) filter (where not i.adicional), 0)::numeric(10,2) as subtotal,
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
    (count(i.preco_pago) filter (where not i.adicional))::int                              as n_pago,
    coalesce(sum(round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2)) filter (where not i.adicional), 0) as pago_vivo
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
      when p.status in ('enviado', 'cancelado', 'perdida', 'somada') then 'arquivo'
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
  where i.pedido_id = p.id and i.status = 'removido' and i.observacao = 'cliente desistiu' and not i.adicional
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
  -- Cobertura da loja: por troca (não cancelada), até cobrir_ate da diferença POSITIVA das peças concluídas.
  -- Nunca aumenta crédito. Entra no desconto e abate o total; o Pix continua calculado do desconto base.
  select coalesce(sum(case when s.dif > 0 then least(s.dif, s.cobrir_ate) else 0 end), 0)::numeric(10,2) as v
  from (select t.cobrir_ate, sum(tp.resultado_diferenca) as dif
          from public.trocas t
          join public.troca_pecas tp on tp.troca_id = t.id and tp.concluida_em is not null
         where t.pedido_id = p.id and t.status <> 'cancelada'
         group by t.id, t.cobrir_ate) s
  offset 0
) cb
cross join lateral (
  -- Peças adicionais (vieram de uma venda somada): só a quantidade; o dinheiro delas fica nas partes.
  select coalesce(sum(i.qtd), 0)::int as qtd
  from public.pedido_itens i
  where i.pedido_id = p.id and i.adicional and i.status <> 'removido'
) ad
cross join lateral (
  -- Vendas somadas a este pedido (uma linha por venda, em ordem de pagamento).
  select
    coalesce(sum(s.somada_valor), 0)::numeric(10,2) as valor,
    coalesce(sum(s.valor_pago), 0)::numeric(10,2)   as pago,
    coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'numero', s.numero, 'pago_em', s.pago_em, 'forma_pagamento', s.forma_pagamento,
        'valor_pago', s.valor_pago, 'somada_valor', s.somada_valor,
        'qtd_pecas', (select coalesce(sum(x.qtd), 0)::int from public.pedido_itens x
                       where x.venda_origem_id = s.id and x.pedido_id = p.id and x.status <> 'removido'))
      order by s.somada_em, s.numero), '[]'::jsonb) as partes
  from public.pedidos s
  where s.somar_em = p.id and s.somada_em is not null
) sm
cross join lateral (
  select (case when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total - cb.v
               else a.subtotal - d.desconto - cb.v - pix.v + d.frete_na_conta end)::numeric(10,2) as v
  offset 0
) tot
cross join lateral (
  -- A devolver: Shopify = peças removidas ainda não devolvidas; WhatsApp = o que foi pago a mais que o total.
  select (case
            when p.status in ('cancelado', 'perdida', 'somada') then 0
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
