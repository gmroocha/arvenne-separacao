-- Histórico só do que importa (pedido do Gustavo, 17/11/2026).
-- Montando uma venda (em aberto / aguardando pagamento) a equipe testa quantidade, preço e tira peças: isso não
-- é mudança real e não precisa ficar no histórico. Depois de marcada como paga, tudo continua registrado
-- (é o que serve para medir tempos e conferir trocas). Etapas, pagamento e status continuam sempre registrados.

-- 1) Peças de venda ainda não paga não geram evento de peça (quantidade, preço, retirada).
CREATE OR REPLACE FUNCTION public.tg_itens_depois()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quem  text := public.usuario_atual_email();
  v_texto text := concat_ws(' · ', new.sku, new.nome, new.variante);
begin
  if exists (select 1 from public.pedidos where id = new.pedido_id and status in ('em_aberto', 'aguardando_pagamento')) then
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'item', old.status, new.status, v_texto, v_quem);
  end if;

  if new.conferido_em is distinct from old.conferido_em
     and (new.conferido_em is null) <> (old.conferido_em is null) then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
    values (new.pedido_id, new.id, case when new.conferido_em is null then 'desconferida' else 'conferida' end, v_texto, v_quem);
  end if;

  if new.etiquetado_em is distinct from old.etiquetado_em
     and (new.etiquetado_em is null) <> (old.etiquetado_em is null) then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, texto, usuario_email)
    values (new.pedido_id, new.id,
            case when new.etiquetado_em is null then 'desetiquetada' else 'etiquetada' end,
            case when new.etiqueta_previa then v_texto || ' (já tinha etiqueta)' else v_texto end, v_quem);
  end if;

  if new.qtd_bipada is distinct from old.qtd_bipada then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'bipada', old.qtd_bipada::text, new.qtd_bipada::text, v_texto, v_quem);
  end if;

  if new.qtd is distinct from old.qtd then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'qtd', old.qtd::text, new.qtd::text, v_texto, v_quem);
  end if;

  if new.preco is distinct from old.preco then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'preco', old.preco::text, new.preco::text, v_texto, v_quem);
  end if;

  return null;
end $function$;

-- 2) "Peças trocadas e removidas": quantidade reduzida só conta depois de marcar como paga, olhando a venda
--    onde a mudança aconteceu (antes, ajustes feitos montando uma venda somada apareciam no pedido principal).
create or replace view public.v_pedido_alteracoes with (security_invoker = true) as
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
  -- Quantidade reduzida não entra no "a devolver" da v_pedidos (só "cliente desistiu"): aqui também não.
  null::numeric(12,2),
  null::timestamptz
from public.pedido_eventos e
join public.pedido_itens i on i.id = e.item_id
-- Pedido onde a mudança aconteceu (numa venda somada, a venda de origem; não o pedido que recebeu as peças).
join public.pedidos ep on ep.id = e.pedido_id
join public.v_item_liquido li on li.id = i.id
where e.tipo = 'qtd' and e.de ~ '^\d+$' and e.para ~ '^\d+$' and e.para::int < e.de::int
  and i.status <> 'removido' and ep.pago_em is not null
  -- Depois de MARCAR como pago (o "pago em" informado pode ser um dia antes, e a montagem da venda não conta).
  and e.created_at >= coalesce((select min(x.created_at) from public.pedido_eventos x
                                 where x.pedido_id = e.pedido_id and x.tipo = 'pago'), ep.pago_em);
revoke all on public.v_pedido_alteracoes from public, anon;
grant select on public.v_pedido_alteracoes to authenticated, service_role;

-- 3) Limpeza: eventos de peça (quantidade, preço, retirada) de vendas do WhatsApp registrados enquanto a venda
--    era montada (antes de marcar como paga; ou venda nunca paga). Etapas, pagamento e status ficam.
delete from public.pedido_eventos e
 using public.pedidos p
 where p.id = e.pedido_id
   and p.origem = 'whatsapp'
   and e.tipo in ('qtd', 'preco', 'item')
   and (
     (not exists (select 1 from public.pedido_eventos x where x.pedido_id = p.id and x.tipo = 'pago')
       and p.status in ('em_aberto', 'aguardando_pagamento', 'perdida'))
     or e.created_at < (select min(x.created_at) from public.pedido_eventos x where x.pedido_id = p.id and x.tipo = 'pago')
   );
