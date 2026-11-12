-- V03/V11: cada parte conserva a base e recebe suas próprias diferenças, sem duplicar mercadoria.
-- Valores de linha exatos evitam perder centavos ao dividir quantidade; preço unitário é apresentação.
alter table public.pedido_itens
  add column valor_pago_linha numeric(12,2) check (valor_pago_linha >= 0),
  add column troca_peca_origem_id uuid references public.troca_pecas(id);
create index pedido_itens_troca_origem on public.pedido_itens(troca_peca_origem_id)
  where troca_peca_origem_id is not null;
alter table public.pedidos add column financeiro_retrato jsonb
  check (financeiro_retrato is null or jsonb_typeof(financeiro_retrato)='object');

-- Rateio por diferenças de acumulados: a soma é exatamente a cobertura confirmada da troca.
create view public.v_cobertura_troca_peca with (security_invoker=true) as
with base as (
  select tp.id as troca_peca_id,t.id as troca_id,t.pedido_id,i.venda_origem_id,
    tp.resultado_diferenca as dif,t.cobrir_ate,
    sum(tp.resultado_diferenca) over(partition by t.id) as saldo,
    sum(greatest(tp.resultado_diferenca,0)) over(partition by t.id) as positivas,
    sum(greatest(tp.resultado_diferenca,0)) over(partition by t.id order by tp.id rows unbounded preceding) as acumulado
  from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
  join public.pedido_itens i on i.id=tp.item_id
  where tp.concluida_em is not null and t.status<>'cancelada'
)
select troca_peca_id,troca_id,pedido_id,venda_origem_id,
  (case when positivas>0 then
    round(least(greatest(saldo,0),cobrir_ate)*acumulado/positivas,2)
    -round(least(greatest(saldo,0),cobrir_ate)*(acumulado-greatest(dif,0))/positivas,2)
    else 0 end)::numeric(12,2) as coberto
from base;
revoke all on public.v_cobertura_troca_peca from public,anon;
grant select on public.v_cobertura_troca_peca to authenticated,service_role;

create view public.v_item_liquido with (security_invoker=true) as
with pagos as (
  select i.id,i.pedido_id,i.venda_origem_id,i.troca_peca_origem_id,
    coalesce(i.valor_pago_linha,round(i.qtd*coalesce(i.preco_pago,coalesce(i.preco,0)*
      case when p.origem='shopify' then coalesce((select t.fator_desconto from public.trocas t
        where t.pedido_id=p.id order by t.created_at desc limit 1),1) else 1 end),2)) as valor,
    coalesce(c.coberto,0) as cobertura
  from public.pedido_itens i join public.pedidos p on p.id=i.pedido_id
  left join public.v_cobertura_troca_peca c on c.troca_peca_id=i.troca_peca_origem_id
), rateio as (
  select p.*,sum(valor) over(partition by troca_peca_origem_id) as base,
    sum(valor) over(partition by troca_peca_origem_id order by id rows unbounded preceding) as acumulado
  from pagos p
)
select id,pedido_id,venda_origem_id,valor::numeric(12,2) as valor_antes_cobertura,
  (case when troca_peca_origem_id is not null and base>0
    then round(cobertura*acumulado/base,2)-round(cobertura*(acumulado-valor)/base,2) else 0 end)::numeric(12,2) as coberto,
  (valor-case when troca_peca_origem_id is not null and base>0
    then round(cobertura*acumulado/base,2)-round(cobertura*(acumulado-valor)/base,2) else 0 end)::numeric(12,2) as valor_liquido
from rateio;
revoke all on public.v_item_liquido from public,anon;
grant select on public.v_item_liquido to authenticated,service_role;

create view public.v_parte_somada with (security_invoker=true) as
select s.id as venda_id,s.somar_em as pedido_id,
  (coalesce(s.somada_valor,0)+d.dif-c.coberto-r.retirado)::numeric(12,2) as valor_atual,
  r.retirado::numeric(12,2) as valor_retirado,c.coberto::numeric(12,2) as coberto
