-- Cobertura da loja: "a loja cobre até R$ X da diferença" de uma troca (a troca inteira, soma das peças).
-- Só abate diferença positiva (o que a cliente pagaria a mais); nunca aumenta crédito.
-- Peça a peça continua valendo a diferença cheia (troca_concluir_peca grava o resultado cheio);
-- a cobertura é aplicada por troca na v_resumo/v_pedidos/v_pedido_acerto.

-- ---------------------------------------------------------------------------
-- 1. Coluna e trava
-- ---------------------------------------------------------------------------
alter table public.trocas add column cobrir_ate numeric(10,2) not null default 0 check (cobrir_ate >= 0);

create or replace function public.tg_trocas_cobertura() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.cobrir_ate is distinct from old.cobrir_ate and old.status in ('concluida', 'cancelada') then
    raise exception 'A cobertura da loja não pode mudar numa troca %', case old.status when 'concluida' then 'concluída' else 'cancelada' end;
  end if;
  return new;
end $$;
revoke all on function public.tg_trocas_cobertura() from public, anon;

create trigger trocas_cobertura before update on public.trocas
for each row execute function public.tg_trocas_cobertura();

-- ---------------------------------------------------------------------------
-- 2. v_troca_resumo: diferenca_total passa a ser LÍQUIDA; novas colunas no fim
-- ---------------------------------------------------------------------------
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
  left join public.v_troca_valores x on x.troca_peca_id = p.id and x.opcao_id = p.escolha_opcao_id
  group by t.id, t.pedido_id, t.cobrir_ate
) r
cross join lateral (
  select case when r.bruta > 0 then least(r.bruta, r.cobrir_ate) else 0 end as v
) cv;

revoke all on public.v_troca_resumo from anon;
grant select on public.v_troca_resumo to authenticated, service_role;

-- 4. v_pedidos: cobertura entra no desconto e abate o total (nova coluna troca_coberto no fim)
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
  cb.v                                                                                   as troca_coberto
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
  select (case when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total - cb.v
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

-- ---------------------------------------------------------------------------
-- 5b. fator_pedido ignora a cobertura (ela não é desconto de preço das peças)
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
        then greatest(0, 1 - (coalesce(v.desconto, 0) - coalesce(v.troca_coberto, 0) + coalesce(v.desconto_pix, 0)) / v.subtotal)
        else 1 end
       from v_pedidos v where v.id = p_pedido),
    1);
$$;

-- 5. v_pedido_acerto: saldo e total_a_cobrar líquidos; coluna coberto no fim
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
                       'variante', pc.variante_depois, 'foto_url', pc.foto_depois) end)
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

-- 6. troca_concluir_peca (mesma de antes, só o alvo do desconto em R$ ignora a cobertura já aplicada)
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
  -- A cobertura já aplicada (troca_coberto) volta à conta: o desconto em R$ guarda só o valor SEM cobertura
  -- e a view abate a cobertura nova por cima, então total final = total original + diferença líquida.
  select valor_pecas_com_desconto + troca_coberto + v_valor.diferenca into v_alvo from v_pedidos where id = v_t.pedido_id;

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

-- 7. troca_publica: resumo com diferenca líquida e as chaves novas
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
