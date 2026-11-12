-- V08: recebimentos, créditos e estornos são fatos identificáveis; nunca reescreve um movimento.
-- O acerto apresenta o saldo final do pedido, compensando alterações ainda não pagas.
alter table public.trocas add column acerto_controle_novo boolean not null default false;
alter table public.trocas alter column acerto_controle_novo set default true;
alter table public.pedidos add column acerto_troca_id uuid references public.trocas(id);
create table public.movimentos_financeiros (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.pedidos(id),
  troca_id uuid references public.trocas(id),
  tipo text not null check(tipo in ('troca_recebida','troca_credito','devolucao','estorno')),
  valor numeric(12,2) not null check(valor<>0),
  estorna_id bigint unique references public.movimentos_financeiros(id),
  detalhes jsonb not null default '{}'::jsonb check(jsonb_typeof(detalhes)='object'),
  registrado_em timestamptz not null default clock_timestamp(),
  usuario_email text,
  check ((tipo='estorno')=(estorna_id is not null)),
  check (tipo<>'troca_recebida' or valor>0),
  check (tipo not in ('troca_credito','devolucao') or valor<0),
  unique(id,pedido_id),
  foreign key(estorna_id,pedido_id) references public.movimentos_financeiros(id,pedido_id)
);
create index movimentos_financeiros_pedido on public.movimentos_financeiros(pedido_id,id);
create index movimentos_financeiros_troca on public.movimentos_financeiros(troca_id) where troca_id is not null;
alter table public.movimentos_financeiros enable row level security;
create policy equipe_le on public.movimentos_financeiros for select to authenticated using(true);
revoke all on public.movimentos_financeiros from public,anon,authenticated,service_role;
grant select on public.movimentos_financeiros to authenticated,service_role;
create function public.tg_movimento_imutavel() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Movimentos financeiros não podem ser alterados ou apagados; registre um estorno'; end $$;
revoke all on function public.tg_movimento_imutavel() from public,anon,authenticated,service_role;
create trigger movimento_imutavel before update or delete on public.movimentos_financeiros
  for each row execute function public.tg_movimento_imutavel();

create function public.saldo_financeiro(p_pedido uuid) returns numeric
language sql stable security invoker set search_path=public,pg_temp as $$
  select case when total_pago is not null and total_pago>=0 and total_geral>=0 then (total_geral-total_pago+a_devolver)::numeric(12,2) end
  from public.v_pedidos where id=p_pedido;
$$;
revoke all on function public.saldo_financeiro(uuid) from public,anon;
grant execute on function public.saldo_financeiro(uuid) to authenticated,service_role;