from public.pedidos s
cross join lateral (
  select coalesce(sum(tp.resultado_diferenca),0) as dif
  from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
  join public.pedido_itens i on i.id=tp.item_id
  where i.venda_origem_id=s.id and t.pedido_id=s.somar_em and tp.concluida_em is not null and t.status<>'cancelada'
) d
cross join lateral (
  select coalesce(sum(coberto),0) as coberto from public.v_cobertura_troca_peca where venda_origem_id=s.id
) c
cross join lateral (
  select coalesce(sum(v.valor_liquido),0) as retirado
  from public.pedido_itens i join public.v_item_liquido v on v.id=i.id
  where i.venda_origem_id=s.id and i.status='removido' and i.observacao='cliente desistiu'
    and s.pago_em is not null and i.removido_em>=s.pago_em and i.reembolsado_shopify_em is null
) r
where s.somada_em is not null;
revoke all on public.v_parte_somada from public,anon;
grant select on public.v_parte_somada to authenticated,service_role;

-- Só é chamado por ações autorizadas. A captura preserva o total corrente dos legados,
-- exclui resultados anteriores e não presume que dinheiro adicional já foi recebido.
create function public.fechar_financeiro(p_pedido uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.pedidos%rowtype;
  v record;
  v_trocas jsonb;
  v_cobertura numeric;
  v_retirado numeric;
begin
  select * into p from public.pedidos where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p.origem<>'whatsapp' or p.financeiro_retrato is not null then return; end if;
  select * into v from public.v_pedidos where id=p.id;
  -- Inclui só a base original. Adicionais já têm o rateio da própria venda.
  with pesos as (
    select id,qtd,coalesce(preco,0)*qtd as cheio,
      sum(coalesce(preco,0)*qtd) over(order by ordem,created_at,id rows unbounded preceding) as acum
    from public.pedido_itens where pedido_id=p.id and not adicional and status<>'removido'
  ), liquidos as (
    select *,case when v.subtotal>0 then
      round(acum*(v.valor_pecas_com_desconto+v.troca_coberto)/v.subtotal,2)
      -round((acum-cheio)*(v.valor_pecas_com_desconto+v.troca_coberto)/v.subtotal,2) else 0 end as valor
    from pesos
  )
  update public.pedido_itens i set valor_pago_linha=l.valor,preco_pago=round(l.valor/l.qtd,2)
    from liquidos l where i.id=l.id and i.valor_pago_linha is null;
  select coalesce(jsonb_agg(tp.id),'[]'::jsonb) into v_trocas
    from public.troca_pecas tp join public.trocas t on t.id=tp.troca_id
    where t.pedido_id=p.id and tp.concluida_em is not null;
  select coalesce(sum(coberto),0) into v_cobertura from public.v_cobertura_troca_peca
    where pedido_id=p.id and venda_origem_id is null;
  select coalesce(sum(li.valor_liquido),0) into v_retirado
    from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
    where i.pedido_id=p.id and not i.adicional and i.status='removido' and i.observacao='cliente desistiu'
      and p.pago_em is not null and i.removido_em>=p.pago_em and i.reembolsado_shopify_em is null;
  update public.pedidos set financeiro_retrato=jsonb_build_object(
    'mercadorias',v.valor_pecas_com_desconto,'trocas',v_trocas,'cobertura',v_cobertura,'retirado',v_retirado,
    'subtotal',v.subtotal,'desconto',v.desconto,'desconto_pix',v.desconto_pix)
    where id=p.id;
end $$;
revoke all on function public.fechar_financeiro(uuid) from public,anon,authenticated,service_role;

create function public.tg_financeiro_imutavel() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.financeiro_retrato is not null and (tg_op='INSERT' or old.financeiro_retrato is null)
    and current_user<>(select pg_get_userbyid(proowner) from pg_proc where oid='public.fechar_financeiro(uuid)'::regprocedure) then
    raise exception 'A base financeira só pode ser registrada pela operação autorizada do banco';
  end if;
  if old.financeiro_retrato is not null and new.financeiro_retrato is distinct from old.financeiro_retrato then
    raise exception 'A base financeira faz parte do histórico e não pode ser reescrita';
  end if;
  return new;
end $$;
revoke all on function public.tg_financeiro_imutavel() from public,anon,authenticated,service_role;
create trigger financeiro_imutavel before insert or update of financeiro_retrato on public.pedidos
  for each row execute function public.tg_financeiro_imutavel();
create function public.tg_fechar_financeiro() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status in ('em_aberto','aguardando_pagamento')
    and new.status not in ('em_aberto','aguardando_pagamento','perdida','cancelado') then
    perform public.fechar_financeiro(new.id);
  end if;
  return null;
end $$;
revoke all on function public.tg_fechar_financeiro() from public,anon,authenticated,service_role;
create trigger fechar_financeiro after update of status on public.pedidos
  for each row execute function public.tg_fechar_financeiro();

-- Evita planejar a view inteira quando o valor exato da própria linha já resolve o fator.
create or replace function public.troca_fator(p_item uuid) returns numeric
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare i public.pedido_itens%rowtype; v numeric;
begin
  select * into i from public.pedido_itens where id=p_item;
  if not found then return 1; end if;
  if i.valor_pago_linha is not null or i.adicional then
    if i.qtd*coalesce(i.preco,0)=0 then return 1; end if;
    select valor_liquido into v from public.v_item_liquido where id=i.id;
    return greatest(0,least(1,v/(i.qtd*i.preco)));
  end if;
  select t.fator_desconto into v from public.trocas t join public.troca_pecas p on p.troca_id=t.id
    where p.item_id=p_item and t.status in ('rascunho','enviada','respondida') limit 1;
  if found then return v; end if;
  select case when subtotal>0 then greatest(0,1-(desconto+desconto_pix)/subtotal) else 1 end
    into v from public.v_pedidos where id=i.pedido_id;
  return coalesce(v,1);
end $$;
revoke all on function public.troca_fator(uuid) from public,anon;
grant execute on function public.troca_fator(uuid) to authenticated,service_role;

create or replace view public.v_troca_valores with (security_invoker=true) as
with base as (
  select p.id as troca_peca_id,t.id as troca_id,t.pedido_id,p.item_id,i.qtd,
    case when (i.adicional or i.valor_pago_linha is not null) and i.qtd*coalesce(i.preco,0)>0
      then greatest(0,least(li.valor_liquido,i.qtd*i.preco))
      when i.adicional or i.valor_pago_linha is not null then 1 else t.fator_desconto end as numerador,
    case when (i.adicional or i.valor_pago_linha is not null) and i.qtd*coalesce(i.preco,0)>0
      then i.qtd*i.preco else 1 end as denominador,
    case when i.valor_pago_linha is not null then li.valor_liquido
      else round(i.qtd*coalesce(i.preco_pago,coalesce(i.preco,0)*t.fator_desconto),2) end as pago
  from public.troca_pecas p join public.trocas t on t.id=p.troca_id
  join public.pedido_itens i on i.id=p.item_id join public.v_item_liquido li on li.id=i.id
)
select g.troca_peca_id,g.troca_id,g.pedido_id,g.item_id,o.id as opcao_id,'opcao'::text as tipo,g.qtd,
  g.pago as valor_pago_item,round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2) as valor_opcao,
  round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago as diferenca,
  case when round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)>g.pago then 'paga_diferenca'
       when round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)<g.pago then 'credito' else 'sem_diferenca' end as situacao,
  round(o.preco*g.numerador/g.denominador,2) as valor_unit
