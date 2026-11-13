-- V58: Shopify pode trazer e-mail no campo de nome; não expor em link público.
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
    'itens', coalesce(v_retrato->'itens', (
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
end $function$

revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated, service_role;
