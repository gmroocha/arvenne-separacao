-- Esteira de expedição: etapas Etiquetagem e Bipagem, dados de nota e frete, rastreio e histórico
-- de leituras do leitor de código. Nada é apagado: o pedido da Shopify é guardado inteiro.
--
-- Fluxo: novo → separacao → conferencia → etiquetagem → bipagem → faturamento ("Nota e frete")
--        → embalagem → pronto_envio ("Postagem") → enviado.  aguardando_cliente é desvio.

-- ---------------------------------------------------------------------------
-- 1. Etapas novas
-- ---------------------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'aguardando_cliente', 'conferencia', 'etiquetagem', 'bipagem',
  'faturamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado'));

-- ---------------------------------------------------------------------------
-- 2. Peças: etiquetagem e bipagem
-- ---------------------------------------------------------------------------
alter table public.pedido_itens
  add column etiquetado_em   timestamptz,
  add column etiqueta_previa boolean not null default false,  -- "já tinha etiqueta"
  add column qtd_bipada      int not null default 0 check (qtd_bipada >= 0),
  add column bipado_em       timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Pedidos: nota, frete, rastreio, fornecedor, etapas físicas, cupom e o pedido bruto
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column nf_numero                text,
  add column nf_emitida_em            timestamptz,
  add column frete_gerado_em          timestamptz,
  add column frete_servico            text,
  add column rastreio_url             text,
  add column pedido_fornecedor_numero text,
  add column pedido_fornecedor_em     timestamptz,
  add column embalado_em              timestamptz,
  add column postado_em               timestamptz,
  add column rastreio_enviado_em      timestamptz,
  add column desconto_codigos         text[],
  add column shopify_bruto            jsonb;
-- cliente_cpf guarda CPF ou CNPJ (só dígitos).

-- ---------------------------------------------------------------------------
-- 4. Histórico de leituras do leitor de código
-- ---------------------------------------------------------------------------
create table public.bipagens (
  id             bigint generated always as identity primary key,
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  item_id        uuid references public.pedido_itens(id) on delete set null,
  codigo         text not null,
  resultado      text not null check (resultado in ('ok', 'fora_do_pedido', 'excedente')),
  usuario_email  text default public.usuario_atual_email(),
  created_at     timestamptz not null default now()
);
create index bipagens_pedido on public.bipagens (pedido_id, created_at);

alter table public.bipagens enable row level security;
create policy equipe_le   on public.bipagens for select to authenticated using (true);
create policy equipe_cria on public.bipagens for insert to authenticated with check (true);

grant select, insert on public.bipagens to authenticated;
grant select, insert on public.bipagens to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. v_pedidos recriada. shopify_bruto fica de fora de propósito (é grande; as listas leem tudo).
-- ---------------------------------------------------------------------------
drop view public.v_pedidos;

create view public.v_pedidos
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
       then public.horas_uteis(now(), public.prazo_envio(c.pago_em)) end                  as prazo_horas_uteis
from calc c;

grant select on public.v_pedidos to authenticated;
grant select on public.v_pedidos to service_role;

-- ---------------------------------------------------------------------------
-- 6. Importação da Shopify
-- ---------------------------------------------------------------------------
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id        uuid;
  v_status    text;
  v_cancel    boolean := coalesce((p->>'cancelado')::boolean, false);
  v_desp      boolean := coalesce((p->>'despachado')::boolean, false);
  v_codigos   text[];
  v_cupom     text;
  v_desc      numeric := nullif(p->>'desconto_valor', '')::numeric;
  v_frete     numeric := nullif(p->>'frete_cobrado', '')::numeric;
  v_titulo    text    := lower(coalesce(p->>'frete_titulo', ''));
  v_tipo      text;
  v_pagopor   text;
  v_cpf       text    := nullif(regexp_replace(coalesce(p->>'cliente_cpf', ''), '\D', '', 'g'), '');
