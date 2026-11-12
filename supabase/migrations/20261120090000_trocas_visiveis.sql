-- Trocas visíveis (12/11/2026): etapa de origem do desvio, cobertura da loja nos rótulos, alterações do
-- pedido, motivo dos descontos da Shopify e troca num só pedido ao banco.
-- Todas as tabelas, views e funções novas têm GRANT explícito (anon nada; authenticated sem DELETE).

-- ---------------------------------------------------------------------------
-- 1. V37: o desvio "avisar/aguardando cliente" lembra de onde o pedido veio
-- ---------------------------------------------------------------------------
-- Falta marcada na Conferência (ou Etiquetagem, Bipagem...) joga o pedido para "avisar cliente". A tela
-- contava esse desvio como Separação e a Conferência ficava bloqueada. Agora o banco guarda a etapa de
-- origem: grava ao entrar no desvio, mantém enquanto troca entre avisar e aguardar, limpa ao sair.
alter table public.pedidos add column etapa_antes_desvio text
  check (etapa_antes_desvio is null or etapa_antes_desvio in
    ('separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio'));
comment on column public.pedidos.etapa_antes_desvio is
  'Etapa da esteira em que o pedido estava ao entrar em avisar/aguardar cliente; nula fora do desvio (ou em desvios antigos).';

create function public.tg_etapa_antes_desvio() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('avisar_cliente','aguardando_cliente') then
    if old.status in ('avisar_cliente','aguardando_cliente') then
      new.etapa_antes_desvio := coalesce(new.etapa_antes_desvio, old.etapa_antes_desvio);
    else
      new.etapa_antes_desvio := case
        when old.status in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then old.status
        else 'separacao' end;
    end if;
  else
    new.etapa_antes_desvio := null;
  end if;
  return new;
end $$;
revoke all on function public.tg_etapa_antes_desvio() from public, anon, authenticated, service_role;
create trigger pedidos_etapa_desvio before update of status on public.pedidos
  for each row execute function public.tg_etapa_antes_desvio();

-- Desvios que já existem: a origem é a etapa de onde o pedido saiu no último movimento para o desvio.
update public.pedidos p set etapa_antes_desvio = e.origem
from (
  select distinct on (ev.pedido_id) ev.pedido_id,
    case when ev.de in ('conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio') then ev.de
         else 'separacao' end as origem
  from public.pedido_eventos ev
  where ev.tipo = 'status' and ev.para in ('avisar_cliente','aguardando_cliente')
    and coalesce(ev.de,'') not in ('avisar_cliente','aguardando_cliente')
  order by ev.pedido_id, ev.created_at desc, ev.id desc
) e
where p.id = e.pedido_id and p.status in ('avisar_cliente','aguardando_cliente') and p.etapa_antes_desvio is null;

-- Sai do desvio: volta para a etapa de origem quando não sobra peça pendente, em falta ou com defeito e
-- a etapa continua permitida pelas regras; senão, para a Separação (peça nova de troca entra pendente).
-- Mover pelo menu "Mover para…" não passa por aqui: vai exatamente para onde a pessoa escolheu.
create function public.sair_do_desvio(p_pedido uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.pedidos%rowtype;
  c record;
  v_ordem text[] := array['separacao','conferencia','etiquetagem','bipagem','faturamento','embalagem','pronto_envio'];
  v_origem text;
  v_destino text := 'separacao';
  v_regras jsonb;
  v_acerto boolean := false;
  v_cand text;
  v_aberta boolean;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if p.status not in ('avisar_cliente','aguardando_cliente') then return p.status; end if;
  v_origem := coalesce(p.etapa_antes_desvio, 'separacao');
  select exists (select 1 from public.pedido_itens where pedido_id = p_pedido and status in ('pendente','falta','defeito'))
    into v_aberta;
  if not v_aberta and v_origem <> 'separacao' then
    select count(*)::int as linhas, coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into c
    from public.pedido_itens where pedido_id = p_pedido and status <> 'removido';
    if array_position(v_ordem, v_origem) >= 6 then
      select acerto_pendente into v_acerto from public.v_pedidos where id = p_pedido;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',p.status,'linhas',c.linhas,'pecas',c.pecas,'encontradas',c.encontradas,
      'conferidas',c.conferidas,'etiquetadas',c.etiquetadas,'bipadas',c.bipadas,
      'nota',p.nf_emitida_em,'frete',p.frete_gerado_em,'fornecedor',p.pedido_fornecedor_em,
      'embalado',p.embalado_em,'postado',p.postado_em,'acerto',coalesce(v_acerto,false)));
    -- A etapa de origem se ela ainda vale; senão a mais avançada abaixo dela que vale.
    for n in reverse array_position(v_ordem, v_origem) .. 2 loop
      v_cand := v_ordem[n];
      if v_regras->>v_cand is null then v_destino := v_cand; exit; end if;
    end loop;
  end if;
  update public.pedidos set status = v_destino where id = p_pedido;
  perform public.reavaliar_etapa(p_pedido);
  return (select status from public.pedidos where id = p_pedido);