from base g join public.troca_opcoes o on o.troca_peca_id=g.troca_peca_id and o.preco is not null
union all
select g.troca_peca_id,g.troca_id,g.pedido_id,g.item_id,null::uuid,'credito'::text,g.qtd,
  g.pago,0::numeric,-g.pago,'credito'::text,null::numeric from base g;
revoke all on public.v_troca_valores from public,anon;
grant select on public.v_troca_valores to authenticated,service_role;


CREATE OR REPLACE FUNCTION public.troca_concluir_peca(p_troca uuid, p_peca uuid, p_tipo text, p_opcao uuid, p_escolha_tipo text, p_versao timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  perform public.fechar_financeiro(v_t.pedido_id);

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

  if p_tipo = 'opcao' then
    select coalesce(max(ordem), 0) into v_ordem from pedido_itens where pedido_id = v_t.pedido_id;
    v_observacao := null;
    -- Uma linha nova por peça do carrinho (na ordem em que a cliente montou).
    for v_e in
      select o.id, e.qtd, o.origem, o.shopify_variant_id, o.peca_clube_id, o.sku, o.nome, o.variante, o.foto_url, o.preco
        from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
       where e.troca_peca_id = v_p.id order by e.seq
    loop
      v_ordem := v_ordem + 1;
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
        variante, foto_url, qtd, preco, ordem, observacao, adicional, venda_origem_id, troca_peca_origem_id, valor_pago_linha, preco_pago)
      values (v_t.pedido_id, case when v_e.origem = 'site' then 'shopify' else 'clube' end,
        v_e.shopify_variant_id, v_e.peca_clube_id, v_e.sku, v_e.nome, v_e.variante, v_e.foto_url,
        v_e.qtd, v_e.preco, v_ordem, 'troca de ' || coalesce(v_i.sku, v_i.nome),
        v_i.adicional,v_i.venda_origem_id,v_p.id,
        (select round(v_e.qtd*x.valor_unit,2) from v_troca_valores x where x.opcao_id=v_e.id),
        (select x.valor_unit from v_troca_valores x where x.opcao_id=v_e.id));
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
  if not exists (select 1 from troca_pecas tp join pedido_itens i on i.id=tp.item_id
                 where tp.troca_id=v_t.id and tp.concluida_em is null and i.status in ('falta','defeito')) then
    -- Acerto: pendente se a troca deixou diferença (a cobrar ou crédito), senão sem diferença.
    update trocas set status = 'concluida', concluida_em = now(),
      acerto_status = case when abs(public.troca_saldo_liquido(v_t.id)) < 0.005
                           then 'sem_diferenca' else 'pendente' end
    where id = v_t.id;
  end if;
  if not exists (select 1 from pedido_itens where pedido_id = v_t.pedido_id and status in ('falta', 'defeito')) then
    update pedidos set status = 'separacao'
      where id = v_t.pedido_id and status in ('avisar_cliente', 'aguardando_cliente');
  end if;
  return true;