create function public.reconciliar_acertos(p_pedido uuid,p_priorizar uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_saldo numeric; v_alvo uuid;
begin
  perform 1 from public.pedidos where id=p_pedido for update;
  select public.saldo_financeiro(p_pedido) into v_saldo;
  if v_saldo is null then return; end if;
  select id into v_alvo from public.trocas where pedido_id=p_pedido and status='concluida'
    order by (id=p_priorizar) desc nulls last,(acerto_status='pendente') desc,
      concluida_em desc nulls last,created_at desc,id limit 1;
  if v_alvo is null then return; end if;
  update public.pedidos set acerto_troca_id=v_alvo where id=p_pedido and acerto_troca_id is distinct from v_alvo;
  -- Os anteriores permanecem no histórico; o último acerto incorpora o saldo ainda aberto.
  update public.trocas set acerto_status='sem_diferenca'
    where pedido_id=p_pedido and status='concluida' and acerto_status='pendente'
      and (id<>v_alvo or abs(v_saldo)<0.005);
end $$;
revoke all on function public.reconciliar_acertos(uuid,uuid) from public,anon,authenticated,service_role;

create function public.registrar_movimento_troca(p_troca uuid,p_anterior text,p_novo text) returns numeric
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
  (case when mf.legado or (p.valor_pago is null and sm.pago=0) then null
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
  -- A devolver: Shopify = peças removidas ainda não devolvidas; WhatsApp = o que foi pago a mais que o total.
  select (case
            when p.status in ('cancelado', 'perdida', 'somada') then 0
            when p.origem = 'shopify' then rem.pendente
            when rem.n_pendente > 0 and p.valor_pago is not null then greatest(0, p.valor_pago+sm.pago+mf.valor-tot.v-sm.valor)
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
  from public.trocas t join public.pedidos p on p.id=t.pedido_id
  where t.status <> 'cancelada'
    and exists (select 1 from public.troca_pecas tp where tp.troca_id = t.id and tp.concluida_em is not null)
  order by t.pedido_id,coalesce(t.id=p.acerto_troca_id,false) desc, (t.acerto_status = 'pendente') desc nulls last,
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
       (coalesce(v.valor_pago,0)+coalesce(v.valor_pago_somado,0))::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       greatest(sf.v,0)::numeric(10,2) as total_a_cobrar,
       greatest(-sf.v,0)::numeric(10,2) as total_credito,
       sf.v::numeric(10,2) as saldo,
       v.total_geral::numeric(10,2) as novo_total,
       al.troca_id,
       al.acerto_status,
       al.acerto_em,
       al.acerto_por,
       a.pecas,
       cv.v as coberto,
       v.total_pago as total_pago_atual,
       case when v.total_pago is null or v.total_pago<0 or v.total_geral<0 then 'Confira o pagamento original e os acertos antigos antes de registrar o saldo.' end::text as bloqueio
from agg a
join alvo al on al.pedido_id = a.pedido_id
join public.v_pedidos v on v.id = a.pedido_id
join public.trocas tt on tt.id = al.troca_id
cross join lateral (
  select (case when a.saldo_bruto > 0 then least(a.saldo_bruto, tt.cobrir_ate) else 0 end)::numeric(10,2) as v
) cv
cross join lateral (
  select case when al.acerto_status='sem_diferenca' then 0
    when al.acerto_status in ('recebido','credito_registrado') then coalesce((
      select m.valor from public.movimentos_financeiros m where m.troca_id=al.troca_id
        and m.tipo in ('troca_recebida','troca_credito')
        and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id)
      order by m.id desc limit 1),a.saldo_bruto-cv.v)
    else coalesce(public.saldo_financeiro(v.id),0) end as v
) sf;

revoke all on public.v_pedido_acerto from anon;
grant select on public.v_pedido_acerto to authenticated, service_role;


CREATE OR REPLACE FUNCTION public.tg_trocas_depois()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if new.acerto_status is distinct from old.acerto_status then
    v_saldo := public.registrar_movimento_troca(new.id,old.acerto_status,new.acerto_status);
  end if;
  if old.acerto_status is not null and new.acerto_status is distinct from old.acerto_status then

    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_acerto', old.acerto_status, new.acerto_status,
            case new.acerto_status
              when 'recebido' then 'Diferença recebida: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'credito_registrado' then 'Crédito registrado: R$ ' || replace(abs(v_saldo)::numeric(10,2)::text, '.', ',')
              when 'pendente' then 'Acerto voltou para pendente'
              when 'sem_diferenca' then 'Acerto incorporado ao saldo final do pedido'
              else new.acerto_status end,
            public.usuario_atual_email());
  end if;
  if (new.status='concluida' and old.status is distinct from 'concluida')
    or (new.acerto_status is distinct from old.acerto_status and new.acerto_status in ('recebido','credito_registrado','pendente')) then
    perform public.reconciliar_acertos(new.pedido_id,new.id);
  end if;
  return null;
end $function$;
revoke all on function public.tg_trocas_depois() from public,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.troca_acerto(p_troca uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_t trocas%rowtype;
begin
  if p_status is null or p_status not in ('pendente', 'recebido', 'credito_registrado') then
    raise exception 'Status de acerto inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  if v_t.acerto_status=p_status then return true; end if;
  if v_t.status <> 'concluida' or v_t.acerto_status is null or v_t.acerto_status = 'sem_diferenca' then
    raise exception 'Esta troca não tem acerto a registrar';
  end if;
  update trocas set acerto_status = p_status,
    acerto_em = case when p_status = 'pendente' then null else now() end,
    acerto_por = case when p_status = 'pendente' then null else public.usuario_atual_email() end
  where id = v_t.id;
  return true;
end $function$;
revoke all on function public.troca_acerto(uuid,text) from public,anon;
grant execute on function public.troca_acerto(uuid,text) to authenticated;


create or replace function public.tg_trocas_antes() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    new.acerto_controle_novo := true;
    perform public.fechar_financeiro(new.pedido_id);
    select case when v.subtotal>0 then greatest(0,1-(v.desconto+v.desconto_pix)/v.subtotal) else 1 end
      into new.fator_desconto from public.v_pedidos v where v.id=new.pedido_id;
  else
    new.acerto_controle_novo := old.acerto_controle_novo
      or coalesce(old.acerto_status='pendente' and new.acerto_status in ('recebido','credito_registrado'),false);
    new.fator_desconto := old.fator_desconto;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.tg_trocas_antes() from public,anon,authenticated,service_role;


create or replace function public.marcar_devolvido(p_pedido uuid,p_desfazer boolean default false) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.pedidos%rowtype;
  v_ids uuid[];
  v_textids text[];
  v_valor numeric := 0;
  v_atual record;
  v_mov record;
begin
  select * into p from public.pedidos where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select array_agg(i.id) into v_ids from public.pedido_itens i
    left join public.pedidos s on s.id=i.venda_origem_id
    where i.pedido_id=p.id and i.status='removido' and i.observacao='cliente desistiu'
      and coalesce(s.pago_em,p.pago_em) is not null and i.removido_em>=coalesce(s.pago_em,p.pago_em)
      and i.reembolsado_shopify_em is null
      and (case when coalesce(p_desfazer,false) then i.devolvido_em is not null else i.devolvido_em is null end);
  if v_ids is null then return; end if;
  select total_pago,total_geral into v_atual from public.v_pedidos where id=p.id;
  if v_atual.total_pago is null or v_atual.total_pago<0 or v_atual.total_geral<0 then
    raise exception 'Confira os valores incoerentes do pedido antes de registrar a devolução';
  end if;
  if not coalesce(p_desfazer,false) then
    select a_devolver into v_valor from public.v_pedidos where id=p.id;
    if coalesce(v_valor,0)<=0 then return; end if;
    update public.pedido_itens set devolvido_em=now() where id=any(v_ids);
    insert into public.movimentos_financeiros(pedido_id,tipo,valor,detalhes,usuario_email)
      values(p.id,'devolucao',-v_valor,jsonb_build_object('itens',to_jsonb(v_ids)),public.usuario_atual_email());
    insert into public.pedido_eventos(pedido_id,tipo,texto,usuario_email)
      values(p.id,'devolvido','Devolvido à cliente: R$ '||replace(v_valor::numeric(10,2)::text,'.',','),public.usuario_atual_email());
  else
    v_textids := array(select x::text from unnest(v_ids) x);
    if exists(select 1 from unnest(v_ids) x where not exists(
      select 1 from public.movimentos_financeiros m where m.pedido_id=p.id and m.tipo='devolucao'
        and m.detalhes->'itens' ? x::text
        and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id))) then
      raise exception 'Esta devolução é anterior ao controle de movimentos. Confira os valores antes de desfazer.';
    end if;
    for v_mov in select * from public.movimentos_financeiros m where m.pedido_id=p.id and m.tipo='devolucao'
      and m.detalhes->'itens' ?| v_textids
      and not exists(select 1 from public.movimentos_financeiros e where e.estorna_id=m.id)
      order by m.id loop
      if exists(select 1 from public.pedido_itens i where v_mov.detalhes->'itens' ? i.id::text and i.reembolsado_shopify_em is not null) then
        raise exception 'Este lote inclui reembolso na Shopify. Confira o valor antes de desfazer.';
      end if;
      insert into public.movimentos_financeiros(pedido_id,tipo,valor,estorna_id,detalhes,usuario_email)
        values(p.id,'estorno',-v_mov.valor,v_mov.id,v_mov.detalhes,public.usuario_atual_email());
      v_valor := v_valor-v_mov.valor;
    end loop;
    update public.pedido_itens set devolvido_em=null where id=any(v_ids);
    insert into public.pedido_eventos(pedido_id,tipo,texto,usuario_email)
      values(p.id,'devolvido_desfeito','Devolução desfeita: voltou a devolver R$ '||replace(v_valor::numeric(10,2)::text,'.',','),public.usuario_atual_email());
  end if;
  perform public.reconciliar_acertos(p.id,p.acerto_troca_id);
end $$;
revoke all on function public.marcar_devolvido(uuid,boolean) from public,anon;
grant execute on function public.marcar_devolvido(uuid,boolean) to authenticated;

create function public.tg_estorno_validar() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare m public.movimentos_financeiros%rowtype;
begin
  if new.estorna_id is not null then
    select * into m from public.movimentos_financeiros where id=new.estorna_id;
    if not found or m.tipo='estorno' or new.valor<>-m.valor or new.troca_id is distinct from m.troca_id then
      raise exception 'O estorno deve compensar exatamente o movimento original';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tg_estorno_validar() from public,anon,authenticated,service_role;
create trigger estorno_validar before insert on public.movimentos_financeiros
  for each row execute function public.tg_estorno_validar();


create or replace function public.listar_inconsistencias()
returns table (pedido_id uuid, numero text, regra text, detalhe text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with valores as materialized (select * from public.v_pedidos)
  select v.id, v.numero, 'composicao_total'::text,
         'O total difere de peças menos descontos e mais frete.'::text
    from valores v where v.status <> 'somada'
     and abs(v.total - (v.subtotal - v.desconto - v.desconto_pix + v.frete_na_conta)) > 0.005
  union all
  select v.id, v.numero, 'total_negativo', 'O total do pedido ficou negativo.'
    from valores v where v.total < 0 or v.total_geral < 0
  union all
  select v.id, v.numero, 'etapa_adiantada', 'Há peças pendentes, em falta ou com trabalho incompleto nesta etapa.'
    from valores v
   where v.status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado')
     and exists (
       select 1 from public.pedido_itens i where i.pedido_id = v.id and i.status <> 'removido'
         and (i.status <> 'encontrado'
              or (v.status in ('etiquetagem','bipagem','faturamento','embalagem','pronto_envio','enviado') and i.conferido_em is null)
              or (v.status in ('bipagem','faturamento','embalagem','pronto_envio','enviado') and i.etiquetado_em is null)
              or (v.status in ('faturamento','embalagem','pronto_envio','enviado') and i.qtd_bipada < i.qtd)))
  union all
  select p.id, p.numero, 'bipagem_invalida', 'Contagem de bipagem fora da quantidade do pedido.'
    from public.pedidos p where exists (
      select 1 from public.pedido_itens i where i.pedido_id=p.id and (i.qtd_bipada < 0 or i.qtd_bipada > i.qtd))
  union all
  select v.id, v.numero, 'somada_sem_composicao', 'A venda somada tem valor registrado, mas o romaneio perdeu as peças ou o total.'
    from valores v join public.pedidos p on p.id=v.id
   where v.status='somada' and p.somada_valor > 0 and (v.total=0 or v.qtd_pecas=0)
  union all
  select v.id, v.numero, 'pagamento_a_conferir', 'O total atual difere do pagamento registrado; confira trocas, acréscimos e acertos.'
    from valores v where v.fase='expedicao' and v.total_pago is not null
     and abs(v.total_geral-v.total_pago) > 0.005 and v.a_devolver=0
     and not exists (select 1 from public.trocas t where t.pedido_id=v.id and t.status <> 'cancelada'
                       and (t.status in ('rascunho','enviada','respondida') or t.acerto_status='pendente'))
  union all
  select p.id, p.numero, 'acerto_zero_pendente', 'O acerto permanece pendente apesar de o saldo líquido ser zero.'
    from public.v_pedido_acerto a join public.pedidos p on p.id=a.pedido_id
   where a.acerto_status='pendente' and abs(a.saldo) < 0.005
  union all
  select p.id, p.numero, 'troca_inativa_pendente', 'A troca espera peças que já deixaram de faltar.'
    from public.trocas t join public.pedidos p on p.id=t.pedido_id
   where t.status in ('enviada','respondida')
     and exists (select 1 from public.troca_pecas tp where tp.troca_id=t.id and tp.concluida_em is null)
     and not exists (select 1 from public.troca_pecas tp join public.pedido_itens i on i.id=tp.item_id
                      where tp.troca_id=t.id and tp.concluida_em is null and i.status in ('falta','defeito'))
  union all
  select v.id,v.numero,'pagamento_sem_conferencia','Confira o pagamento inicial e os acertos antigos: o saldo confirmado ainda não está disponível.'
    from valores v where v.total_pago is null and v.pago_em is not null
      and v.status not in ('em_aberto','aguardando_pagamento','perdida');
$$;
revoke all on function public.listar_inconsistencias() from public, anon;
grant execute on function public.listar_inconsistencias() to authenticated, service_role;