end $$;
revoke all on function public.sair_do_desvio(uuid) from public, anon;
grant execute on function public.sair_do_desvio(uuid) to authenticated;


-- V37: concluir a troca devolve o pedido à etapa de origem do desvio (era sempre a Separação).
-- Cópia de 20261118180000_financeiro_por_parte.sql; só o fim mudou.
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
    -- V37: volta para a etapa de onde veio o desvio (peça nova de troca entra pendente: aí é a Separação).
    perform public.sair_do_desvio(v_t.pedido_id);
  end if;
  return true;
end $function$;
revoke all on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) from public, anon;
grant execute on function public.troca_concluir_peca(uuid,uuid,text,uuid,text,timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. V38: a cobertura da loja aparece nos valores da troca (previsto por peça)
-- ---------------------------------------------------------------------------
-- "Cobrir tudo" grava cobrir_ate = 99999999.99 (o máximo de numeric(10,2)): cobre a diferença inteira.
-- Colunas novas SEMPRE no fim. O previsto de cada peça usa a cobertura inteira da troca; o valor confirmado
-- (rateio entre as peças) continua vindo de v_cobertura_troca_peca depois de concluída.
create or replace view public.v_troca_valores with (security_invoker=true) as
with base as (
  select p.id as troca_peca_id,t.id as troca_id,t.pedido_id,p.item_id,i.qtd,t.cobrir_ate,
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
  round(o.preco*g.numerador/g.denominador,2) as valor_unit,
  least(greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0),g.cobrir_ate)::numeric(12,2) as coberto_previsto,
  (greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0)
    -least(greatest(round(g.qtd*round(o.preco*g.numerador/g.denominador,2),2)-g.pago,0),g.cobrir_ate))::numeric(12,2) as cliente_paga_previsto
from base g join public.troca_opcoes o on o.troca_peca_id=g.troca_peca_id and o.preco is not null
union all
select g.troca_peca_id,g.troca_id,g.pedido_id,g.item_id,null::uuid,'credito'::text,g.qtd,
  g.pago,0::numeric,-g.pago,'credito'::text,null::numeric,0::numeric(12,2),0::numeric(12,2) from base g;
revoke all on public.v_troca_valores from public,anon;
grant select on public.v_troca_valores to authenticated,service_role;

