-- Arvenne Separação — esquema inicial.
-- Rodar inteiro no SQL Editor do Supabase (ou `supabase db push`).

-- ---------------------------------------------------------------------------
-- Peças do Clube Arvenne (não estão no site). Catálogo reaproveitável: a mesma
-- peça pode ser vendida para várias clientes.
-- ---------------------------------------------------------------------------
create table public.pecas_clube (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  nome        text not null,
  variante    text,
  foto_url    text,
  preco       numeric(10,2),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index pecas_clube_busca on public.pecas_clube (lower(codigo), lower(nome));

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
create sequence public.pedido_whatsapp_seq start 1;

create table public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null default '',  -- W0001 vem do gatilho
  origem            text not null check (origem in ('shopify', 'whatsapp')),
  status            text not null default 'novo' check (status in (
                      'novo', 'separacao', 'aguardando_cliente', 'conferencia',
                      'faturamento', 'embalagem', 'pronto_envio', 'enviado', 'cancelado')),
  status_desde      timestamptz not null default now(),
  cliente_nome      text,
  cliente_telefone  text,
  cliente_email     text,
  valor_total       numeric(10,2),
  shopify_order_id  bigint unique,
  shopify_url       text,
  carrinho_url      text,
  rastreio          text,
  observacoes       text,
  pedido_em         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index pedidos_status on public.pedidos (status, status_desde);

create table public.pedido_itens (
  id                  uuid primary key default gen_random_uuid(),
  pedido_id           uuid not null references public.pedidos(id) on delete cascade,
  origem              text not null check (origem in ('shopify', 'clube', 'avulso')),
  shopify_variant_id  bigint,
  peca_clube_id       uuid references public.pecas_clube(id),
  sku                 text,
  nome                text not null,
  variante            text,
  foto_url            text,
  qtd                 int not null default 1 check (qtd > 0),
  preco               numeric(10,2),
  status              text not null default 'pendente' check (status in (
                        'pendente', 'encontrado', 'falta', 'defeito', 'removido')),
  observacao          text,
  ordem               int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index pedido_itens_pedido on public.pedido_itens (pedido_id, ordem);
create index pedido_itens_sku on public.pedido_itens (sku) where status = 'pendente';

-- Histórico: quem mudou o quê e quando. Base para medir tempo por etapa depois.
create table public.pedido_eventos (
  id             bigint generated always as identity primary key,
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  item_id        uuid references public.pedido_itens(id) on delete set null,
  tipo           text not null check (tipo in ('criado', 'status', 'item', 'nota')),
  de             text,
  para           text,
  texto          text,
  usuario_email  text,
  created_at     timestamptz not null default now()
);
create index pedido_eventos_pedido on public.pedido_eventos (pedido_id, created_at);

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create or replace function public.usuario_atual_email() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', 'sistema')
$$;

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
  return new;
end $$;

create trigger pedidos_antes before insert or update on public.pedidos
for each row execute function public.tg_pedidos_antes();

-- security definer: o histórico só aceita 'nota' vindo da tela; o resto vem daqui.
create or replace function public.tg_pedidos_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_eventos (pedido_id, tipo, para, usuario_email)
    values (new.id, 'criado', new.status, public.usuario_atual_email());
  elsif new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, tipo, de, para, usuario_email)
    values (new.id, 'status', old.status, new.status, public.usuario_atual_email());
  end if;
  return null;
end $$;

create trigger pedidos_depois after insert or update on public.pedidos
for each row execute function public.tg_pedidos_depois();

create or replace function public.tg_itens_antes() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger itens_antes before update on public.pedido_itens
for each row execute function public.tg_itens_antes();

create or replace function public.tg_itens_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.id, 'item', old.status, new.status,
            concat_ws(' · ', new.sku, new.nome, new.variante), public.usuario_atual_email());
  end if;
  return null;
end $$;

create trigger itens_depois after update on public.pedido_itens
for each row execute function public.tg_itens_depois();

-- ---------------------------------------------------------------------------
-- Importação de pedido da Shopify (chamada pela função shopify-sync).
-- Tudo numa transação: ou entra o pedido com todos os itens, ou nada.
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

  insert into pedidos (numero, origem, cliente_nome, cliente_telefone, cliente_email,
                       valor_total, shopify_order_id, shopify_url, pedido_em)
  values (p->>'numero', 'shopify', p->>'cliente_nome', p->>'cliente_telefone',
          p->>'cliente_email', (p->>'valor_total')::numeric,
          (p->>'shopify_order_id')::bigint, p->>'shopify_url',
          coalesce((p->>'pedido_em')::timestamptz, now()))
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

