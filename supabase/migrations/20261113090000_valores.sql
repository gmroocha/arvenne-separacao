-- Fase 1 da auditoria: dinheiro e dados.
-- (a) total do pedido depois de uma troca; (b) valores nunca negativos;
-- (c) venda sem peça/sem preço não entra na expedição; (d) CPF/CEP/telefone só com dígitos.

-- ---------------------------------------------------------------------------
-- (a) v_pedidos: no pedido da Shopify o total é fixo (o que a Shopify cobrou) e passa a somar
-- a diferença das trocas concluídas. Só a coluna "total" muda; colunas e ordem são as mesmas.
-- ---------------------------------------------------------------------------
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
  -- Pedido da Shopify: o que a Shopify cobrou mais a diferença das trocas concluídas. Venda manual: soma das peças.
  case when c.origem = 'shopify' and c.valor_total is not null then
         c.valor_total + coalesce((
           select sum(tp.resultado_diferenca) from public.troca_pecas tp
           join public.trocas t on t.id = tp.troca_id
           where t.pedido_id = c.id and tp.concluida_em is not null), 0)
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

-- ---------------------------------------------------------------------------
-- (a) troca_concluir_peca: mantém o total do pedido igual ao anunciado à cliente.
-- ---------------------------------------------------------------------------
create or replace function public.troca_concluir_peca(
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
  v_p_ped pedidos%rowtype;
  v_alvo numeric;
  v_sub numeric;
  v_pix numeric;
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

  -- Total anunciado = valor das peças (com desconto) antes da troca + diferença da troca.
  select * into v_p_ped from pedidos where id = v_t.pedido_id for update;
  select valor_pecas_com_desconto + v_valor.diferenca into v_alvo from v_pedidos where id = v_t.pedido_id;

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

-- ---------------------------------------------------------------------------
-- (b) Valores nunca negativos. NOT VALID + VALIDATE: não trava a tabela por muito tempo.
-- ---------------------------------------------------------------------------
alter table public.pedido_itens add constraint pedido_itens_preco_nao_negativo check (preco >= 0) not valid;
alter table public.pedidos add constraint pedidos_desconto_valor_nao_negativo check (desconto_valor >= 0) not valid;
alter table public.pedidos add constraint pedidos_frete_cobrado_nao_negativo check (frete_cobrado >= 0) not valid;
alter table public.pedidos add constraint pedidos_frete_custo_nao_negativo check (frete_custo >= 0) not valid;
alter table public.pedidos add constraint pedidos_valor_pago_nao_negativo check (valor_pago >= 0) not valid;
alter table public.troca_opcoes add constraint troca_opcoes_preco_nao_negativo check (preco >= 0) not valid;
alter table public.pedido_itens validate constraint pedido_itens_preco_nao_negativo;
alter table public.pedidos validate constraint pedidos_desconto_valor_nao_negativo;
alter table public.pedidos validate constraint pedidos_frete_cobrado_nao_negativo;
alter table public.pedidos validate constraint pedidos_frete_custo_nao_negativo;
alter table public.pedidos validate constraint pedidos_valor_pago_nao_negativo;
alter table public.troca_opcoes validate constraint troca_opcoes_preco_nao_negativo;

-- ---------------------------------------------------------------------------
-- (c) Venda sem peça ou com peça sem preço não entra na expedição.
-- ---------------------------------------------------------------------------
create or replace function public.tg_pedidos_antes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.numero is null or new.numero = '' then
      new.numero := 'W' || lpad(nextval('public.pedido_whatsapp_seq')::text, 4, '0');
    end if;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_desde := now();
      if old.status in ('em_aberto', 'aguardando_pagamento')
         and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
        if not exists (select 1 from public.pedido_itens where pedido_id = new.id and status <> 'removido') then
          raise exception 'A venda não tem nenhuma peça. Adicione as peças antes de marcar como paga.';
        end if;
        if exists (select 1 from public.pedido_itens
                   where pedido_id = new.id and status <> 'removido' and preco is null) then
          raise exception 'Há peça sem preço. Informe o preço de todas as peças antes de marcar como paga.';
        end if;
      end if;
    end if;
  end if;
  if new.pago_em is null
     and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
    new.pago_em := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (d) CPF, CEP e telefone já salvos: só dígitos. Telefone com 55 + DDD + número perde o 55.
-- ---------------------------------------------------------------------------
update public.pedidos set
  cliente_cpf = nullif(regexp_replace(cliente_cpf, '\D', '', 'g'), ''),
  entrega_cep = nullif(regexp_replace(entrega_cep, '\D', '', 'g'), ''),
  cliente_telefone = case
    when regexp_replace(cliente_telefone, '\D', '', 'g') ~ '^55\d{10,11}$'
      then substr(regexp_replace(cliente_telefone, '\D', '', 'g'), 3)
    else nullif(regexp_replace(cliente_telefone, '\D', '', 'g'), '') end
where cliente_cpf ~ '\D' or entrega_cep ~ '\D' or cliente_telefone ~ '\D'
   or cliente_telefone ~ '^55\d{10,11}$' or cliente_cpf = '' or entrega_cep = '' or cliente_telefone = '';

update public.clientes set
  cpf = nullif(regexp_replace(cpf, '\D', '', 'g'), ''),
  cep = nullif(regexp_replace(cep, '\D', '', 'g'), ''),
  telefone = case
    when regexp_replace(telefone, '\D', '', 'g') ~ '^55\d{10,11}$'
      then substr(regexp_replace(telefone, '\D', '', 'g'), 3)
    else nullif(regexp_replace(telefone, '\D', '', 'g'), '') end
where cpf ~ '\D' or cep ~ '\D' or telefone ~ '\D'
   or telefone ~ '^55\d{10,11}$' or cpf = '' or cep = '' or telefone = '';
