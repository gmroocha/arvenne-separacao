-- Venda somada a um pedido (11/11/2026).
-- Quando a cliente quer mais peças num pedido que já existe, o processo começa por uma VENDA com "somar_em"
-- (o pedido principal). Ao marcar como paga (somar_venda), a venda vira 'somada' (arquivo) e as peças vivas
-- passam para o principal como "peças adicionais". O dinheiro fica em duas partes: o do principal não muda;
-- a venda guarda o retrato do valor (somada_valor) e a v_pedidos soma tudo em total_geral.
-- Nenhum pedido ou peça é apagado. Este projeto não dá GRANT automático: tudo que é novo leva GRANT explícito.

alter table public.pedido_itens
  add column adicional boolean not null default false,
  add column venda_origem_id uuid references public.pedidos (id);
alter table public.pedidos
  add column somar_em uuid references public.pedidos (id),
  add column somada_em timestamptz,
  add column somada_valor numeric(10,2);
alter table public.pedidos add constraint pedidos_somar_em_outro check (somar_em is null or somar_em <> id);
create index pedidos_somar_em on public.pedidos (somar_em) where somar_em is not null;
create index pedido_itens_venda_origem on public.pedido_itens (venda_origem_id) where venda_origem_id is not null;

-- Status novo 'somada' (última versão do check: avisar_cliente).
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'avisar_cliente', 'aguardando_cliente', 'conferencia', 'etiquetagem', 'bipagem',
  'faturamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado', 'somada'));

-- Evento novo 'venda_somada' (última versão do check: vistoria).
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado', 'troca_acerto',
  'devolvido', 'devolvido_desfeito', 'shopify_alerta', 'venda_somada']));

-- tg_pedidos_antes já trata 'somada' como saída da venda (valida peças e preenche pago_em): não muda.

-- ---------------------------------------------------------------------------
-- v_pedidos: mesmas colunas e ordem; novas no fim. As peças adicionais ficam FORA da base de dinheiro do
-- principal (subtotal, desconto, pago_vivo, Pix, fator da Shopify); contagens e fotos usam todas.
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
  sm.valor                                                                               as valor_somado,
  sm.pago                                                                                as valor_pago_somado,
  (tot.v + sm.valor)::numeric(10,2)                                                      as total_geral,
  sm.partes,
  p.somar_em,
  p.somada_em
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

-- ---------------------------------------------------------------------------
-- importar_pedido_shopify: a última versão (vistoria) ignorando as peças adicionais ao casar preço pago
-- e ao checar se a Shopify alterou as peças.
-- ---------------------------------------------------------------------------
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id        uuid;
  v_status    text;
  v_cancel    boolean := coalesce((p->>'cancelado')::boolean, false);
  v_reemb     boolean := coalesce((p->>'reembolsado')::boolean, false);
  v_desp      boolean := coalesce((p->>'despachado')::boolean, false);
  v_estimado  boolean := coalesce((p->>'pago_em_estimado')::boolean, false);
  v_codigos   text[];
  v_cupom     text;
  v_desc      numeric := nullif(p->>'desconto_valor', '')::numeric;
  v_frete     numeric := nullif(p->>'frete_cobrado', '')::numeric;
  v_titulo    text    := lower(coalesce(p->>'frete_titulo', ''));
  v_tipo      text;
  v_pagopor   text;
  v_mudou     boolean;
  v_cpf       text    := nullif(regexp_replace(coalesce(p->>'cliente_cpf', ''), '\D', '', 'g'), '');
  -- A sincronização nova manda o frete original e o cobrado já separados (valores exatos da Shopify).
  v_exato     boolean := p ? 'frete_original';
  v_fo        numeric := nullif(p->>'frete_original', '')::numeric;
  v_dfrete    numeric;
  v_total     numeric := nullif(p->>'valor_total', '')::numeric;
  v_pago      numeric := nullif(p->>'valor_pago', '')::numeric;
  v_n         int;
  v_texto     text;
