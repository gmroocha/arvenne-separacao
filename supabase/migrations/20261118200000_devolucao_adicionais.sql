-- V04: retirada de qualquer parte reduz o pacote e só devolve dinheiro realmente disponível.
-- Crédito de troca e devolução ficam reservados separadamente, sem contar duas vezes.

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
  coalesce((retr.r->>'subtotal')::numeric(10,2), a.subtotal) as subtotal,
  coalesce((retr.r->>'qtd_pecas')::int, a.qtd_pecas) as qtd_pecas,
  coalesce((retr.r->>'qtd_linhas')::int, a.qtd_linhas) as qtd_linhas, a.qtd_encontradas, a.qtd_problemas,
  a.qtd_conferidas, a.qtd_etiquetadas, a.qtd_bipadas, coalesce(retr.r->'fotos', a.fotos) as fotos,
  coalesce((retr.r->>'desconto')::numeric(10,2), (case when fx.v is not null then a.subtotal-fx.v-pix.v else d.desconto+cb.v end)::numeric(10,2))                                                     as desconto,
  coalesce((retr.r->>'frete_cobrado')::numeric(10,2), d.frete_na_conta) as frete_na_conta,
  d.fase,
  -- Pedido da Shopify: o que a Shopify cobrou (valor atual) + diferença das trocas - peças que a cliente
  -- tirou depois de pagar. Venda manual: soma das peças.
  coalesce((retr.r->>'total')::numeric(10,2), tot.v)                                                                                  as total,
  coalesce((retr.r->>'valor_pecas_com_desconto')::numeric(10,2), coalesce(fx.v,a.subtotal-d.desconto-cb.v-pix.v)::numeric(10,2))                                as valor_pecas_com_desconto,
  (d.frete_na_conta - p.frete_custo)::numeric(10,2)                                      as frete_diferenca,
  (p.origem <> 'shopify' and p.status = 'enviado' and p.rastreio_enviado_em is null)     as pendente_rastreio,
  pz.prazo                                                                               as prazo,
  ph.horas                                                                               as prazo_horas_uteis,
  -- Colunas novas SEMPRE no fim: create or replace view não deixa mudar a ordem das antigas.
  p.cliente_razao_social,
  p.cliente_ie,
  coalesce((retr.r->>'desconto_pix')::numeric(10,2), pix.v)                                                                                  as desconto_pix,
  p.frete_original,
  p.desconto_frete,
  ap.pendente                                                                         as acerto_pendente,
  dev.v                                                                                  as a_devolver,
  (case when p.origem = 'shopify' then rem.total else 0 end)::numeric(10,2)              as valor_removido,
  cb.v                                                                                   as troca_coberto,
  ad.qtd                                                                                 as qtd_adicionais,
  sm.valor                                                                               as valor_somado,
  sm.pago                                                                                as valor_pago_somado,
  coalesce((retr.r->>'total_geral')::numeric(10,2), (tot.v + sm.valor)::numeric(10,2))                                                      as total_geral,
  sm.partes,
  p.somar_em,
  p.somada_em,
  -- Total pago: pagamento do pedido + pagamentos das vendas somadas (soma no banco, não na tela).
  (case when mf.legado or p.valor_pago is null then null
        else coalesce(p.valor_pago,0)+sm.pago+mf.valor end)::numeric(10,2)                    as total_pago,
  -- Venda somada: número do pedido principal, para a lista e o Arquivo mostrarem "Somada a ARV-1274".
  (select x.numero from public.pedidos x where x.id = p.somar_em)                        as somada_a_numero,
  public.regras_etapas(jsonb_build_object(
    'status',p.status,'linhas',a.qtd_linhas,'pecas',a.qtd_pecas,'encontradas',a.qtd_encontradas,
    'conferidas',a.qtd_conferidas,'etiquetadas',a.qtd_etiquetadas,'bipadas',a.qtd_bipadas,
    'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',ap.pendente)) as etapas_permitidas
