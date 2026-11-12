-- V29: mudar a quantidade de uma opção no carrinho da troca, acrescentar ou tirar outra opção mantendo a
-- primeira, não deixava rastro: o histórico só guardava o tipo e a primeira opção. Agora cada mudança
-- em troca_escolhas vira um evento "troca_carrinho" com a peça, a opção e as quantidades (de → para).
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida', 'shopify_alterado', 'troca_acerto',
  'devolvido', 'devolvido_desfeito', 'shopify_alerta', 'venda_somada', 'troca_carrinho']));

create function public.tg_troca_escolhas_historico() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_peca uuid := case when tg_op = 'DELETE' then old.troca_peca_id else new.troca_peca_id end;
  v_opcao uuid := case when tg_op = 'DELETE' then old.opcao_id else new.opcao_id end;
  v_pedido uuid;
  v_item text;
  v_op text;
  v_de int := case when tg_op = 'INSERT' then 0 else old.qtd end;
  v_para int := case when tg_op = 'DELETE' then 0 else new.qtd end;
begin
  if tg_op = 'UPDATE' and old.qtd = new.qtd and old.opcao_id = new.opcao_id then return null; end if;
  select t.pedido_id, coalesce(i.sku, i.nome) into v_pedido, v_item
    from troca_pecas p join trocas t on t.id = p.troca_id join pedido_itens i on i.id = p.item_id
   where p.id = v_peca;
  if v_pedido is null then return null; end if; -- troca apagada em cascata: nada a registrar
  select coalesce(o.sku, o.nome) into v_op from troca_opcoes o where o.id = v_opcao;
  insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
  values (v_pedido, 'troca_carrinho', v_de::text, v_para::text,
          coalesce(v_item, 'peça') || ' → ' || coalesce(v_op, 'opção') || ': ' || v_de || ' → ' || v_para,
          public.usuario_atual_email());
  return null;
end $$;
revoke all on function public.tg_troca_escolhas_historico() from public, anon, authenticated, service_role;
create trigger troca_escolhas_historico after insert or update or delete on public.troca_escolhas
  for each row execute function public.tg_troca_escolhas_historico();