begin
  select array_agg(x) into v_codigos from jsonb_array_elements_text(coalesce(p->'desconto_codigos', '[]'::jsonb)) x;
  v_cupom := nullif(array_to_string(v_codigos, ', '), '');
  if v_desc is not null and v_desc <= 0 then v_desc := null; end if;
  v_tipo := case
    when v_titulo = '' then null
    when v_titulo like '%sedex%' then 'SEDEX'
    when v_titulo like '%retirada%' then 'retirada'
    when v_titulo ~* '\mpac\M' then 'PAC'
    else 'outro' end;
  v_pagopor := case when v_frete is null then null when v_frete > 0 then 'cliente' else 'arvenne' end;
  v_dfrete := case when v_fo is not null and v_frete is not null then greatest(0, v_fo - v_frete) end;

  select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is null then
    -- Pedido novo: cancelado, reembolsado ou que já saiu antes de entrar no app não vira pedido.
    if v_cancel or v_reemb or v_desp then
      return false;
    end if;

    insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                         valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em, pago_em_estimado,
                         cliente_cpf, entrega_cep, entrega_logradouro, entrega_numero, entrega_complemento,
                         entrega_bairro, entrega_cidade, entrega_uf,
                         desconto_tipo, desconto_valor, desconto_codigos, cupom,
                         frete_cobrado, frete_tipo, frete_pago_por, frete_original, desconto_frete,
                         forma_pagamento, valor_pago, shopify_bruto, rastreio, rastreio_url)
    values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
            p->>'cliente_email', v_total,
            (p->>'shopify_order_id')::bigint, p->>'shopify_url',
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pedido_em')::timestamptz, now()),
            coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()),
            v_estimado or nullif(p->>'pago_em', '') is null,
            v_cpf,
            nullif(regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g'), ''),
            nullif(p->>'entrega_logradouro', ''), nullif(p->>'entrega_numero', ''),
            nullif(p->>'entrega_complemento', ''), nullif(p->>'entrega_bairro', ''),
            nullif(p->>'entrega_cidade', ''), nullif(p->>'entrega_uf', ''),
            case when v_desc is not null then 'valor' end, v_desc, v_codigos, v_cupom,
            v_frete, v_tipo, v_pagopor, v_fo, v_dfrete,
            nullif(p->>'forma_pagamento', ''), v_pago,
            p->'shopify_bruto', nullif(p->>'rastreio', ''), nullif(p->>'rastreio_url', ''))
    on conflict (shopify_order_id) do nothing
    returning id into v_id;

    if v_id is not null then
      insert into pedido_itens (pedido_id, origem, shopify_variant_id, shopify_line_id, sku, nome, variante,
                                foto_url, qtd, preco, preco_pago, ordem)
      select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, nullif(i->>'shopify_line_id', ''),
             i->>'sku', i->>'nome',
             i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
             round(nullif(i->>'preco_pago', '')::numeric, 2), ord::int
      from jsonb_array_elements(p->'itens') with ordinality as t(i, ord)
      where (i->>'qtd')::int > 0;
      return true;
    end if;

    -- Outra sincronização entrou na frente: segue como atualização, sem erro.
    select id, status into v_id, v_status from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;
    if v_id is null then return false; end if;
  end if;

  -- Já importado: completa só o que está nulo (a equipe pode ter editado), guarda a versão mais
  -- nova do pedido bruto e acompanha cancelamento, reembolso e despacho. Nunca volta etapa.
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
    valor_pago           = coalesce(valor_pago, v_pago),
    rastreio             = coalesce(rastreio, nullif(p->>'rastreio', '')),
    rastreio_url         = coalesce(rastreio_url, nullif(p->>'rastreio_url', ''))
  where id = v_id
    and ((cliente_cpf is null and v_cpf is not null)
         or (entrega_cep is null and nullif(p->>'entrega_cep', '') is not null)
         or (entrega_logradouro is null and nullif(p->>'entrega_logradouro', '') is not null)
         or (entrega_numero is null and nullif(p->>'entrega_numero', '') is not null)
         or (entrega_cidade is null and nullif(p->>'entrega_cidade', '') is not null)
         or (entrega_uf is null and nullif(p->>'entrega_uf', '') is not null)
         or (entrega_bairro is null and nullif(p->>'entrega_bairro', '') is not null)
         or (entrega_complemento is null and nullif(p->>'entrega_complemento', '') is not null)
         or (desconto_valor is null and v_desc is not null)
         or (cupom is null and v_cupom is not null)
         or (frete_cobrado is null and v_frete is not null)
         or (frete_tipo is null and v_tipo is not null)
         or (frete_pago_por is null and v_pagopor is not null)
         or (desconto_codigos is null and v_codigos is not null)
         or (forma_pagamento is null and nullif(p->>'forma_pagamento', '') is not null)
         or (valor_pago is null and v_pago is not null)
         or (rastreio is null and nullif(p->>'rastreio', '') is not null)
         or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

  -- Dados da Shopify (a equipe não edita): o valor atual vence a cada sincronização.
  if v_total is not null then
    update pedidos set valor_total = v_total, valor_pago = coalesce(v_pago, valor_pago)
    where id = v_id and (valor_total is distinct from v_total or valor_pago is distinct from coalesce(v_pago, valor_pago));
  end if;

  -- Data real do pagamento chegou depois de uma data estimada: corrige uma vez.
  if not v_estimado and nullif(p->>'pago_em', '') is not null then
    update pedidos set pago_em = (p->>'pago_em')::timestamptz, pago_em_estimado = false
    where id = v_id and pago_em_estimado;
  end if;

  if v_exato then
    -- frete_pago_por NÃO é sobrescrito: a equipe pode ter corrigido quem paga o frete.
    update pedidos set
      frete_cobrado  = coalesce(v_frete, frete_cobrado),
      frete_original = v_fo,
      desconto_frete = v_dfrete,
      desconto_tipo  = case when v_desc is not null then 'valor' end,
      desconto_valor = v_desc
    where id = v_id
      and (frete_cobrado is distinct from coalesce(v_frete, frete_cobrado)
           or frete_original is distinct from v_fo
           or desconto_frete is distinct from v_dfrete
           or desconto_valor is distinct from v_desc
           or desconto_tipo is distinct from case when v_desc is not null then 'valor' end);
  end if;

  if p ? 'itens' then
    -- Preço pago por linha da Shopify. Linhas antigas (sem id) casam pela variante só quando ela
    -- aparece uma vez no pedido da Shopify e uma vez no app.
    with src as (
      select nullif(x->>'shopify_line_id', '') as linha,
             nullif(x->>'shopify_variant_id', '')::bigint as variante,
             round(nullif(x->>'preco_pago', '')::numeric, 2) as pago,
             count(*) over (partition by nullif(x->>'shopify_variant_id', '')) as n_var
      from jsonb_array_elements(p->'itens') x
    )
    update pedido_itens i
       set preco_pago = s.pago,
           shopify_line_id = coalesce(i.shopify_line_id, s.linha)
      from src s
     where i.pedido_id = v_id and i.origem = 'shopify' and not i.adicional
       and coalesce(i.observacao, '') not like 'troca de%'
       and s.pago is not null
       and ((s.linha is not null and i.shopify_line_id = s.linha)
            or (i.shopify_line_id is null and s.n_var = 1 and s.variante is not null
                and i.shopify_variant_id = s.variante
                and (select count(*) from pedido_itens y
                      where y.pedido_id = v_id and y.origem = 'shopify' and not y.adicional and y.shopify_line_id is null
                        and coalesce(y.observacao, '') not like 'troca de%'
                        and y.shopify_variant_id = s.variante) = 1))
       and (i.preco_pago is distinct from s.pago or (i.shopify_line_id is null and s.linha is not null));

    -- Peça removida pela equipe (cliente desistiu) e reembolsada na Shopify: a linha voltou com quantidade 0.
    -- O valor_total atual já desconta; marca para sair do valor_removido e conta como devolvida.
    update pedido_itens i
       set reembolsado_shopify_em = now(),
           devolvido_em = coalesce(i.devolvido_em, now())
      from jsonb_array_elements(p->'itens') x
     where i.pedido_id = v_id and i.status = 'removido' and i.reembolsado_shopify_em is null
       and i.shopify_line_id is not null
       and i.shopify_line_id = nullif(x->>'shopify_line_id', '')
       and coalesce((x->>'qtd')::int, 0) = 0;

    -- Quantidade por variante/SKU diferente das peças da Shopify (inclui as removidas pela equipe, para não
    -- dar alarme falso; ignora peças de troca e as que a equipe acrescentou): avisa uma vez.
    if not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alterado') then
      select exists (
        select 1 from (
          select coalesce(i->>'shopify_variant_id', 'sku:' || coalesce(i->>'sku', '')) as chave, sum((i->>'qtd')::int) as qtd
          from jsonb_array_elements(p->'itens') i where (i->>'qtd')::int > 0 group by 1
        ) s full join (
          select coalesce(shopify_variant_id::text, 'sku:' || coalesce(sku, '')) as chave, sum(qtd) as qtd
          from pedido_itens l
          where l.pedido_id = v_id and l.origem = 'shopify' and not l.adicional and coalesce(l.observacao, '') not like 'troca de%'
            and (l.shopify_line_id is not null
                 or not exists (select 1 from pedido_itens z where z.pedido_id = v_id and not z.adicional and z.shopify_line_id is not null))
          group by 1
        ) l using (chave)
        where s.qtd is distinct from l.qtd
      ) into v_mudou;
      if v_mudou then
        insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
        values (v_id, 'shopify_alterado', 'As peças do pedido mudaram na Shopify depois da importação.', 'shopify');
      end if;
    end if;
  end if;

  if p ? 'shopify_bruto' then
    update pedidos set shopify_bruto = p->'shopify_bruto'
    where id = v_id and shopify_bruto is distinct from p->'shopify_bruto';
  end if;

  if v_cancel or v_reemb then
    update pedidos set status = 'cancelado'
    where id = v_id and status not in ('cancelado', 'enviado');
    get diagnostics v_n = row_count;
    if v_reemb then
      -- Aviso uma vez só (a sincronização repete a cada poucos minutos).
      v_texto := case
        when v_n > 0 then 'Pedido reembolsado na Shopify: cancelado automaticamente.'
        when v_status = 'enviado' then 'Pedido reembolsado na Shopify, mas já foi enviado. Confira.'
        else 'Pedido reembolsado na Shopify.' end;
      insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
      select v_id, 'shopify_alerta', v_texto, 'shopify'
      where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                         and texto like 'Pedido reembolsado na Shopify%');
    end if;
  elsif v_desp and v_status in ('embalagem', 'pronto_envio') then
    update pedidos set status = 'enviado',
           postado_em = coalesce(postado_em, nullif(p->>'postado_em', '')::timestamptz, now())
    where id = v_id and status in ('embalagem', 'pronto_envio');
  elsif v_desp and v_status not in ('enviado', 'cancelado', 'perdida', 'em_aberto', 'aguardando_pagamento') then
    -- Despachado na Shopify antes de chegar à embalagem: não move o pedido, só avisa (uma vez).
    v_texto := 'A Shopify marcou este pedido como enviado, mas ele ainda está em "' || v_status || '". Confira.';
    insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
    select v_id, 'shopify_alerta', v_texto, 'shopify'
    where not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alerta'
                       and texto like 'A Shopify marcou este pedido como enviado%');
  end if;
  return false;
