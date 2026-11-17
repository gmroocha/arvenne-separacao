-- Romaneio público: cada peça traz o total da linha (quantidade × valor unitário), calculado no banco.
-- A página da cliente mostra esse valor no visualizador das peças (foto grande, código, variante, quantidade,
-- valor unitário e total). Nada mais muda na função (mesmos campos, mesma privacidade).

CREATE OR REPLACE FUNCTION public.romaneio_publico(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v record;
  v_retrato jsonb;
begin
  select * into v from public.v_pedidos where token_publico = p_token;
  if not found then return null; end if;
  select somada_retrato into v_retrato from public.pedidos where id=v.id and status='somada';
  return jsonb_build_object(
    'numero',   v.numero,
    'cliente',  case when v.cliente_nome like '%@%' then null
                     else nullif(split_part(trim(coalesce(v.cliente_nome, '')), ' ', 1), '') end,
    'fase',     v.fase,
    'status',   v.status,
    -- 'total' da linha (qtd × preço) vem do banco: a página só mostra. Retrato da venda somada também ganha.
    'itens', coalesce((
      select jsonb_agg(e || jsonb_build_object('total', round((e->>'qtd')::numeric * (e->>'preco')::numeric, 2)) order by n)
      from jsonb_array_elements(v_retrato->'itens') with ordinality as r(e, n)), (
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'sku', i.sku, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco, 'total', round(i.qtd * i.preco, 2)) order by i.ordem)
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
end $function$;

revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated, service_role;