create or replace view public.v_troca_carrinho with (security_invoker = true) as
select e.troca_peca_id, c.troca_id, c.pedido_id, c.item_id,
       sum(e.qtd)::int                                                          as unidades,
       sum(e.qtd * x.valor_unit)::numeric(10,2)                                 as valor_escolhido,
       c.valor_pago_item::numeric(10,2)                                         as valor_pago_item,
       (sum(e.qtd * x.valor_unit) - c.valor_pago_item)::numeric(10,2)           as diferenca,
       jsonb_agg(jsonb_build_object('opcao_id', e.opcao_id, 'qtd', e.qtd, 'valor_unit', x.valor_unit,
                                    'valor', round(e.qtd * x.valor_unit, 2))
                 order by e.seq)                                   as itens,
       least(greatest(sum(e.qtd * x.valor_unit) - c.valor_pago_item, 0), t.cobrir_ate)::numeric(10,2) as coberto_previsto,
       (greatest(sum(e.qtd * x.valor_unit) - c.valor_pago_item, 0)
         - least(greatest(sum(e.qtd * x.valor_unit) - c.valor_pago_item, 0), t.cobrir_ate))::numeric(10,2) as cliente_paga_previsto
from public.troca_escolhas e
join public.v_troca_valores x on x.troca_peca_id = e.troca_peca_id and x.opcao_id = e.opcao_id
join public.v_troca_valores c on c.troca_peca_id = e.troca_peca_id and c.tipo = 'credito'
join public.trocas t on t.id = c.troca_id
group by e.troca_peca_id, c.troca_id, c.pedido_id, c.item_id, c.valor_pago_item, t.cobrir_ate;
revoke all on public.v_troca_carrinho from public, anon;
grant select on public.v_troca_carrinho to authenticated, service_role;


-- Sugestões também mostram o previsto da cobertura da loja (colunas novas no fim; o tipo de retorno muda).
drop function public.sugerir_troca(uuid, text, text, numeric, text, boolean, boolean);
create function public.sugerir_troca(
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
               vende_sem_estoque boolean, coberto_previsto numeric, cliente_paga_previsto numeric)
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
  v_cobrir numeric := 0;
begin
  select i.shopify_variant_id, coalesce(i.preco, 0), i.preco_pago, i.qtd, i.pedido_id
    into v_variant, v_preco, v_pago_unit_exato, v_qtd, v_pedido
  from pedido_itens i where i.id = p_item;

  select coalesce(max(t.cobrir_ate), 0) into v_cobrir from trocas t
    where t.pedido_id = v_pedido and t.status in ('rascunho','enviada','respondida');
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
             x.no_pedido, x.vende_sem_estoque,
             (case when x.diferenca > 0 then least(x.diferenca, v_cobrir) else 0 end)::numeric,
             (greatest(x.diferenca, 0) - case when x.diferenca > 0 then least(x.diferenca, v_cobrir) else 0 end)::numeric
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
             x.no_pedido, x.vende_sem_estoque,
             (case when x.diferenca > 0 then least(x.diferenca, v_cobrir) else 0 end)::numeric,
             (greatest(x.diferenca, 0) - case when x.diferenca > 0 then least(x.diferenca, v_cobrir) else 0 end)::numeric
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

-- ---------------------------------------------------------------------------
-- 3. Alterações do pedido depois do pagamento (leitura; o dinheiro é do banco)
-- ---------------------------------------------------------------------------
-- Uma linha por peça trocada (opção ou crédito), por peça que a cliente tirou e por quantidade reduzida,
-- sempre depois do pagamento. "sai" é a peça que deixou o pedido; "entra", as peças novas da troca.
-- coberto_loja = quanto a Arvenne absorveu; cliente_paga = o resto da diferença; credito = o que sobrou
-- para a cliente. a_devolver/devolvido_em valem para peça removida ou quantidade reduzida.
create view public.v_pedido_alteracoes with (security_invoker = true) as
select 'troca:' || tp.id::text as id, t.pedido_id,
  case when tp.escolha_tipo = 'credito' then 'credito' else 'troca' end as tipo,
  tp.concluida_em as em,
  coalesce(ev.usuario_email, case when tp.escolhida_por = 'cliente' then 'cliente' end) as por,
  tp.escolhida_por,
  jsonb_build_object('item_id', i.id, 'sku', i.sku, 'nome', i.nome, 'variante', i.variante, 'foto_url', i.foto_url,
    'qtd', i.qtd, 'valor_pago', li.valor_antes_cobertura) as sai,
  coalesce((select jsonb_agg(jsonb_build_object('item_id', n.id, 'sku', n.sku, 'nome', n.nome, 'variante', n.variante,
      'foto_url', n.foto_url, 'qtd', n.qtd, 'valor', ln.valor_antes_cobertura) order by n.ordem, n.id)
    from public.pedido_itens n join public.v_item_liquido ln on ln.id = n.id
    where n.troca_peca_origem_id = tp.id), '[]'::jsonb) as entra,
  li.valor_antes_cobertura::numeric(12,2) as valor,
  coalesce(tp.resultado_diferenca, 0)::numeric(12,2) as diferenca,
  coalesce(cv.coberto, 0)::numeric(12,2) as coberto_loja,
  (greatest(coalesce(tp.resultado_diferenca, 0), 0) - coalesce(cv.coberto, 0))::numeric(12,2) as cliente_paga,
  greatest(-coalesce(tp.resultado_diferenca, 0), 0)::numeric(12,2) as credito,
  null::numeric(12,2) as a_devolver,
  null::timestamptz as devolvido_em