from public.pedidos p
cross join lateral (
  select case when p.status='somada' then p.somada_retrato end as r offset 0
) retr
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
    coalesce(sum(coalesce(i.valor_pago_linha,round(i.qtd * coalesce(i.preco_pago, coalesce(i.preco, 0) * fr.f), 2))) filter (where not i.adicional), 0) as pago_vivo
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
  select coalesce(sum(li.valor_liquido),0)::numeric(10,2) as total,
    coalesce(sum(li.valor_liquido) filter(where i.devolvido_em is null),0)::numeric(10,2) as pendente,
    (count(*) filter(where i.devolvido_em is null))::int as n_pendente
  from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
  where i.pedido_id=p.id and not i.adicional and i.status='removido' and i.observacao='cliente desistiu'
    and p.pago_em is not null and i.removido_em>=p.pago_em and i.reembolsado_shopify_em is null
) rem
cross join lateral (
  select coalesce(sum(tp.resultado_diferenca),0) as dif,
    coalesce(sum(tp.resultado_diferenca) filter (where not (coalesce(p.financeiro_retrato->'trocas','[]'::jsonb) ? tp.id::text)),0) as dif_nova
  from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
  join public.pedido_itens i on i.id=tp.item_id
  where t.pedido_id=p.id and tp.concluida_em is not null and t.status<>'cancelada' and not i.adicional
) sh
cross join lateral (
  select coalesce(sum(coberto),0)::numeric(10,2) as v from public.v_cobertura_troca_peca
  where pedido_id=p.id and venda_origem_id is null
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
    coalesce(sum(pv.valor_atual), 0)::numeric(10,2) as valor,
    coalesce(sum(s.valor_pago), 0)::numeric(10,2)   as pago,
    coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'numero', s.numero, 'pago_em', s.pago_em, 'forma_pagamento', s.forma_pagamento,
        'valor_pago', s.valor_pago, 'somada_valor', pv.valor_atual,
        'qtd_pecas', (select coalesce(sum(x.qtd), 0)::int from public.pedido_itens x
                       where x.venda_origem_id = s.id and x.pedido_id = p.id and x.status <> 'removido'))
      order by s.somada_em, s.numero), '[]'::jsonb) as partes
  from public.pedidos s join public.v_parte_somada pv on pv.venda_id=s.id
  where s.somar_em = p.id and s.somada_em is not null
) sm
cross join lateral (
  select case when p.origem='whatsapp' and p.financeiro_retrato is not null then
    (p.financeiro_retrato->>'mercadorias')::numeric + sh.dif_nova
    - (cb.v-(p.financeiro_retrato->>'cobertura')::numeric)
    - (rem.total-(p.financeiro_retrato->>'retirado')::numeric) end as v offset 0
) fx
cross join lateral (
  -- Pix: 10% sobre o valor cheio das peças (frete fora), somado ao desconto/cupom existente.
  -- Só vendas do WhatsApp pagas no Pix; nunca passa do que sobra depois do desconto.
  select case when p.origem = 'whatsapp' and p.forma_pagamento = 'Pix'
              then least(round(a.subtotal * 0.10, 2), a.subtotal - d.desconto,
                case when fx.v is not null then greatest(0,a.subtotal-fx.v) else a.subtotal end)
              else 0 end::numeric(10,2) as v
  offset 0
) pix
cross join lateral (
  select (case when fx.v is not null then fx.v + d.frete_na_conta
               when p.origem = 'shopify' and p.valor_total is not null
               then p.valor_total + sh.dif - rem.total - cb.v
               else a.subtotal - d.desconto - cb.v - pix.v + d.frete_na_conta end)::numeric(10,2) as v
  offset 0
) tot
cross join lateral (
  select coalesce((select sum(valor) from public.movimentos_financeiros where pedido_id=p.id),0) as valor,
    exists(select 1 from public.trocas t where t.pedido_id=p.id and t.status<>'cancelada'
      and not t.acerto_controle_novo and t.acerto_status in ('recebido','credito_registrado')) as legado
  offset 0
) mf
cross join lateral (
  select coalesce(sum(li.valor_liquido),0) as pendente,count(*)::int as n_pendente
  from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
  join public.pedidos origem on origem.id=i.venda_origem_id
  where i.pedido_id=p.id and i.adicional and i.status='removido' and i.observacao='cliente desistiu'
    and origem.pago_em is not null and i.removido_em>=origem.pago_em
    and i.devolvido_em is null and i.reembolsado_shopify_em is null
) ra
cross join lateral (
  select case when p.valor_pago is not null and not mf.legado then p.valor_pago+sm.pago+mf.valor end as disponivel
  offset 0
) caixa
cross join lateral (
  -- Só reserva a retirada efetiva: outros créditos continuam no acerto final, sem dupla devolução.
  select (case when p.status in ('perdida','somada') or caixa.disponivel is null
                    or caixa.disponivel<0 or tot.v+sm.valor<0 then 0
    when rem.n_pendente+ra.n_pendente>0 then
      least(rem.pendente+ra.pendente,caixa.disponivel,greatest(0,caixa.disponivel-tot.v-sm.valor))
    else 0 end)::numeric(10,2) as v
  offset 0
) dev
cross join lateral (
  select (exists (select 1 from public.trocas ta where ta.pedido_id=p.id
                  and ta.status<>'cancelada' and ta.acerto_status='pendente') or dev.v>0) as pendente offset 0
) ap
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