-- ---------------------------------------------------------------------------
-- Pedido do WhatsApp: entra direto no app, sem passar pela Shopify.
-- security invoker: vale a RLS de quem chama (equipe logada).
-- ---------------------------------------------------------------------------
create or replace function public.criar_pedido_whatsapp(p jsonb)
returns table (id uuid, numero text)
language plpgsql as $$
declare
  v_id uuid;
  v_numero text;
begin
  insert into pedidos (origem, cliente_nome, cliente_telefone, carrinho_url, observacoes, valor_total)
  values (
    'whatsapp', p->>'cliente_nome', p->>'cliente_telefone', p->>'carrinho_url', p->>'observacoes',
    (select coalesce(sum(coalesce((i->>'preco')::numeric, 0) * coalesce((i->>'qtd')::int, 1)), 0)
       from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) as i)
  )
  returning pedidos.id, pedidos.numero into v_id, v_numero;

  insert into pedido_itens (pedido_id, origem, shopify_variant_id, peca_clube_id, sku, nome,
                            variante, foto_url, qtd, preco, ordem)
  select v_id, coalesce(i->>'origem', 'avulso'), (i->>'shopify_variant_id')::bigint,
         (i->>'peca_clube_id')::uuid, i->>'sku', i->>'nome', i->>'variante', i->>'foto_url',
         coalesce((i->>'qtd')::int, 1), (i->>'preco')::numeric, ord::int
  from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) with ordinality as t(i, ord);

  return query select v_id, v_numero;
end $$;

grant execute on function public.criar_pedido_whatsapp(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Peças que aparecem em mais de um pedido aberto: pegar o saco uma vez só.
-- ---------------------------------------------------------------------------
create or replace view public.v_pecas_em_varios_pedidos
with (security_invoker = true) as
select
  coalesce(nullif(i.sku, ''), i.nome || ' · ' || coalesce(i.variante, '')) as chave,
  max(i.sku)        as sku,
  max(i.nome)       as nome,
  max(i.variante)   as variante,
  max(i.foto_url)   as foto_url,
  sum(i.qtd)::int   as qtd_total,
  count(distinct p.id)::int as qtd_pedidos,
  jsonb_agg(jsonb_build_object(
    'pedido_id', p.id, 'numero', p.numero, 'cliente', p.cliente_nome, 'qtd', i.qtd
  ) order by p.pedido_em) as pedidos
from public.pedido_itens i
join public.pedidos p on p.id = i.pedido_id
where p.status in ('novo', 'separacao')
  and i.status = 'pendente'
group by 1
having count(distinct p.id) > 1;

-- ---------------------------------------------------------------------------
-- Acesso: só a equipe logada. Cadastro público fica DESLIGADO no painel do
-- Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").
-- ---------------------------------------------------------------------------
alter table public.pecas_clube    enable row level security;
alter table public.pedidos        enable row level security;
alter table public.pedido_itens   enable row level security;
alter table public.pedido_eventos enable row level security;

create policy equipe on public.pecas_clube    for all to authenticated using (true) with check (true);

-- Pedidos e itens: a equipe lê, cria e altera, mas NÃO apaga. Pedido enviado ou cancelado fica
-- guardado para sempre. Sem política de DELETE, o banco recusa a exclusão vinda do app.
-- (Apagar pedido de teste: pelo Table Editor do painel do Supabase, que ignora estas regras.)
create policy equipe_le    on public.pedidos      for select to authenticated using (true);
create policy equipe_cria  on public.pedidos      for insert to authenticated with check (true);
create policy equipe_edita on public.pedidos      for update to authenticated using (true) with check (true);
create policy equipe_le    on public.pedido_itens for select to authenticated using (true);
create policy equipe_cria  on public.pedido_itens for insert to authenticated with check (true);
create policy equipe_edita on public.pedido_itens for update to authenticated using (true) with check (true);

create policy equipe_le on public.pedido_eventos for select to authenticated using (true);
create policy equipe_nota on public.pedido_eventos for insert to authenticated
  with check (tipo = 'nota');

grant usage on sequence public.pedido_whatsapp_seq to authenticated;

-- Tempo real: celular de quem separa e PC do leitor veem a mesma coisa na hora.
alter publication supabase_realtime add table public.pedidos, public.pedido_itens;

-- ---------------------------------------------------------------------------
-- Fotos (peças do Clube e avulsas). Leitura pública, escrita só da equipe.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy fotos_equipe_envia on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos');
create policy fotos_equipe_atualiza on storage.objects for update to authenticated
  using (bucket_id = 'fotos');