from public.troca_pecas tp
join public.trocas t on t.id = tp.troca_id
join public.pedido_itens i on i.id = tp.item_id
join public.v_item_liquido li on li.id = i.id
left join public.v_cobertura_troca_peca cv on cv.troca_peca_id = tp.id
left join lateral (
  select e.usuario_email from public.pedido_eventos e
  where e.item_id = i.id and e.tipo = 'troca_concluida' order by e.id desc limit 1
) ev on true
where tp.concluida_em is not null and t.status <> 'cancelada'
union all
select 'removida:' || i.id::text, i.pedido_id, 'removida', i.removido_em,
  ev.usuario_email, null::text,
  jsonb_build_object('item_id', i.id, 'sku', i.sku, 'nome', i.nome, 'variante', i.variante, 'foto_url', i.foto_url,
    'qtd', i.qtd, 'valor_pago', li.valor_liquido),
  '[]'::jsonb,
  li.valor_liquido::numeric(12,2), 0::numeric(12,2), 0::numeric(12,2), 0::numeric(12,2), 0::numeric(12,2),
  (case when i.devolvido_em is null and i.reembolsado_shopify_em is null then li.valor_liquido else 0 end)::numeric(12,2),
  coalesce(i.devolvido_em, i.reembolsado_shopify_em)
from public.pedido_itens i
join public.pedidos p on p.id = i.pedido_id
join public.v_item_liquido li on li.id = i.id
left join lateral (
  select e.usuario_email from public.pedido_eventos e
  where e.item_id = i.id and e.tipo = 'item' and e.para = 'removido' order by e.id desc limit 1
) ev on true
where i.status = 'removido' and i.observacao = 'cliente desistiu' and p.pago_em is not null and i.removido_em >= p.pago_em
union all
select 'quantidade:' || e.id::text, i.pedido_id, 'quantidade', e.created_at,
  e.usuario_email, null::text,
  jsonb_build_object('item_id', i.id, 'sku', i.sku, 'nome', i.nome, 'variante', i.variante, 'foto_url', i.foto_url,
    'qtd', (e.de::int - e.para::int),
    'valor_pago', round((e.de::int - e.para::int) * li.valor_antes_cobertura / nullif(i.qtd, 0), 2)),
  '[]'::jsonb,
  round((e.de::int - e.para::int) * li.valor_antes_cobertura / nullif(i.qtd, 0), 2)::numeric(12,2),
  0::numeric(12,2), 0::numeric(12,2), 0::numeric(12,2), 0::numeric(12,2),
  (case when i.devolvido_em is null and i.reembolsado_shopify_em is null
        then round((e.de::int - e.para::int) * li.valor_antes_cobertura / nullif(i.qtd, 0), 2) else 0 end)::numeric(12,2),
  coalesce(i.devolvido_em, i.reembolsado_shopify_em)
