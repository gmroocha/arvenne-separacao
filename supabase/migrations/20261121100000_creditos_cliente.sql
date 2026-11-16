-- Crédito da cliente depois da troca: ao registrar o saldo a favor, a equipe diz o destino.
--   reembolso       → "Reembolso pendente" até alguém marcar "Reembolsado" (controle de quem falta reembolsar)
--   proximo_pedido  → "Crédito guardado": aparece no próximo pedido da mesma cliente até ser usado
-- O valor é o do movimento financeiro do acerto (banco); a interface não calcula. Só as funções abaixo
-- escrevem nesta tabela. Nada é apagado: desfazer o acerto marca o crédito como cancelado.
create table public.creditos_cliente (
  id               uuid primary key default gen_random_uuid(),
  troca_id         uuid not null references public.trocas(id),
  pedido_id        uuid not null references public.pedidos(id),
  destino          text not null check (destino in ('reembolso', 'proximo_pedido')),
  valor            numeric(12,2) not null check (valor > 0),
  registrado_em    timestamptz not null default now(),
  registrado_por   text,
  reembolsado_em   timestamptz,
  reembolsado_por  text,
  usado_em         timestamptz,
  usado_pedido_id  uuid references public.pedidos(id),
  usado_por        text,
  cancelado_em     timestamptz,
  check (destino = 'reembolso' or reembolsado_em is null),
  check (destino = 'proximo_pedido' or usado_em is null),
  check ((usado_em is null) = (usado_pedido_id is null))
);
create unique index creditos_cliente_ativo on public.creditos_cliente (troca_id) where cancelado_em is null;
create index creditos_cliente_pedido on public.creditos_cliente (pedido_id);
create index creditos_cliente_troca on public.creditos_cliente (troca_id);
create index creditos_cliente_usado_pedido on public.creditos_cliente (usado_pedido_id);

alter table public.creditos_cliente enable row level security;
create policy equipe_le on public.creditos_cliente for select to authenticated using (true);
revoke all on public.creditos_cliente from public, anon, authenticated;
grant select on public.creditos_cliente to authenticated, service_role;

-- Situação legível de cada crédito ativo (o selo do pedido e o resumo usam esta view).
create view public.v_creditos_cliente with (security_invoker = true) as
select c.id, c.troca_id, c.pedido_id, p.numero, p.cliente_nome, c.destino, c.valor,
  case
    when c.destino = 'reembolso' and c.reembolsado_em is null then 'reembolso_pendente'
    when c.destino = 'reembolso' then 'reembolsado'
    when c.usado_em is null then 'credito_guardado'
    else 'credito_usado'
  end as situacao,
  c.registrado_em, c.registrado_por, c.reembolsado_em, c.reembolsado_por,
  c.usado_em, c.usado_pedido_id, u.numero as usado_numero, c.usado_por
from public.creditos_cliente c
join public.pedidos p on p.id = c.pedido_id
left join public.pedidos u on u.id = c.usado_pedido_id
where c.cancelado_em is null;
revoke all on public.v_creditos_cliente from public, anon;
grant select on public.v_creditos_cliente to authenticated, service_role;

-- Desfazer o acerto de crédito: bloqueado se já reembolsou ou usou; senão o crédito fica cancelado.
create function public.tg_trocas_credito() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.acerto_status = 'credito_registrado' and new.acerto_status is distinct from old.acerto_status then
    if exists (select 1 from creditos_cliente where troca_id = new.id and cancelado_em is null
               and (reembolsado_em is not null or usado_em is not null)) then
      raise exception 'Este crédito já foi reembolsado ou usado. Desfaça isso antes de mudar o acerto.';
    end if;
    update creditos_cliente set cancelado_em = now() where troca_id = new.id and cancelado_em is null;
  end if;
  return new;
end $$;
revoke all on function public.tg_trocas_credito() from public, anon, authenticated, service_role;
create trigger trocas_credito before update of acerto_status on public.trocas
  for each row execute function public.tg_trocas_credito();

