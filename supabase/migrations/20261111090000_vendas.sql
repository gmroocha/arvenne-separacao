-- Vendas (romaneio) + prazo de 48 h úteis + visualização pública para a cliente.
--
-- Fases, derivadas do status:
--   venda      -> em_aberto, aguardando_pagamento
--   expedicao  -> novo ... pronto_envio, aguardando_cliente
--   arquivo    -> enviado, cancelado, perdida
-- Pedido da Shopify entra direto como "novo", já pago. Pedido do WhatsApp nasce "em_aberto" e só
-- entra na expedição quando a cliente paga.

-- ---------------------------------------------------------------------------
-- Etapas novas
-- ---------------------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in (
  'em_aberto', 'aguardando_pagamento', 'perdida',
  'novo', 'separacao', 'aguardando_cliente', 'conferencia',
  'faturamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado'));

-- ---------------------------------------------------------------------------
-- Clientes (reaproveitáveis entre pedidos). CPF e endereço são dado pessoal: só a equipe logada.
-- telefone e cpf ficam só com dígitos.
-- ---------------------------------------------------------------------------
create table public.clientes (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  cpf                 text,
  email               text,
  telefone            text,
  cep                 text,
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  uf                  text,
  shopify_customer_id bigint,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index clientes_telefone on public.clientes (regexp_replace(telefone, '\D', '', 'g'));
create index clientes_email    on public.clientes (lower(email));
create index clientes_cpf      on public.clientes (cpf);

create or replace function public.tg_clientes_antes() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clientes_antes before update on public.clientes
for each row execute function public.tg_clientes_antes();

alter table public.clientes enable row level security;
create policy equipe_le    on public.clientes for select to authenticated using (true);
create policy equipe_cria  on public.clientes for insert to authenticated with check (true);
create policy equipe_edita on public.clientes for update to authenticated using (true) with check (true);

grant select, insert, update on public.clientes to authenticated;
grant select, insert, update on public.clientes to service_role;

-- ---------------------------------------------------------------------------
-- Colunas novas em pedidos
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column cliente_id           uuid references public.clientes(id),
  add column cliente_cpf          text,
  -- Endereço copiado no pedido: não muda se o cadastro da cliente mudar depois.
  add column entrega_cep          text,
  add column entrega_logradouro   text,
  add column entrega_numero       text,
  add column entrega_complemento  text,
  add column entrega_bairro       text,
  add column entrega_cidade       text,
  add column entrega_uf           text,
  add column desconto_tipo        text check (desconto_tipo in ('valor', 'percentual')),
  add column desconto_valor       numeric(10,2),
  add column cupom                text,
  add column frete_tipo           text check (frete_tipo in ('PAC', 'SEDEX', 'retirada', 'outro')),
  add column frete_pago_por       text check (frete_pago_por in ('cliente', 'arvenne')),
  add column frete_cobrado        numeric(10,2),
  add column frete_custo          numeric(10,2),
  add column forma_pagamento      text,
  add column valor_pago           numeric(10,2),
  add column pago_em              timestamptz,
  add column data_compra          timestamptz,
  add column token_publico        uuid not null default gen_random_uuid();

create unique index pedidos_token_publico on public.pedidos (token_publico);
create index pedidos_cliente on public.pedidos (cliente_id);

-- Item conferido na etapa de Conferência.
alter table public.pedido_itens add column conferido_em timestamptz;

-- ---------------------------------------------------------------------------
-- Feriados nacionais (2026 e 2027). Carnaval e Corpus Christi são ponto facultativo, mas a
-- Correios/Bling/lojas costumam parar; entram marcados. Apague a linha se não quiser contar.
-- ---------------------------------------------------------------------------
create table public.feriados (
  data  date primary key,
  nome  text not null
);
alter table public.feriados enable row level security;
-- Sem política e sem GRANT para o app: só as funções abaixo (security definer) leem.

insert into public.feriados (data, nome) values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-02-16', 'Carnaval (ponto facultativo)'),
  ('2026-02-17', 'Carnaval (ponto facultativo)'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-05-01', 'Dia do Trabalho'),
  ('2026-06-04', 'Corpus Christi (ponto facultativo)'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-11-15', 'Proclamação da República'),
  ('2026-11-20', 'Consciência Negra'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Confraternização Universal'),
  ('2027-02-08', 'Carnaval (ponto facultativo)'),
  ('2027-02-09', 'Carnaval (ponto facultativo)'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-04-21', 'Tiradentes'),
  ('2027-05-01', 'Dia do Trabalho'),
  ('2027-05-27', 'Corpus Christi (ponto facultativo)'),
  ('2027-09-07', 'Independência do Brasil'),
  ('2027-10-12', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'Finados'),
  ('2027-11-15', 'Proclamação da República'),
  ('2027-11-20', 'Consciência Negra'),
  ('2027-12-25', 'Natal');

-- ---------------------------------------------------------------------------
-- Prazo de envio: pagamento + 48 h úteis (2 dias úteis), no fuso de São Paulo, sem sábado,
-- domingo e feriados. Sexta 15:00 -> terça 15:00.
-- ---------------------------------------------------------------------------
create or replace function public.prazo_envio(pago timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  d timestamp;
  n int := 0;
begin
  if pago is null then return null; end if;
  d := pago at time zone 'America/Sao_Paulo';
  while n < 2 loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d::date) then
      n := n + 1;
    end if;
  end loop;
  return d at time zone 'America/Sao_Paulo';
end $$;

-- Horas úteis (sem sábado, domingo e feriados) entre dois instantes. Negativo se "ate" < "de".
create or replace function public.horas_uteis(de timestamptz, ate timestamptz) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  a timestamp;
  b timestamp;
  d date;
  ini timestamp;
  fim timestamp;
  total numeric := 0;
begin
  if de is null or ate is null then return null; end if;
  if ate < de then return -public.horas_uteis(ate, de); end if;
  a := de at time zone 'America/Sao_Paulo';
  b := ate at time zone 'America/Sao_Paulo';
  for d in select g::date from generate_series(a::date, b::date, interval '1 day') g loop
    if extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d) then
      ini := greatest(a, d::timestamp);
      fim := least(b, (d + 1)::timestamp);
      total := total + extract(epoch from (fim - ini)) / 3600;
    end if;
  end loop;
  return round(total, 1);
end $$;

revoke all on function public.prazo_envio(timestamptz) from public, anon;
revoke all on function public.horas_uteis(timestamptz, timestamptz) from public, anon;
grant execute on function public.prazo_envio(timestamptz) to authenticated, service_role;
grant execute on function public.horas_uteis(timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Gatilho de pedidos: quem sai de venda para expedição sem pago_em ganha "agora".
-- ---------------------------------------------------------------------------
create or replace function public.tg_pedidos_antes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.numero is null or new.numero = '' then
      new.numero := 'W' || lpad(nextval('public.pedido_whatsapp_seq')::text, 4, '0');
    end if;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_desde := now();
    end if;
  end if;
  if new.pago_em is null
     and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
    new.pago_em := now();
  end if;
  return new;
end $$;

-- Pedidos que já existem (testes W0001 e W0002) seguem como estão; só ganham a data de pagamento.
update public.pedidos set pago_em = pedido_em, data_compra = pedido_em where pago_em is null;

-- ---------------------------------------------------------------------------
-- v_pedidos: base de todas as listas. A tela não faz conta, só formata o que vem daqui.
-- ---------------------------------------------------------------------------
create or replace view public.v_pedidos
with (security_invoker = true) as
with itens as (
  select
    p.id as pedido_id,
    coalesce(sum(i.qtd * coalesce(i.preco, 0)), 0)::numeric(10,2)                          as subtotal,
    coalesce(sum(i.qtd), 0)::int                                                           as qtd_pecas,
    count(i.id)::int                                                                       as qtd_linhas,
    (count(i.id) filter (where i.status = 'encontrado'))::int                              as qtd_encontradas,
    (count(i.id) filter (where i.status in ('falta', 'defeito')))::int                     as qtd_problemas,
    (count(i.id) filter (where i.status = 'encontrado' and i.conferido_em is not null))::int as qtd_conferidas,
    coalesce((
      select jsonb_agg(f.foto_url)
      from (select x.foto_url from public.pedido_itens x
            where x.pedido_id = p.id and x.status <> 'removido' and x.foto_url is not null
            order by x.ordem limit 3) f
    ), '[]'::jsonb)                                                                        as fotos
  from public.pedidos p
  left join public.pedido_itens i on i.pedido_id = p.id and i.status <> 'removido'
  group by p.id
),
calc as (
  select
    p.*,
    a.subtotal, a.qtd_pecas, a.qtd_linhas, a.qtd_encontradas, a.qtd_problemas, a.qtd_conferidas, a.fotos,
    least(a.subtotal, case p.desconto_tipo
      when 'percentual' then round(a.subtotal * coalesce(p.desconto_valor, 0) / 100, 2)
      when 'valor'      then coalesce(p.desconto_valor, 0)
      else 0 end)::numeric(10,2)                                                          as desconto,
    case when p.frete_pago_por = 'cliente' then coalesce(p.frete_cobrado, 0) else 0 end::numeric(10,2) as frete_na_conta,
    case
      when p.status in ('em_aberto', 'aguardando_pagamento') then 'venda'
      when p.status in ('enviado', 'cancelado', 'perdida')   then 'arquivo'
      else 'expedicao' end                                                                as fase
  from public.pedidos p
  join itens a on a.pedido_id = p.id
)
select
  c.*,
  -- Pedido da Shopify: o total é o que a Shopify cobrou. Venda manual: soma das peças.
  case when c.origem = 'shopify' and c.valor_total is not null then c.valor_total
       else (c.subtotal - c.desconto + c.frete_na_conta) end::numeric(10,2)               as total,
  case when c.fase = 'expedicao' then public.prazo_envio(c.pago_em) end                   as prazo,
  case when c.fase = 'expedicao' and public.prazo_envio(c.pago_em) > now()
       then public.horas_uteis(now(), public.prazo_envio(c.pago_em)) end                  as prazo_horas_uteis
from calc c;

grant select on public.v_pedidos to authenticated;

-- ---------------------------------------------------------------------------
-- Romaneio público: a cliente abre /r/<token> sem login. Só dados seguros: nunca CPF, e-mail,
-- telefone, endereço, custo, SKU nem histórico. Token inexistente devolve null.
-- ---------------------------------------------------------------------------
create or replace function public.romaneio_publico(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from public.v_pedidos where token_publico = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'numero',   v.numero,
    'cliente',  nullif(split_part(trim(coalesce(v.cliente_nome, '')), ' ', 1), ''),
    'fase',     v.fase,
    'status',   v.status,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome, 'variante', i.variante, 'foto_url', i.foto_url,
               'qtd', i.qtd, 'preco', i.preco) order by i.ordem)
      from public.pedido_itens i
      where i.pedido_id = v.id and i.status <> 'removido'), '[]'::jsonb),
    'subtotal',      v.subtotal,
    'desconto',      v.desconto,
    'cupom',         v.cupom,
    'frete_tipo',    v.frete_tipo,
    'frete_cobrado', v.frete_na_conta,
    'total',         v.total
  );
end $$;

revoke all on function public.romaneio_publico(uuid) from public;
grant execute on function public.romaneio_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Venda nova: nasce "em_aberto" (ainda não paga). Substitui criar_pedido_whatsapp.
-- ---------------------------------------------------------------------------
drop function if exists public.criar_pedido_whatsapp(jsonb);

create or replace function public.criar_venda(p jsonb default '{}'::jsonb)
returns table (id uuid, numero text)
language plpgsql as $$
declare
  v_id uuid;
  v_numero text;
begin
  insert into pedidos (origem, status, cliente_nome, cliente_telefone, carrinho_url, observacoes, data_compra)
  values ('whatsapp', 'em_aberto', p->>'cliente_nome', p->>'cliente_telefone', p->>'carrinho_url',
          p->>'observacoes', now())
  returning pedidos.id, pedidos.numero into v_id, v_numero;

  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
                            variante, foto_url, qtd, preco, ordem)
  select v_id, coalesce(i->>'origem', 'avulso'), (i->>'shopify_variant_id')::bigint,
         (i->>'peca_clube_id')::uuid, i->>'sku', i->>'nome', i->>'variante', i->>'foto_url',
         coalesce((i->>'qtd')::int, 1), (i->>'preco')::numeric, ord::int
  from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) with ordinality as t(i, ord);

  return query select v_id, v_numero;