from public.pedido_eventos e
join public.pedido_itens i on i.id = e.item_id
join public.pedidos p on p.id = i.pedido_id
join public.v_item_liquido li on li.id = i.id
where e.tipo = 'qtd' and e.de ~ '^\d+$' and e.para ~ '^\d+$' and e.para::int < e.de::int
  and i.status <> 'removido' and p.pago_em is not null and e.created_at >= p.pago_em;
revoke all on public.v_pedido_alteracoes from public, anon;
grant select on public.v_pedido_alteracoes to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. V39: o painel da troca numa viagem só
-- ---------------------------------------------------------------------------
-- O app lia a troca e, em seguida, três views (valores, resumo, carrinho): duas idas e voltas em série,
-- fora o garantir_troca. Esta função devolve tudo junto, no mesmo formato que a tela monta (Troca).
-- security invoker: vale a RLS de quem chama. Sem troca ativa devolve null.
create function public.troca_painel(p_pedido uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select to_jsonb(t) || jsonb_build_object(
    'pecas', coalesce((
      select jsonb_agg(to_jsonb(tp) || jsonb_build_object(
        'opcoes', coalesce((select jsonb_agg(to_jsonb(o) order by o.ordem) from public.troca_opcoes o where o.troca_peca_id = tp.id), '[]'::jsonb),
        'escolhas', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq) from public.troca_escolhas e where e.troca_peca_id = tp.id), '[]'::jsonb),
        'valores', coalesce((select jsonb_agg(to_jsonb(v)) from public.v_troca_valores v where v.troca_peca_id = tp.id), '[]'::jsonb),
        'carrinho', (select to_jsonb(c) from public.v_troca_carrinho c where c.troca_peca_id = tp.id),
        'coberto', (select cv.coberto from public.v_cobertura_troca_peca cv where cv.troca_peca_id = tp.id),
        'cliente_paga', (select (greatest(tp.resultado_diferenca, 0) - cv.coberto) from public.v_cobertura_troca_peca cv
                          where cv.troca_peca_id = tp.id and tp.resultado_diferenca is not null)
      ) order by tp.created_at) from public.troca_pecas tp where tp.troca_id = t.id), '[]'::jsonb),
    'resumo', (select to_jsonb(r) from public.v_troca_resumo r where r.troca_id = t.id))
  from public.trocas t
  where t.pedido_id = p_pedido and t.status in ('rascunho','enviada','respondida')
  limit 1
$$;
revoke all on function public.troca_painel(uuid) from public, anon;
grant execute on function public.troca_painel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Motivo dos descontos da Shopify (cupom, automático, manual, script; percentual ou valor)
-- ---------------------------------------------------------------------------
-- A sincronização guarda discountApplications dentro de shopify_bruto (consulta à parte). Aqui o banco
-- normaliza numa lista simples. Sem a chave no pedido bruto (consulta falhou), descontos fica como estava;
-- lista vazia [] quer dizer "a Shopify não aplicou desconto".
alter table public.pedidos add column descontos jsonb
  check (descontos is null or jsonb_typeof(descontos) = 'array');
comment on column public.pedidos.descontos is
  'Descontos da Shopify normalizados: [{tipo code|automatic|manual|script, rotulo, codigo, titulo, percentual, valor, alocacao, alvo}].';