-- Registrar o crédito com o destino escolhido (um passo: acerto + destino, na mesma transação).
create function public.registrar_credito(p_troca uuid, p_destino text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t trocas%rowtype;
  v_valor numeric;
  v_id uuid;
begin
  if p_destino is null or p_destino not in ('reembolso', 'proximo_pedido') then
    raise exception 'Destino do crédito inválido';
  end if;
  select * into v_t from trocas where id = p_troca for update;
  if not found then raise exception 'Troca não encontrada'; end if;
  if v_t.acerto_status is distinct from 'pendente' then raise exception 'Este acerto já foi registrado'; end if;
  perform public.troca_acerto(p_troca, 'credito_registrado'); -- valida o saldo e grava o movimento
  select -m.valor into v_valor from movimentos_financeiros m
   where m.troca_id = p_troca and m.tipo = 'troca_credito'
     and not exists (select 1 from movimentos_financeiros e where e.estorna_id = m.id)
   order by m.id desc limit 1;
  if v_valor is null or v_valor <= 0 then raise exception 'Não há crédito a registrar neste pedido'; end if;
  insert into creditos_cliente (troca_id, pedido_id, destino, valor, registrado_por)
  values (p_troca, v_t.pedido_id, p_destino, v_valor, public.usuario_atual_email())
  returning id into v_id;
  insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
  values (v_t.pedido_id, 'troca_acerto', 'credito_registrado',
          case p_destino when 'reembolso' then 'reembolso_pendente' else 'credito_guardado' end,
          case p_destino
            when 'reembolso' then 'Crédito para reembolsar: R$ '
            else 'Crédito guardado para o próximo pedido: R$ ' end
            || replace(v_valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email());
  return v_id;
end $$;
revoke all on function public.registrar_credito(uuid, text) from public, anon;
grant execute on function public.registrar_credito(uuid, text) to authenticated;

-- Reembolso feito (ou desfeito).
create function public.marcar_reembolsado(p_credito uuid, p_desfazer boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v creditos_cliente%rowtype;
begin
  select * into v from creditos_cliente where id = p_credito and cancelado_em is null for update;
  if not found then raise exception 'Crédito não encontrado'; end if;
  if v.destino <> 'reembolso' then raise exception 'Este crédito é para o próximo pedido, não para reembolso'; end if;
  if coalesce(p_desfazer, false) then
    if v.reembolsado_em is null then return; end if;
    update creditos_cliente set reembolsado_em = null, reembolsado_por = null where id = v.id;
  else
    if v.reembolsado_em is not null then return; end if;
    update creditos_cliente set reembolsado_em = now(), reembolsado_por = public.usuario_atual_email() where id = v.id;
  end if;
  insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
  values (v.pedido_id, 'troca_acerto',
          case when p_desfazer then 'reembolsado' else 'reembolso_pendente' end,
          case when p_desfazer then 'reembolso_pendente' else 'reembolsado' end,
          case when p_desfazer then 'Reembolso desfeito: voltou a reembolsar R$ ' else 'Reembolsado à cliente: R$ ' end
            || replace(v.valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email());
end $$;
revoke all on function public.marcar_reembolsado(uuid, boolean) from public, anon;
grant execute on function public.marcar_reembolsado(uuid, boolean) to authenticated;

-- Mesma cliente: mesmo cadastro, CPF, e-mail ou telefone (últimos 11 dígitos).
create function public.mesma_cliente(a public.pedidos, b public.pedidos) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select (a.cliente_id is not null and a.cliente_id = b.cliente_id)
      or (nullif(regexp_replace(coalesce(a.cliente_cpf, ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(b.cliente_cpf, ''), '\D', '', 'g'), ''))
      or (nullif(lower(trim(a.cliente_email)), '') = nullif(lower(trim(b.cliente_email)), ''))
      or (length(regexp_replace(coalesce(a.cliente_telefone, ''), '\D', '', 'g')) >= 10
          and right(regexp_replace(coalesce(a.cliente_telefone, ''), '\D', '', 'g'), 11)
            = right(regexp_replace(coalesce(b.cliente_telefone, ''), '\D', '', 'g'), 11))
$$;
revoke all on function public.mesma_cliente(public.pedidos, public.pedidos) from public, anon;
grant execute on function public.mesma_cliente(public.pedidos, public.pedidos) to authenticated, service_role;

-- Créditos guardados da cliente deste pedido (de outros pedidos dela) e os já usados neste pedido.
create function public.creditos_do_pedido(p_pedido uuid)
returns table (id uuid, pedido_id uuid, numero text, valor numeric, situacao text, registrado_em timestamptz, usado_aqui boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  select v.id, v.pedido_id, v.numero, v.valor, v.situacao, v.registrado_em, coalesce(v.usado_pedido_id = p_pedido, false)
  from public.pedidos alvo
  join public.pedidos fonte on fonte.id <> alvo.id and public.mesma_cliente(alvo, fonte)
  join public.v_creditos_cliente v on v.pedido_id = fonte.id and v.destino = 'proximo_pedido'
  where alvo.id = p_pedido
    and (v.situacao = 'credito_guardado' or v.usado_pedido_id = p_pedido)
  order by v.registrado_em
$$;
revoke all on function public.creditos_do_pedido(uuid) from public, anon;
grant execute on function public.creditos_do_pedido(uuid) to authenticated, service_role;

-- Usar o crédito guardado num pedido da mesma cliente (ou desfazer o uso).
create function public.usar_credito(p_credito uuid, p_pedido uuid, p_desfazer boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v creditos_cliente%rowtype;
  v_numero text;
  v_origem text;
begin
  select * into v from creditos_cliente where id = p_credito and cancelado_em is null for update;
  if not found then raise exception 'Crédito não encontrado'; end if;
  if v.destino <> 'proximo_pedido' then raise exception 'Este crédito é de reembolso, não para o próximo pedido'; end if;
  select numero into v_numero from pedidos where id = p_pedido;
  if not found then raise exception 'Pedido não encontrado'; end if;
  select numero into v_origem from pedidos where id = v.pedido_id;
  if coalesce(p_desfazer, false) then
    if v.usado_pedido_id is distinct from p_pedido then raise exception 'Este crédito não foi usado neste pedido'; end if;
    update creditos_cliente set usado_em = null, usado_pedido_id = null, usado_por = null where id = v.id;
  else
    if v.usado_em is not null then raise exception 'Este crédito já foi usado'; end if;
    if p_pedido = v.pedido_id then raise exception 'O crédito é para outro pedido da cliente'; end if;
    if not exists (select 1 from pedidos a, pedidos b where a.id = p_pedido and b.id = v.pedido_id and public.mesma_cliente(a, b)) then
      raise exception 'Este crédito é de outra cliente';
    end if;
    update creditos_cliente set usado_em = now(), usado_pedido_id = p_pedido, usado_por = public.usuario_atual_email() where id = v.id;
  end if;
  insert into pedido_eventos (pedido_id, tipo, texto, usuario_email)
  values (v.pedido_id, 'nota',
          case when p_desfazer then 'Uso do crédito desfeito no pedido ' || v_numero || ': R$ '
               else 'Crédito usado no pedido ' || v_numero || ': R$ ' end || replace(v.valor::numeric(10,2)::text, '.', ','),
          public.usuario_atual_email()),
         (p_pedido, 'nota',
          case when p_desfazer then 'Desfeito: crédito do pedido ' || v_origem || ' (R$ '
               else 'Usado crédito do pedido ' || v_origem || ' (R$ ' end || replace(v.valor::numeric(10,2)::text, '.', ',') || ')',
          public.usuario_atual_email());
end $$;
revoke all on function public.usar_credito(uuid, uuid, boolean) from public, anon;
grant execute on function public.usar_credito(uuid, uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    grant select on public.creditos_cliente, public.v_creditos_cliente to supabase_read_only_user;
    grant execute on function public.creditos_do_pedido(uuid) to supabase_read_only_user;
    grant execute on function public.mesma_cliente(public.pedidos, public.pedidos) to supabase_read_only_user;
  end if;
end $$;