end $$;

revoke all on function public.criar_venda(jsonb) from public, anon;
grant execute on function public.criar_venda(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Importação da Shopify: entra já paga, direto na expedição ("novo"), com a data do pagamento.
-- ---------------------------------------------------------------------------
create or replace function public.importar_pedido_shopify(p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from pedidos where shopify_order_id = (p->>'shopify_order_id')::bigint;

  if v_id is not null then
    -- Já importado. Só acompanha cancelamento feito na Shopify.
    if (p->>'cancelado')::boolean then
      update pedidos set status = 'cancelado'
      where id = v_id and status not in ('cancelado', 'enviado');
    end if;
    return false;
  end if;

  if (p->>'cancelado')::boolean then
    return false;
  end if;

  insert into pedidos (numero, origem, status, cliente_nome, cliente_telefone, cliente_email,
                       valor_total, shopify_order_id, shopify_url, pedido_em, data_compra, pago_em)
  values (p->>'numero', 'shopify', 'novo', p->>'cliente_nome', p->>'cliente_telefone',
          p->>'cliente_email', (p->>'valor_total')::numeric,
          (p->>'shopify_order_id')::bigint, p->>'shopify_url',
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pedido_em')::timestamptz, now()),
          coalesce((p->>'pago_em')::timestamptz, (p->>'pedido_em')::timestamptz, now()))
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

-- A view também serve funções do servidor.
grant select on public.v_pedidos to service_role;