create function public.normalizar_descontos(p_bruto jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_lista jsonb := p_bruto->'discountApplications';
  v_saida jsonb := '[]'::jsonb;
  d jsonb;
  v_tipo text;
  v_codigo text;
  v_titulo text;
  v_pct numeric;
  v_val numeric;
begin
  if v_lista is null or jsonb_typeof(v_lista) = 'null' then return null; end if;
  if jsonb_typeof(v_lista) = 'object' then
    v_lista := coalesce(v_lista->'nodes', (select jsonb_agg(x->'node') from jsonb_array_elements(coalesce(v_lista->'edges','[]'::jsonb)) x));
  end if;
  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then return null; end if;
  for d in select x from jsonb_array_elements(v_lista) x loop
    continue when jsonb_typeof(d) <> 'object';
    v_tipo := case lower(coalesce(d->>'__typename', d->>'tipo', ''))
      when 'discountcodeapplication' then 'code' when 'code' then 'code'
      when 'automaticdiscountapplication' then 'automatic' when 'automatic' then 'automatic'
      when 'manualdiscountapplication' then 'manual' when 'manual' then 'manual'
      when 'scriptdiscountapplication' then 'script' when 'script' then 'script'
      else case when d ? 'code' then 'code' else 'manual' end end;
    v_codigo := nullif(btrim(coalesce(d->>'code', '')), '');
    v_titulo := nullif(btrim(coalesce(d->>'title', d->>'titulo', '')), '');
    v_pct := case when jsonb_typeof(d->'value'->'percentage') in ('number','string') then (d->'value'->>'percentage')::numeric end;
    v_val := case when jsonb_typeof(d->'value'->'amount') in ('number','string') then (d->'value'->>'amount')::numeric end;
    v_saida := v_saida || jsonb_build_array(jsonb_build_object(
      'tipo', v_tipo,
      'rotulo', coalesce(v_codigo, v_titulo),
      'codigo', case when v_tipo = 'code' then coalesce(v_codigo, v_titulo) end,
      'titulo', case when v_tipo <> 'code' then v_titulo end,
      'percentual', v_pct,
      'valor', v_val,
      'alocacao', lower(d->>'allocationMethod'),
      'alvo', lower(d->>'targetType')));
  end loop;
  return v_saida;
end $$;
revoke all on function public.normalizar_descontos(jsonb) from public, anon, authenticated, service_role;

create function public.tg_descontos_shopify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.shopify_bruto is not null and new.shopify_bruto ? 'discountApplications' then
    new.descontos := public.normalizar_descontos(new.shopify_bruto);
  end if;
  return new;
end $$;
revoke all on function public.tg_descontos_shopify() from public, anon, authenticated, service_role;
create trigger pedidos_descontos_shopify before insert or update of shopify_bruto on public.pedidos
  for each row execute function public.tg_descontos_shopify();


-- ---------------------------------------------------------------------------
-- 6. v_pedidos: colunas novas no fim (cópia de 20261119090000_valor_pacote_frete.sql)
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
    'embalado',p.embalado_em,'postado',p.postado_em,'acerto',ap.pendente)) as etapas_permitidas,
  -- V13: valor declarado do pacote inteiro (pedido + vendas somadas), já com descontos e trocas.
  (coalesce((retr.r->>'valor_pecas_com_desconto')::numeric(10,2), coalesce(fx.v,a.subtotal-d.desconto-cb.v-pix.v)::numeric(10,2))
    + sm.valor)::numeric(10,2) as valor_pecas_pacote,
  -- V37/V38: etapa de origem do desvio; desconto sem a cobertura da loja (a cobertura vai à parte em
  -- troca_coberto); o percentual sobre o subtotal; e o motivo dos descontos da Shopify.
  p.etapa_antes_desvio,
  dsc.sem_cobertura as desconto_sem_cobertura,
  dpc.pct as desconto_percentual,
  p.descontos
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
) ph
cross join lateral (
  select greatest(0, coalesce((retr.r->>'desconto')::numeric(10,2),
      (case when fx.v is not null then a.subtotal-fx.v-pix.v else d.desconto+cb.v end)::numeric(10,2)) - cb.v)::numeric(10,2) as sem_cobertura,
    coalesce((retr.r->>'subtotal')::numeric(10,2), a.subtotal) as base
  offset 0
) dsc
cross join lateral (
  select (case when dsc.base > 0 then round(dsc.sem_cobertura * 100 / dsc.base, 1) end)::numeric(5,1) as pct offset 0
) dpc;

revoke all on public.v_pedidos from anon;
grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;
