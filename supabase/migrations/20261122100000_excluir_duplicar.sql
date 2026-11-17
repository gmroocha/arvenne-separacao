-- Excluir e duplicar pedidos (pedido do Gustavo, 17/11/2026).
--
-- Excluir: o pedido some de todas as telas, listas, buscas e do link da cliente, mas NADA é apagado
-- (regra do projeto: guardar todos os dados). Fica marcado em pedidos.excluido_em; a RLS esconde da equipe
-- e as views (security_invoker) seguem a RLS. Pode excluir:
--   * venda do WhatsApp ainda não paga (em aberto, aguardando pagamento);
--   * pedido do Arquivo (enviado, cancelado, venda perdida).
-- Não pode: venda somada (exclua o pedido principal; as somadas vão junto), pedido na esteira, pedido com
-- troca, movimento financeiro ou crédito da cliente (dinheiro não some da conta).
--
-- Duplicar: venda nova "em aberto" do WhatsApp com a mesma cliente, endereço, frete, desconto e peças
-- (sem as removidas e sem as peças de vendas somadas). Nada de pagamento, nota ou etapa é copiado.

alter table public.pedidos add column excluido_em timestamptz;
alter table public.pedidos add column excluido_por text;

-- Restritiva: vale junto com as políticas da equipe. Pedido excluído não é lido nem alterado pelo app, e o app
-- não marca excluido_em direto (só pela função abaixo, que confere as regras).
create policy nao_excluido on public.pedidos as restrictive for all to authenticated
  using (excluido_em is null) with check (excluido_em is null);

create function public.excluir_pedido(p_pedido uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_quem text := public.usuario_atual_email();
  v_principal text;
begin
  select * into v from pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if v.status = 'somada' then
    select numero into v_principal from pedidos where id = v.somar_em;
    raise exception 'Esta venda foi somada ao pedido %. Exclua o pedido %: ela vai junto.',
      coalesce(v_principal, ''), coalesce(v_principal, '');
  end if;
  if not (
       (v.origem = 'whatsapp' and v.status in ('em_aberto', 'aguardando_pagamento') and v.pago_em is null)
    or v.status in ('enviado', 'cancelado', 'perdida')
  ) then
    raise exception 'Só dá para excluir venda ainda não paga ou pedido do Arquivo.';
  end if;

  -- O pedido e as vendas somadas a ele (saem juntas).
  if exists (select 1 from trocas t where t.status <> 'cancelada'
              and t.pedido_id in (select p_pedido union all select s.id from pedidos s where s.somar_em = p_pedido)) then
    raise exception 'Este pedido tem troca registrada e não pode ser excluído.';
  end if;
  if exists (select 1 from movimentos_financeiros m
              where m.pedido_id in (select p_pedido union all select s.id from pedidos s where s.somar_em = p_pedido)) then
    raise exception 'Este pedido tem acerto em dinheiro registrado e não pode ser excluído.';
  end if;
  if exists (select 1 from creditos_cliente c where c.cancelado_em is null
              and (c.pedido_id = p_pedido or c.usado_pedido_id = p_pedido
                   or c.pedido_id in (select s.id from pedidos s where s.somar_em = p_pedido)
                   or c.usado_pedido_id in (select s.id from pedidos s where s.somar_em = p_pedido))) then
    raise exception 'Este pedido tem crédito da cliente registrado e não pode ser excluído.';
  end if;

  update pedidos set excluido_em = now(), excluido_por = v_quem
   where (id = p_pedido or somar_em = p_pedido) and excluido_em is null;
  insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
  select id, 'nota', 'Pedido excluído', v_quem from pedidos where id = p_pedido or somar_em = p_pedido;
end $$;

revoke all on function public.excluir_pedido(uuid) from public, anon;
grant execute on function public.excluir_pedido(uuid) to authenticated, service_role;

-- Invocador: a RLS vale (não duplica pedido excluído) e o gatilho de criação registra o evento "criado".
create function public.duplicar_venda(p_pedido uuid) returns table (id uuid, numero text)
language plpgsql set search_path = public, pg_temp as $$
declare
  v record;
  v_id uuid;
  v_numero text;
begin
  select * into v from pedidos p where p.id = p_pedido;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v.origem <> 'whatsapp' then raise exception 'Só dá para duplicar venda do WhatsApp.'; end if;

  insert into pedidos (origem, status, data_compra, cliente_id, cliente_nome, cliente_telefone, cliente_email,
                       cliente_cpf, cliente_razao_social, cliente_ie, entrega_cep, entrega_logradouro,
                       entrega_numero, entrega_complemento, entrega_bairro, entrega_cidade, entrega_uf,
                       frete_tipo, frete_pago_por, frete_cobrado, desconto_tipo, desconto_valor, cupom, observacoes)
  values ('whatsapp', 'em_aberto', now(), v.cliente_id, v.cliente_nome, v.cliente_telefone, v.cliente_email,
          v.cliente_cpf, v.cliente_razao_social, v.cliente_ie, v.entrega_cep, v.entrega_logradouro,
          v.entrega_numero, v.entrega_complemento, v.entrega_bairro, v.entrega_cidade, v.entrega_uf,
          v.frete_tipo, v.frete_pago_por, v.frete_cobrado, v.desconto_tipo, v.desconto_valor, v.cupom, v.observacoes)
  returning pedidos.id, pedidos.numero into v_id, v_numero;

  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome, variante,
                            foto_url, qtd, preco, ordem, entrada)
  select v_id, i.origem, i.shopify_variant_id, i.peca_clube_id, i.sku, i.nome, i.variante,
         i.foto_url, i.qtd, i.preco, row_number() over (order by i.ordem), i.entrada
    from pedido_itens i
   where i.pedido_id = p_pedido and i.status <> 'removido' and not i.adicional
   order by i.ordem;

  insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (v_id, 'nota', 'Duplicada da venda ' || v.numero, public.usuario_atual_email());

  return query select v_id, v_numero;
end $$;

revoke all on function public.duplicar_venda(uuid) from public, anon;
grant execute on function public.duplicar_venda(uuid) to authenticated;

-- Link da cliente: pedido excluído não abre (a função é definidora e não passa pela RLS).
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
  if exists (select 1 from public.pedidos where id = v.id and excluido_em is not null) then return null; end if;
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