end $$;

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- romaneio_publico: itens do pedido (sem as adicionais), adicionais à parte, total geral e, na venda
-- somada, o número do pedido principal.
-- ---------------------------------------------------------------------------
create or replace function public.romaneio_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
begin
  select * into v from public.v_pedidos where token_publico = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'numero',   v.numero,
    'cliente',  nullif(split_part(trim(coalesce(v.cliente_nome, '')), ' ', 1), ''),
    'fase',     v.fase,
    'status',   v.status,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'sku', i.sku, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
      from public.pedido_itens i
      where i.pedido_id = v.id and i.status <> 'removido' and not i.adicional), '[]'::jsonb),
    'adicionais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'sku', i.sku, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
      from public.pedido_itens i
      where i.pedido_id = v.id and i.status <> 'removido' and i.adicional), '[]'::jsonb),
    'subtotal',      v.subtotal,
    'desconto',      v.desconto,
    'desconto_pix',  v.desconto_pix,
    'cupom',         v.cupom,
    'frete_tipo',    v.frete_tipo,
    'frete_cobrado', v.frete_na_conta,
    'total',         v.total,
    'valor_somado',  v.valor_somado,
    'total_geral',   v.total_geral,
    'somada_a',      (select s.numero from public.pedidos s where s.id = v.somar_em and v.status = 'somada')
  );
