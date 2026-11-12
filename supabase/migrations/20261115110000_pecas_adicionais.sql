-- Peças adicionais e mudar quantidade (11/11/2026).
-- 1) pedido_itens.adicional: peça que entrou depois do pagamento (separada e cobrada à parte).
-- 2) pedidos.adicionais_recebido_em: quando a cobrança das adicionais foi recebida.
-- 3) adicionar_itens marca adicional; mudar_qtd aumenta/diminui a quantidade de uma peça.
-- 4) v_pedidos ganha qtd_adicionais, valor_adicionais, adicionais_recebido_em, adicionais_a_cobrar
--    (colunas novas no fim). Nenhum pedido ou peça é apagado.
-- Este projeto não dá GRANT automático: tudo que é novo leva GRANT explícito.

alter table public.pedido_itens add column adicional boolean not null default false;
alter table public.pedidos add column adicionais_recebido_em timestamptz;

-- ---------------------------------------------------------------------------
-- adicionar_itens: pedido já pago => a linha nasce adicional. Com p_somar, só soma numa linha de mesma
-- natureza (adicional com adicional), nunca na linha já paga.
-- ---------------------------------------------------------------------------
create or replace function public.adicionar_itens(p_pedido uuid, p_itens jsonb, p_somar boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
declare
  r      record;
  v_id   uuid;
  v_ordem int;
  v_adic boolean;
begin
  select (pago_em is not null) into v_adic from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = p_pedido;
  for r in
    select * from jsonb_to_recordset(p_itens) as x(
      origem text, shopify_variant_id bigint, peca_clube_id uuid, sku text, nome text,
      variante text, foto_url text, qtd int, preco numeric)
  loop
    v_id := null;
    if p_somar then
      select id into v_id from pedido_itens
       where pedido_id = p_pedido and status <> 'removido' and adicional = v_adic
         and ((r.shopify_variant_id is not null and shopify_variant_id = r.shopify_variant_id)
           or (r.shopify_variant_id is null and r.peca_clube_id is not null and peca_clube_id = r.peca_clube_id))
       order by ordem limit 1;
    end if;
    if v_id is not null then
      update pedido_itens set qtd = qtd + r.qtd where id = v_id;
    else
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
                                foto_url, qtd, preco, ordem, adicional)
      values (p_pedido, r.origem, r.shopify_variant_id, r.peca_clube_id, r.sku, r.nome, r.variante,
              r.foto_url, r.qtd, r.preco, v_ordem, v_adic);
    end if;
  end loop;
end $$;
revoke all on function public.adicionar_itens(uuid, jsonb, boolean) from public, anon;
grant execute on function public.adicionar_itens(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- mudar_qtd: muda a quantidade de uma peça.
-- Aumentar: as unidades a mais sempre precisam ser separadas. Linha pendente do mesmo tipo (sem
-- pagamento, ou já adicional) soma nela; senão a diferença vira uma linha PENDENTE à parte (adicional
-- se o pedido já foi pago), e a linha original (achada, conferida...) fica como está. O gatilho de
-- eventos registra a mudança de qtd.
-- Diminuir: a linha diminui e a diferença vira linha 'removido' (observação 'quantidade reduzida'),
-- mantendo shopify_line_id para a checagem da Shopify continuar batendo.
-- ---------------------------------------------------------------------------
create or replace function public.mudar_qtd(p_item uuid, p_qtd int)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_i pedido_itens%rowtype;
  v_ped text;
  v_pago timestamptz;
  v_dif int;
  v_adic boolean;
  v_alvo uuid;
begin
  if p_qtd is null or p_qtd < 1 then
    raise exception 'A quantidade precisa ser pelo menos 1';
  end if;
  select * into v_i from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_i.status = 'removido' then raise exception 'Esta peça foi removida do pedido'; end if;
  select status, pago_em into v_ped, v_pago from pedidos where id = v_i.pedido_id;
  if v_ped in ('cancelado', 'enviado') then
    raise exception 'Este pedido está % e não aceita mais alteração', v_ped;
  end if;
  if p_qtd = v_i.qtd then return; end if;

  if p_qtd > v_i.qtd then
    v_dif := p_qtd - v_i.qtd;
    -- Linha ainda pendente e do mesmo tipo (pedido sem pagamento, ou ela já é adicional): soma nela.
    if v_i.status = 'pendente' and (v_pago is null or v_i.adicional) then
      update pedido_itens set qtd = p_qtd where id = p_item;
      return;
    end if;
    -- Senão as unidades a mais ainda precisam ser separadas: linha PENDENTE à parte (soma numa que já
    -- exista), adicional quando o pedido já foi pago. A linha original (achada, conferida...) não muda.
    v_adic := v_pago is not null or v_i.adicional;
    select id into v_alvo from pedido_itens
     where pedido_id = v_i.pedido_id and status = 'pendente' and adicional = v_adic and id <> p_item
       and shopify_variant_id is not distinct from v_i.shopify_variant_id
       and peca_clube_id is not distinct from v_i.peca_clube_id
       and sku is not distinct from v_i.sku
     order by ordem limit 1 for update;
    if v_alvo is not null then
      update pedido_itens set qtd = qtd + v_dif where id = v_alvo;
    else
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
        foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional)
      values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
        v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, null,
        (select coalesce(max(ordem), 0) + 1 from pedido_itens where pedido_id = v_i.pedido_id),
        null, 'pendente', v_dif, v_adic);
    end if;
    return;
  end if;

  -- Diminuir
  v_dif := v_i.qtd - p_qtd;
  update pedido_itens set qtd = p_qtd, qtd_bipada = least(v_i.qtd_bipada, p_qtd) where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem,
    'quantidade reduzida', 'removido', v_dif, v_i.adicional);
end $$;
revoke all on function public.mudar_qtd(uuid, int) from public, anon;
grant execute on function public.mudar_qtd(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- v_pedidos: mesmas colunas e ordem; novas no fim.
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
  ad.valor                                                                               as valor_adicionais,
  p.adicionais_recebido_em,
  (case when p.adicionais_recebido_em is null then ad.valor else 0 end)::numeric(10,2)   as adicionais_a_cobrar
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
  -- Peças adicionais (entraram depois do pagamento): quantidade e valor a cobrar, sem as removidas.
  select
    coalesce(sum(i.qtd), 0)::int as qtd,
    coalesce(sum(round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0)), 2)), 0)::numeric(10,2) as valor
  from public.pedido_itens i
  where i.pedido_id = p.id and i.adicional and i.status <> 'removido'
) ad
cross join lateral (
  select (case when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total - cb.v + ad.valor
               else a.subtotal - d.desconto - cb.v - pix.v + d.frete_na_conta end)::numeric(10,2) as v
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
