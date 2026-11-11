-- Importação da Shopify: completa também número/cidade/UF/frete pago por/códigos de desconto em pedido
-- já importado e avisa (evento shopify_alterado) quando as quantidades mudaram na Shopify.

alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado']));

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
  v_mudou     boolean;
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
           or (valor_pago is null and nullif(p->>'valor_pago', '') is not null)
           or (rastreio is null and nullif(p->>'rastreio', '') is not null)
           or (rastreio_url is null and nullif(p->>'rastreio_url', '') is not null));

    -- Quantidade por variante/SKU diferente das peças originais da Shopify (inclui as removidas/trocadas pela equipe, para não dar alarme falso): avisa uma vez.
    if p ? 'itens' and not exists (select 1 from pedido_eventos where pedido_id = v_id and tipo = 'shopify_alterado') then
      select exists (
        select 1 from (
          select coalesce(i->>'shopify_variant_id', 'sku:' || coalesce(i->>'sku', '')) as chave, sum((i->>'qtd')::int) as qtd
          from jsonb_array_elements(p->'itens') i where (i->>'qtd')::int > 0 group by 1
        ) s full join (
          select coalesce(shopify_variant_id::text, 'sku:' || coalesce(sku, '')) as chave, sum(qtd) as qtd
          from pedido_itens where pedido_id = v_id and origem = 'shopify' group by 1
        ) l using (chave)
        where s.qtd is distinct from l.qtd
      ) into v_mudou;
      if v_mudou then
        insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
        values (v_id, 'shopify_alterado', 'As peças do pedido mudaram na Shopify depois da importação.', 'shopify');
      end if;
    end if;

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
