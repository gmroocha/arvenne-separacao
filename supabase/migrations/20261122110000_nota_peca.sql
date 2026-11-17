-- Nota numa peça do pedido (menu "…" das peças: separação, conferência, etiquetagem, faltas).
-- Ex.: "peça de montagem: temos as partes, falta montar". Aparece no cartão da peça em todas as etapas.
-- pedido_itens.nota guarda a nota atual; cada mudança fica registrada em pedido_eventos (nada se perde).

alter table public.pedido_itens add column nota text check (char_length(nota) <= 500);

-- Invocador: vale a RLS da equipe. Nota vazia apaga (o histórico continua nos eventos).
create function public.anotar_item(p_item uuid, p_nota text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_antes text;
  v_pedido uuid;
begin
  select nota, pedido_id into v_antes, v_pedido from pedido_itens where id = p_item for update;
  if not found then raise exception 'Peça não encontrada'; end if;
  if v_nota is not distinct from v_antes then return; end if;
  update pedido_itens set nota = v_nota where id = p_item;
  insert into pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
  values (v_pedido, p_item, 'nota', v_antes, v_nota,
          case when v_nota is null then 'Nota da peça apagada' else 'Nota da peça: ' || v_nota end,
          public.usuario_atual_email());
end $$;

revoke all on function public.anotar_item(uuid, text) from public, anon;
grant execute on function public.anotar_item(uuid, text) to authenticated, service_role;
