-- Troca: só as peças que ainda estão em falta (ou já trocadas) contam.
--
-- Problema (12/11, pedido ARV-1274): uma peça entrou na troca quando estava em falta e depois voltou a
-- "pendente" (desfeita ou falta parcial em outra linha). A peça continuava na troca: a cliente via
-- "Peça 4 de 4 · ficou sem estoque" de uma peça que não faltava mais, e o resumo somava o valor dela.
--
-- Correção sem apagar nada: a peça da troca fica guardada (com as opções e escolhas) e só deixa de
-- aparecer/contar enquanto o item não estiver em falta/defeito. Se voltar a faltar, reaparece igual.
--   1. v_troca_resumo: conta só as peças ativas (em falta/defeito, ou já concluídas).
--   2. troca_publica: mesmo filtro + valor_pago_unit (valor pago por UMA unidade, para a página da
--      cliente mostrar "3 unidades de R$ 42,24" em vez de só o total).

-- ---------------------------------------------------------------------------
-- 1. v_troca_resumo
-- ---------------------------------------------------------------------------
create or replace view public.v_troca_resumo with (security_invoker = true) as
select r.troca_id, r.pedido_id, r.pecas_total, r.pecas_respondidas, r.total_pago,
       (r.bruta - cv.v)::numeric                                   as diferenca_total,
       r.bruta::numeric                                            as diferenca_bruta,
       cv.v::numeric(10,2)                                         as coberto,
       r.cobrir_ate
from (
  select t.id as troca_id, t.pedido_id,
         count(p.id)::integer as pecas_total,
         count(p.escolha_tipo)::integer as pecas_respondidas,
         coalesce(sum(c.valor_pago_item), 0) as total_pago,
         coalesce(sum(case
           when p.escolha_tipo = 'credito' then c.diferenca
           when p.escolha_tipo = 'opcao' then coalesce(x.diferenca, 0)
           else 0 end), 0) as bruta,
         t.cobrir_ate
  from public.trocas t
  left join public.troca_pecas p on p.troca_id = t.id
        and (p.concluida_em is not null
             or exists (select 1 from public.pedido_itens pi
                         where pi.id = p.item_id and pi.status in ('falta', 'defeito')))
  left join public.v_troca_valores c on c.troca_peca_id = p.id and c.tipo = 'credito'
  left join public.v_troca_carrinho x on x.troca_peca_id = p.id
  group by t.id, t.pedido_id, t.cobrir_ate
) r
cross join lateral (
  select case when r.bruta > 0 then least(r.bruta, r.cobrir_ate) else 0 end as v
) cv;

revoke all on public.v_troca_resumo from anon;
grant select on public.v_troca_resumo to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. troca_publica
-- ---------------------------------------------------------------------------
create or replace function public.troca_publica(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_numero text;
  v_cliente text;
  v_nome text;
  v_res record;
begin
  select * into v_t from trocas where token = p_token and status not in ('rascunho', 'cancelada');
  if not found then return null; end if;
  select p.numero, p.cliente_nome into v_numero, v_cliente from v_pedidos p where p.id = v_t.pedido_id;
  select * into v_res from v_troca_resumo where troca_id = v_t.id;
  v_nome := nullif(split_part(coalesce(v_cliente, ''), ' ', 1), '');
  if v_nome like '%@%' then v_nome := null; end if;
  return jsonb_build_object(
    'numero', v_numero,
    'cliente', v_nome,
    'status', v_t.status,
    'resumo', jsonb_build_object(
      'total_pago', coalesce(v_res.total_pago, 0),
      'diferenca', coalesce(v_res.diferenca_total, 0),
      'diferenca_bruta', coalesce(v_res.diferenca_bruta, 0),
      'coberto', coalesce(v_res.coberto, 0),
      'cobrir_ate', coalesce(v_res.cobrir_ate, 0),
      'pecas_total', coalesce(v_res.pecas_total, 0),
      'pecas_respondidas', coalesce(v_res.pecas_respondidas, 0)),
    'pecas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'foto_url', i.foto_url, 'nome', i.nome, 'variante', i.variante,
        'sku', i.sku, 'qtd', i.qtd,
        'valor_pago_unit', round(coalesce(i.preco_pago, coalesce(i.preco, 0) * v_t.fator_desconto), 2),
        'valor_pago', coalesce((select c.valor_pago_item from v_troca_valores c
                                 where c.troca_peca_id = p.id and c.tipo = 'credito'), 0),
        'escolha_tipo', p.escolha_tipo,
        'escolha_opcao_id', p.escolha_opcao_id,
        'escolha_equipe', p.escolhida_por = 'equipe',
        'concluida', p.concluida_em is not null,
        'resultado', p.resultado_diferenca,
        'carrinho', coalesce((
          select jsonb_agg(jsonb_build_object('opcao_id', e.opcao_id, 'qtd', e.qtd) order by e.seq)
          from troca_escolhas e where e.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), '[]'::jsonb),
        'valor_escolhido', coalesce((select c.valor_escolhido from v_troca_carrinho c
                                      where c.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), 0),
        'unidades', coalesce((select c.unidades from v_troca_carrinho c
                               where c.troca_peca_id = p.id and p.escolha_tipo = 'opcao'), 0),
        'nova', (select jsonb_build_object('foto_url', o.foto_url, 'nome', o.nome,
                                           'variante', o.variante, 'sku', o.sku)
                   from troca_opcoes o
                  where o.id = p.escolha_opcao_id and p.escolha_tipo = 'opcao'),
        'novas', coalesce((
          select jsonb_agg(jsonb_build_object('foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante,
                                              'sku', o.sku, 'qtd', e.qtd) order by e.seq)
          from troca_escolhas e join troca_opcoes o on o.id = e.opcao_id
          where e.troca_peca_id = p.id and p.escolha_tipo = 'opcao' and p.concluida_em is not null), '[]'::jsonb),
        'opcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante, 'sku', o.sku,
            'valor', x.valor_opcao, 'diferenca', x.diferenca, 'situacao', x.situacao,
            'valor_unit', x.valor_unit)
            order by o.ordem, o.created_at)
          from troca_opcoes o
          join v_troca_valores x on x.opcao_id = o.id
          where o.troca_peca_id = p.id), '[]'::jsonb)
      ) order by i.ordem, p.created_at)
      from troca_pecas p
      join pedido_itens i on i.id = p.item_id
      where p.troca_id = v_t.id
        and (p.concluida_em is not null or i.status in ('falta', 'defeito'))), '[]'::jsonb));
end $$;
revoke all on function public.troca_publica(uuid) from public;
grant execute on function public.troca_publica(uuid) to anon, authenticated;