end $function$;
revoke all on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) from public, anon;
grant execute on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) to authenticated;


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
     set qtd = v_i.qtd - p_qtd, qtd_bipada = least(v_i.qtd_bipada, v_i.qtd - p_qtd),
         valor_pago_linha = case when v_i.valor_pago_linha is not null then v_i.valor_pago_linha-round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end
   where id = p_item;
  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
    foto_url, preco, preco_pago, shopify_line_id, ordem, observacao, status, qtd, adicional, venda_origem_id, troca_peca_origem_id, valor_pago_linha)
  values (v_i.pedido_id, v_i.origem, v_i.shopify_variant_id, v_i.peca_clube_id, v_i.sku, v_i.nome,
    v_i.variante, v_i.foto_url, v_i.preco, v_i.preco_pago, v_i.shopify_line_id, v_i.ordem, null,
    'pendente', p_qtd, v_i.adicional, v_i.venda_origem_id, v_i.troca_peca_origem_id,
    case when v_i.valor_pago_linha is not null then round(v_i.valor_pago_linha*p_qtd/v_i.qtd,2) end)
  returning id into v_novo;
  update pedido_itens set status = p_status where id = v_novo;
  return v_novo;
end $$;
revoke all on function public.marcar_falta(uuid, int, text) from public, anon;
grant execute on function public.marcar_falta(uuid, int, text) to authenticated;