end $$;
revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- somar_venda: marca a venda como paga e soma as peças ao pedido principal.
-- ---------------------------------------------------------------------------
create or replace function public.somar_venda(p_venda uuid, p_forma text, p_valor numeric, p_pago_em timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v      public.pedidos%rowtype;
  pr     public.pedidos%rowtype;
  vv     record;
  v_fator numeric;
  v_base int;
begin
  select * into v from public.pedidos where id = p_venda for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.status = 'somada' then raise exception 'Esta venda já foi somada a um pedido'; end if;
  if v.status not in ('em_aberto', 'aguardando_pagamento') then
    raise exception 'Esta venda não está aberta (está %)', v.status;
  end if;
  if v.somar_em is null then raise exception 'Escolha o pedido ao qual somar esta venda'; end if;
  if p_forma is null or btrim(p_forma) = '' then raise exception 'Informe a forma de pagamento'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor pago'; end if;

  select * into pr from public.pedidos where id = v.somar_em for update;
  if not found then raise exception 'Pedido principal não encontrado'; end if;
  if pr.status in ('enviado', 'cancelado', 'perdida', 'somada', 'em_aberto', 'aguardando_pagamento') then
    raise exception 'O pedido % está % e não aceita mais peças', pr.numero, pr.status;
  end if;

  -- 1) Pagamento na venda (ainda aberta, para a view calcular o Pix e o desconto da venda).
  update public.pedidos
     set forma_pagamento = p_forma, valor_pago = p_valor, pago_em = coalesce(p_pago_em, now())
   where id = p_venda;
  select valor_pecas_com_desconto, subtotal into vv from public.v_pedidos where id = p_venda;
  v_fator := case when coalesce(vv.subtotal, 0) > 0 then vv.valor_pecas_com_desconto / vv.subtotal else 1 end;

  -- 2) Venda somada, com as peças ainda nela (o gatilho valida peças e preços ao sair da venda).
  update public.pedidos
     set status = 'somada', somada_em = now(), somada_valor = vv.valor_pecas_com_desconto
   where id = p_venda;

  -- 3) Peças vivas vão para o principal como adicionais, com o preço já com o desconto da venda.
  select coalesce(max(ordem), 0) into v_base from public.pedido_itens where pedido_id = pr.id;
  with mover as (
    select id, row_number() over (order by ordem, created_at) as n
    from public.pedido_itens where pedido_id = p_venda and status <> 'removido'
  )
  update public.pedido_itens i
     set pedido_id = pr.id, adicional = true, venda_origem_id = p_venda, ordem = v_base + m.n,
         preco_pago = coalesce(i.preco_pago, round(coalesce(i.preco, 0) * v_fator, 2))
    from mover m
   where i.id = m.id;

  -- 4) Principal que já passou da separação volta para ela (as peças novas precisam ser separadas).
  if pr.status in ('conferencia', 'etiquetagem', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio') then
    update public.pedidos set status = 'separacao' where id = pr.id;
  end if;

  -- A tela não escreve eventos 'venda_somada' (RLS só deixa nota/reiniciado): por isso a função é security
  -- definer; o GRANT abaixo é só para authenticated.
  insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (pr.id, 'venda_somada', 'Venda ' || v.numero || ' somada a este pedido.', public.usuario_atual_email()),
         (p_venda, 'venda_somada', 'Somada ao pedido ' || pr.numero || '.', public.usuario_atual_email());
end $$;
revoke all on function public.somar_venda(uuid, text, numeric, timestamptz) from public, anon;
grant execute on function public.somar_venda(uuid, text, numeric, timestamptz) to authenticated;

-- adicionar_itens, mudar_qtd: ficam como estão (a versão anterior desta migration, nunca aplicada, foi retirada).