begin
  select array_agg(x) into v_codigos from jsonb_array_elements_text(coalesce(p->'desconto_codigos', '[]'::jsonb)) x;
  v_cupom := nullif(array_to_string(v_codigos, ', '), '');
  if v_desc is not null and v_desc <= 0 then v_desc := null; end if;
  v_tipo := case
    when v_titulo = '' then null
    when v_titulo like '%sedex%' then 'SEDEX'
    when v_titulo like '%pac%' then 'PAC'
    when v_titulo like '%retirada%' then 'retirada'
    else 'outro' end;
  v_pagopor := case when v_frete is null then null when v_frete > 0 then 'cliente' else 'arvenne' end;

  select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is not null then
    -- Já importado: completa só o que está nulo (a equipe pode ter editado), guarda a versão mais
    -- nova do pedido bruto e acompanha cancelamento e despacho. Nunca volta etapa.
    update pedidos set
      cliente_cpf          = coalesce(cliente_cpf, v_cpf),
      entrega_cep          = coalesce(entrega_cep, nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), '')),
      entrega_logradouro   = coalesce(entrega_logradouro, nullif(p->>'entrega_logradouro', '')),
      entrega_numero       = coalesce(entrega_numero, nullif(p->>'entrega_numero', '')),
      entrega_complemento  = coalesce(entrega_complemento, nullif(p->>'entrega_complemento', '')),
      entrega_bairro       = coalesce(entrega_bairro, nullif(p->>'entrega_bairro', '')),
      entrega_cidade       = coalesce(entrega_cidade, nullif(p->>'entrega_cidade', '')),
      entrega_uf           = coalesce(entrega_uf, nullif(p->>'entrega_uf', '')),
      desconto_tipo        = case when desconto_tipo is null and v_desc is not null then 'valor' else desconto_tipo end,
      desconto_valor       = coalesce(desconto_valor, v_desc),
      desconto_codigos     = coalesce(desconto_codigos, v_codigos),
      cupom                = coalesce(cupom, v_cupom),
      frete_cobrado        = coalesce(frete_cobrado, v_frete),
      frete_tipo           = coalesce(frete_tipo, v_tipo),
      frete_pago_por       = coalesce(frete_pago_por, v_pagopor),
      forma_pagamento      = coalesce(forma_pagamento, nullif(p->>'forma_pagamento', '')),
      valor_pago           = coalesce(valor_pago, nullif(p->>'valor_pago', '')::numeric),
      rastreio             = coalesce(rastreio, nullif(p->>'rastreio', '')),
      rastreio_url         = coalesce(rastreio_url, nullif(p->>'rastreio_url', ''))
    where id = v_id
      and ((cliente_cpf is null and v_cpf is not null)
           or (entrega_cep is null and nullif(p->>'entrega_cep', '') is not null)
           or (entrega_logradouro is null and nullif(p->>'entrega_logradouro', '') is not null)
           or (entrega_bairro is null and nullif(p->>'entrega_bairro', '') is not null)
           or (entrega_complemento is null and nullif(p->>'entrega_complemento', '') is not null)
           or (desconto_valor is null and v_desc is not null)
           or (cupom is null and v_cupom is not null)
           or (frete_cobrado is null and v_frete is not null)
           or (frete_tipo is null and v_tipo is not null)
           or (forma_pagamento is null and nullif(p->>'forma_pagamento', '') is not null)
           or (valor_pago is null and nullif(p->>'valor_pago', '') is not null)
           or (rastreio is null and nullif(p->>'rastreio', '') is not null)
           or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

    if p ? 'shopify_bruto' then
      update pedidos set shopify_bruto = p->'shopify_bruto'
      where id = v_id and shopify_bruto is distinct from p->'shopify_bruto';
    end if;

    if v_cancel then
      update pedidos set status = 'cancelado'
      where id = v_id and status not in ('cancelado', 'enviado');
    elsif v_desp and v_status in ('embalagem', 'pronto_envio') then
      update pedidos set status = 'enviado',
             postado_em = coalesce(postado_em, nullif(p->>'postado_em', '')::timestamptz, now())
      where id = v_id and status in ('embalagem', 'pronto_envio');
    end if;
    return false;
  end if;

  -- Pedido novo: cancelado ou que já saiu antes de entrar no app não vira pedido.
  if v_cancel or v_desp then
    return false;
  end if;

  insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                       valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em,
                       cliente_cpf, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                       entrega_bairro, entrega_cidade, entrega_uf,
                       desconto_tipo, desconto_valor, desconto_codigos, cupom,
                       frete_cobrado, frete_tipo, frete_pago_por,
                       forma_pagamento, valor_pago, shopify_bruto, rastreio, rastreio_url)
  values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
          p->>'cliente_email', (p->>'valor_total')::numeric,
          (p->>'shopify_order_id')::bigint, p->>'shopify_url',
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()),
          v_cpf,
          nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), ''),
          nullif(p->>'entrega_logradouro', ''), nullif(p->>'entrega_numero', ''),
          nullif(p->>'entrega_complemento', ''), nullif(p->>'entrega_bairro', ''),
          nullif(p->>'entrega_cidade', ''), nullif(p->>'entrega_uf', ''),
          case when v_desc is not null then 'valor' end, v_desc, v_codigos, v_cupom,
          v_frete, v_tipo, v_pagopor,
          nullif(p->>'forma_pagamento', ''), nullif(p->>'valor_pago', '')::numeric,
          p->'shopify_bruto', nullif(p->>'rastreio', ''), nullif(p->>'rastreio_url', ''))
  returning id into v_id;

  insert into pedido_itens (pedido_id, origem, shopify_variant_id, sku, nome, variante,
                            foto_url, qtd, preco, ordem)
  select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, i->>'sku', i->>'nome',
         i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
         ord::int
  from jsonb_array_elements(p->'itens') with ordinality as t(i, ord)
  where (i->>'qtd')::int > 0;

  return true;
end $$;

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;