create function public.tg_saldo_itens_alterado() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  for v_id in select distinct n.pedido_id from novos n join antigos a using(id)
    where (n.pedido_id,n.status,n.observacao,n.devolvido_em,n.reembolsado_shopify_em,n.valor_pago_linha)
      is distinct from (a.pedido_id,a.status,a.observacao,a.devolvido_em,a.reembolsado_shopify_em,a.valor_pago_linha)
    order by n.pedido_id loop
    perform public.reconciliar_acertos(v_id,(select acerto_troca_id from public.pedidos where id=v_id));
  end loop;
  return null;
end $$;
revoke all on function public.tg_saldo_itens_alterado() from public,anon,authenticated,service_role;
create trigger saldo_itens_alterado after update on public.pedido_itens
  referencing old table as antigos new table as novos for each statement execute function public.tg_saldo_itens_alterado();

create function public.tg_saldo_pagamento_alterado() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (new.valor_pago,new.valor_total,new.frete_cobrado) is distinct from (old.valor_pago,old.valor_total,old.frete_cobrado) then
    perform public.reconciliar_acertos(new.id,new.acerto_troca_id);
  end if;
  return null;
end $$;
revoke all on function public.tg_saldo_pagamento_alterado() from public,anon,authenticated,service_role;
create trigger saldo_pagamento_alterado after update of valor_pago,valor_total,frete_cobrado on public.pedidos
  for each row execute function public.tg_saldo_pagamento_alterado();


create or replace function public.registrar_movimento_troca(p_troca uuid,p_anterior text,p_novo text) returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.trocas%rowtype; m public.movimentos_financeiros%rowtype; v_saldo numeric;
begin
  if p_anterior is not distinct from p_novo then return null; end if;
  select * into t from public.trocas where id=p_troca;
  perform 1 from public.pedidos where id=t.pedido_id for update;
  if p_anterior in ('recebido','credito_registrado') then
    select * into m from public.movimentos_financeiros x
      where x.troca_id=t.id and x.tipo in ('troca_recebida','troca_credito')
        and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=x.id)
      order by x.id desc limit 1;
    if not found then
      raise exception 'Este acerto é anterior ao controle de movimentos. Confira os valores antes de desfazer.';
    end if;
    insert into public.movimentos_financeiros(pedido_id,troca_id,tipo,valor,estorna_id,usuario_email)
      values(t.pedido_id,t.id,'estorno',-m.valor,m.id,public.usuario_atual_email());
    if exists(select 1 from public.v_pedidos where id=t.pedido_id and (total_pago<0 or total_pago is null)) then
      raise exception 'Este valor já foi devolvido ou convertido em crédito. Confira os movimentos antes de desfazer o recebimento.';
    end if;
  end if;
  if p_novo in ('recebido','credito_registrado') then
    if t.status<>'concluida' then raise exception 'Conclua a troca antes de registrar o acerto'; end if;
    select public.saldo_financeiro(t.pedido_id) into v_saldo;
    if v_saldo is null then raise exception 'Confira o pagamento original e os acertos antigos antes de registrar o saldo'; end if;
    if p_novo='recebido' and v_saldo<=0 then raise exception 'Não há diferença a receber neste pedido'; end if;
    if p_novo='credito_registrado' and v_saldo>=0 then raise exception 'Não há crédito a registrar neste pedido'; end if;
    insert into public.movimentos_financeiros(pedido_id,troca_id,tipo,valor,usuario_email)
      values(t.pedido_id,t.id,case when p_novo='recebido' then 'troca_recebida' else 'troca_credito' end,
        v_saldo,public.usuario_atual_email());
  end if;
  return v_saldo;
end $$;
revoke all on function public.registrar_movimento_troca(uuid,text,text) from public,anon,authenticated,service_role;