create or replace function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_faixa numeric default 0.2,
  p_busca text default null,
  p_incluir_pedido boolean default false,
  p_so_sem_estoque boolean default false)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text,
               preco_cliente numeric, diferenca numeric, situacao text, no_pedido boolean,
               vende_sem_estoque boolean)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_pago_unit_exato numeric;
  v_qtd integer;
  v_pedido uuid;
  v_fator numeric := 1;
  v_numerador numeric;
  v_denominador numeric := 1;
  v_pago_unit numeric;
  v_pago_item numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.preco_pago, i.qtd, i.pedido_id
    into v_variant, v_preco, v_pago_unit_exato, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  v_fator := public.troca_fator(p_item);
  v_numerador := v_fator;
  select case when i.qtd*coalesce(i.preco,0)>0 then greatest(0,least(li.valor_liquido,i.qtd*i.preco)) else 1 end,
    case when i.qtd*coalesce(i.preco,0)>0 then i.qtd*i.preco else 1 end
    into v_numerador,v_denominador
    from public.pedido_itens i join public.v_item_liquido li on li.id=i.id
    where i.id=p_item and (i.adicional or i.valor_pago_linha is not null);
  if not found then v_numerador:=v_fator; v_denominador:=1; end if;


  v_pago_unit := round(coalesce(v_pago_unit_exato, v_preco * v_fator), 2);
  v_pago_item := round(v_qtd * coalesce(v_pago_unit_exato, v_preco * v_fator), 2);
  select coalesce((select li.valor_liquido from public.v_item_liquido li join public.pedido_itens i on i.id=li.id
    where i.id=p_item and i.valor_pago_linha is not null),v_pago_item) into v_pago_item;

  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select x.motivo, x.variant_id, x.produto_id, x.sku, x.produto, x.variante, x.preco, x.foto_url,
             x.preco_cliente, x.diferenca,
             case when x.diferenca > 0 then 'paga_diferenca'
                  when x.diferenca < 0 then 'credito'
                  else 'sem_diferenca' end,
             x.no_pedido, x.vende_sem_estoque
      from (
        select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_numerador / v_denominador, 2) as preco_cliente,
               round(v_qtd * round(c.preco * v_numerador / v_denominador, 2), 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido,
               c.vende_sem_estoque
        from catalogo_site c
        where v_produto_id is not null and c.produto_id = v_produto_id
          and c.variant_id is distinct from v_variant
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (not p_so_sem_estoque or c.vende_sem_estoque is true)
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
             x.no_pedido, x.vende_sem_estoque
      from (
        select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url,
               round(c.preco * v_numerador / v_denominador, 2) as preco_cliente,
               round(v_qtd * round(c.preco * v_numerador / v_denominador, 2), 2) - v_pago_item as diferenca,
               exists (select 1 from pedido_itens y
                        where y.pedido_id = v_pedido and y.status <> 'removido'
                          and y.shopify_variant_id = c.variant_id) as no_pedido,
               c.vende_sem_estoque
        from catalogo_site c
        where c.variant_id is distinct from v_variant
          and c.produto_id is distinct from v_produto_id
          and (c.status is null or upper(c.status) = 'ACTIVE')
          and (p_faixa is null
               or round(c.preco * v_numerador / v_denominador, 2) between v_pago_unit * (1 - p_faixa) and v_pago_unit * (1 + p_faixa))
          and (p_categoria is null or upper(split_part(c.produto, ' ', 1)) = upper(p_categoria))
          and (v_busca is null or c.produto ilike '%' || v_busca || '%' or c.sku ilike '%' || v_busca || '%'
               or c.variante ilike '%' || v_busca || '%')
          and (not p_so_sem_estoque or c.vende_sem_estoque is true)
      ) x
      where p_incluir_pedido or not x.no_pedido
      order by abs(x.preco_cliente - v_pago_unit), x.produto, x.variante
      limit 40;
  end if;
end $$;

revoke all on function public.sugerir_troca(uuid, text, text, numeric, text, boolean, boolean) from public, anon;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, text, boolean, boolean) to authenticated;



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
  (case when p.valor_pago is null and sm.pago = 0 then null
        else coalesce(p.valor_pago, 0) + sm.pago end)::numeric(10,2)                    as total_pago,
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
  -- A devolver: Shopify = peças removidas ainda não devolvidas; WhatsApp = o que foi pago a mais que o total.
  select (case
            when p.status in ('cancelado', 'perdida', 'somada') then 0
            when p.origem = 'shopify' then rem.pendente
            when rem.n_pendente > 0 and p.valor_pago is not null then greatest(0, p.valor_pago - tot.v)
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
       (v.total_geral - a.saldo_todas + (select coalesce(sum(coberto),0) from public.v_cobertura_troca_peca where pedido_id=v.id) + v.valor_removido + (select coalesce(sum(valor_retirado),0) from public.v_parte_somada where pedido_id=v.id))::numeric(10,2) as valor_pago_original,
       a.valor_pago_pecas_trocadas,
       (a.a_cobrar_bruto - cv.v)::numeric(10,2) as total_a_cobrar,
       a.total_credito,
       (a.saldo_bruto - cv.v)::numeric(10,2) as saldo,
       v.total_geral::numeric(10,2) as novo_total,
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

create or replace function public.troca_valor_pago(p_item uuid)
returns table (valor_pago numeric,valor_pago_unit numeric,qtd integer)
language sql stable security invoker set search_path=public,pg_temp as $$
  select v.valor,round(v.valor/i.qtd,2),i.qtd from public.pedido_itens i
  join public.v_item_liquido li on li.id=i.id
  cross join lateral (select case when i.valor_pago_linha is not null then li.valor_liquido
    else round(i.qtd*coalesce(i.preco_pago,coalesce(i.preco,0)*public.troca_fator(i.id)),2) end as valor) v
  where i.id=p_item;
$$;
revoke all on function public.troca_valor_pago(uuid) from public,anon;
grant execute on function public.troca_valor_pago(uuid) to authenticated,service_role;

-- Congela os legados ao INICIAR a troca, antes de qualquer valor ser oferecido à cliente.
create or replace function public.tg_trocas_antes() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    perform public.fechar_financeiro(new.pedido_id);
    select case when v.subtotal>0 then greatest(0,1-(v.desconto+v.desconto_pix)/v.subtotal) else 1 end
      into new.fator_desconto from public.v_pedidos v where v.id=new.pedido_id;
  else new.fator_desconto := old.fator_desconto;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.tg_trocas_antes() from public,anon,authenticated,service_role;
