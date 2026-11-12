-- V10: centavos do rateio. A Shopify manda o unitário com desconto já arredondado; quantidade x unitário
-- podia diferir alguns centavos do total cobrado (ARV-1273: -0,04). A função Edge agora manda o valor
-- exato de cada linha (valor_pago_linha), com o resíduo distribuído; aqui ele é gravado na importação
-- e completado nas sincronizações seguintes.

-- O valor exato só entra em peça viva, inteira (não dividida em falta parcial), da mesma linha, com a
-- mesma quantidade e sem troca. Peça retirada ou trocada mantém o valor que já valeu (histórico).
create function public.valor_linha_shopify(i public.pedido_itens, p_linha text, p_qtd int, p_valor numeric)
returns numeric language sql stable security invoker set search_path = public, pg_temp as $$
  select case when p_valor is not null and p_linha is not null and i.shopify_line_id = p_linha
      and i.qtd = p_qtd and i.status in ('pendente', 'encontrado', 'falta', 'defeito')
      and not exists (select 1 from public.troca_pecas tp where tp.item_id = i.id)
      and (select count(*) from public.pedido_itens y
            where y.pedido_id = i.pedido_id and y.shopify_line_id = p_linha) = 1
    then p_valor else i.valor_pago_linha end
$$;
revoke all on function public.valor_linha_shopify(public.pedido_itens, text, int, numeric) from public, anon, authenticated;
grant execute on function public.valor_linha_shopify(public.pedido_itens, text, int, numeric) to service_role;

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
                                foto_url, qtd, preco, preco_pago, valor_pago_linha, ordem)
      select v_id, 'shopify', (i->>'shopify_variant_id')::bigint, nullif(i->>'shopify_line_id', ''),
             i->>'sku', i->>'nome',
             i->>'variante', i->>'foto_url', (i->>'qtd')::int, (i->>'preco')::numeric,
             round(nullif(i->>'preco_pago', '')::numeric, 2),
             round(nullif(i->>'valor_pago_linha', '')::numeric, 2), ord::int
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
             round(nullif(x->>'valor_pago_linha', '')::numeric, 2) as valor_linha,
             nullif(x->>'qtd', '')::int as qtd,
             count(*) over (partition by nullif(x->>'shopify_variant_id', '')) as n_var
      from jsonb_array_elements(p->'itens') x
    )
    update pedido_itens i
       set preco_pago = s.pago,
           valor_pago_linha = public.valor_linha_shopify(i, s.linha, s.qtd, s.valor_linha),
           shopify_line_id = coalesce(i.shopify_line_id, s.linha)
      from src s
     where i.pedido_id = v_id and i.origem = 'shopify'
       and coalesce(i.observacao, '') not like 'troca de%'
       and s.pago is not null
       and ((s.linha is not null and i.shopify_line_id = s.linha)
            or (i.shopify_line_id is null and s.n_var = 1 and s.variante is not null
                and i.shopify_variant_id = s.variante
                and (select count(*) from pedido_itens y
                      where y.pedido_id = v_id and y.origem = 'shopify' and y.shopify_line_id is null
                        and coalesce(y.observacao, '') not like 'troca de%'
                        and y.shopify_variant_id = s.variante) = 1))
       and (i.preco_pago is distinct from s.pago or (i.shopify_line_id is null and s.linha is not null)
            or i.valor_pago_linha is distinct from public.valor_linha_shopify(i, s.linha, s.qtd, s.valor_linha));

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
          where l.pedido_id = v_id and l.origem = 'shopify' and coalesce(l.observacao, '') not like 'troca de%'
            and (l.shopify_line_id is not null
                 or not exists (select 1 from pedido_itens z where z.pedido_id = v_id and z.shopify_line_id is not null))
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
