-- Troca de peças em falta: UMA troca por pedido, com várias peças e um link só (/t/<token>).
-- A funcionária monta opções para cada peça, a cliente escolhe por peça.
-- Valores (o que a cliente pagou, diferença, crédito) saem daqui: a tela não calcula dinheiro.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.trocas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'respondida', 'concluida', 'cancelada')),
  enviada_em timestamptz,
  respondida_em timestamptz,
  concluida_em timestamptz,
  criado_por text default public.usuario_atual_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trocas_pedido_idx on public.trocas (pedido_id);
-- Uma troca ativa por pedido.
create unique index trocas_ativa_unica on public.trocas (pedido_id)
  where status in ('rascunho', 'enviada', 'respondida');

create table public.troca_pecas (
  id uuid primary key default gen_random_uuid(),
  troca_id uuid not null references public.trocas(id) on delete cascade,
  item_id uuid not null references public.pedido_itens(id),
  escolha_tipo text check (escolha_tipo in ('opcao', 'credito', 'whatsapp')),
  escolha_opcao_id uuid,
  respondida_em timestamptz,
  concluida_em timestamptz,
  resultado_diferenca numeric(10,2), -- positivo = cliente paga, negativo = crédito
  created_at timestamptz not null default now(),
  unique (troca_id, item_id)
);
create index troca_pecas_item_idx on public.troca_pecas (item_id);

create table public.troca_opcoes (
  id uuid primary key default gen_random_uuid(),
  troca_peca_id uuid not null references public.troca_pecas(id) on delete cascade,
  origem text not null check (origem in ('site', 'clube')),
  shopify_variant_id bigint,
  peca_clube_id uuid,
  sku text,
  nome text not null,
  variante text,
  foto_url text,
  preco numeric(10,2),
  motivo text not null default 'busca' check (motivo in ('mesmo_modelo', 'mesmo_valor', 'busca')),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index troca_opcoes_peca_idx on public.troca_opcoes (troca_peca_id);

alter table public.troca_pecas
  add constraint troca_pecas_escolha_opcao_fk
  foreign key (escolha_opcao_id) references public.troca_opcoes(id) on delete set null;

-- Índices do catálogo para as sugestões por preço e categoria.
create index if not exists catalogo_site_preco on public.catalogo_site (preco);
create index if not exists catalogo_site_categoria on public.catalogo_site (upper(split_part(produto, ' ', 1)));

create or replace function public.tg_trocas_antes() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trocas_antes before update on public.trocas
for each row execute function public.tg_trocas_antes();

-- ---------------------------------------------------------------------------
-- Histórico: novos tipos de evento (definição remota lida antes: 24 tipos).
-- ---------------------------------------------------------------------------
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida']));

-- Gatilhos de histórico: security definer porque a política de pedido_eventos só aceita 'nota' da tela
-- (e a cliente responde sem login).
create or replace function public.tg_trocas_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  v_texto text;
begin
  if new.status = 'enviada' and new.status is distinct from old.status then
    select count(*) into v_n from troca_pecas where troca_id = new.id;
    select string_agg(concat_ws(' · ', i.sku, i.nome, i.variante), '; ' order by i.ordem) into v_texto
      from troca_pecas p join pedido_itens i on i.id = p.item_id where p.troca_id = new.id;
    insert into pedido_eventos (pedido_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, 'troca_enviada', old.status, new.status,
            v_n || case when v_n = 1 then ' peça: ' else ' peças: ' end || coalesce(v_texto, ''),
            public.usuario_atual_email());
  end if;
  return null;
end $$;

create trigger trocas_depois after update on public.trocas
for each row execute function public.tg_trocas_depois();

create or replace function public.tg_troca_pecas_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid;
  v_texto text;
begin
  select t.pedido_id into v_pedido from trocas t where t.id = new.troca_id;
  select concat_ws(' · ', i.sku, i.nome, i.variante) into v_texto from pedido_itens i where i.id = new.item_id;

  -- A cliente (ou a equipe) escolheu ou mudou a escolha.
  if new.concluida_em is null and new.escolha_tipo is not null
     and (new.escolha_tipo is distinct from old.escolha_tipo
          or new.escolha_opcao_id is distinct from old.escolha_opcao_id) then
    insert into pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (v_pedido, new.item_id, 'troca_respondida', null, new.escolha_tipo,
            v_texto || ' → ' || case new.escolha_tipo
              when 'credito' then 'prefere crédito'
              when 'whatsapp' then 'quer falar no WhatsApp'
              else coalesce((select concat_ws(' · ', o.sku, o.nome, o.variante)
                               from troca_opcoes o where o.id = new.escolha_opcao_id), 'opção') end,
            public.usuario_atual_email());
  end if;

  -- A equipe fez a troca daquela peça.
  if new.concluida_em is not null and old.concluida_em is null then
    insert into pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (v_pedido, new.item_id, 'troca_concluida', null, new.escolha_tipo,
            v_texto || ' → ' || case new.escolha_tipo
              when 'credito' then 'crédito'
              else coalesce((select concat_ws(' · ', o.sku, o.nome, o.variante)
                               from troca_opcoes o where o.id = new.escolha_opcao_id), 'trocada') end,
            public.usuario_atual_email());
  end if;
  return null;
end $$;

create trigger troca_pecas_depois after update on public.troca_pecas
for each row execute function public.tg_troca_pecas_depois();

-- ---------------------------------------------------------------------------
-- Valores: por peça, uma linha por opção (tipo 'opcao') + uma linha 'credito'.
-- fator = 1 - desconto/subtotal do pedido (o mesmo desconto vale para a peça nova).
-- ---------------------------------------------------------------------------
create view public.v_troca_valores with (security_invoker = true) as
with base as (
  select p.id as troca_peca_id, t.id as troca_id, t.pedido_id, p.item_id, i.qtd,
         case when coalesce(v.subtotal, 0) > 0 then 1 - coalesce(v.desconto, 0) / v.subtotal else 1 end as fator,
         coalesce(i.preco, 0) as preco_item
  from public.troca_pecas p
  join public.trocas t on t.id = p.troca_id
  join public.pedido_itens i on i.id = p.item_id
  join public.v_pedidos v on v.id = t.pedido_id
),
pago as (
  select b.*, round(b.qtd * b.preco_item * b.fator, 2) as valor_pago_item from base b
)
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, o.id as opcao_id, 'opcao'::text as tipo, g.qtd,
       g.valor_pago_item,
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) as valor_opcao,
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item as diferenca,
       case
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item > 0 then 'paga_diferenca'
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item < 0 then 'credito'
         else 'sem_diferenca'
       end as situacao
from pago g
join public.troca_opcoes o on o.troca_peca_id = g.troca_peca_id
union all
select g.troca_peca_id, g.troca_id, g.pedido_id, g.item_id, null::uuid, 'credito'::text, g.qtd,
       g.valor_pago_item, 0::numeric, -g.valor_pago_item, 'credito'::text
from pago g;

-- Resumo por troca: total pago nas peças em falta e soma da diferença das escolhas já feitas
-- (positivo = a cliente paga, negativo = fica de crédito). Escolha "whatsapp" ainda não entra na soma.
create view public.v_troca_resumo with (security_invoker = true) as
select t.id as troca_id, t.pedido_id,
       count(p.id)::integer as pecas_total,
       count(p.escolha_tipo)::integer as pecas_respondidas,
       coalesce(sum(c.valor_pago_item), 0) as total_pago,
       coalesce(sum(case
         when p.escolha_tipo = 'credito' then c.diferenca
         when p.escolha_tipo = 'opcao' then coalesce(x.diferenca, 0)
         else 0 end), 0) as diferenca_total
from public.trocas t
left join public.troca_pecas p on p.troca_id = t.id
left join public.v_troca_valores c on c.troca_peca_id = p.id and c.tipo = 'credito'
left join public.v_troca_valores x on x.troca_peca_id = p.id and x.opcao_id = p.escolha_opcao_id
group by t.id, t.pedido_id;

-- ---------------------------------------------------------------------------
-- Sugestões (equipe). Não há estoque no app: quem confere a disponibilidade é a funcionária.
--   p_modo 'variantes': outras variantes do mesmo produto.
--   p_modo 'preco': faixa de preço (padrão 80% a 120% do preço da peça), categoria e busca opcionais.
-- ---------------------------------------------------------------------------
create or replace function public.sugerir_troca(
  p_item uuid,
  p_modo text default 'variantes',
  p_categoria text default null,
  p_min numeric default null,
  p_max numeric default null,
  p_busca text default null)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_variant bigint;
  v_preco numeric;
  v_produto_id bigint;
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
begin
  select i.shopify_variant_id, i.preco into v_variant, v_preco from pedido_itens i where i.id = p_item;
  select c.produto_id into v_produto_id from catalogo_site c where c.variant_id = v_variant;

  if p_modo = 'variantes' then
    return query
      select 'mesmo_modelo'::text, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url
      from catalogo_site c
      where v_produto_id is not null and c.produto_id = v_produto_id
        and c.variant_id is distinct from v_variant
        and (c.status is null or upper(c.status) = 'ACTIVE')
      order by c.variante
      limit 60;
  else
    return query
      select 'mesmo_valor'::text, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url
      from catalogo_site c
      where c.variant_id is distinct from v_variant
        and (c.status is null or upper(c.status) = 'ACTIVE')
        and c.preco between coalesce(p_min, coalesce(v_preco, 0) * 0.8) and coalesce(p_max, coalesce(v_preco, 0) * 1.2)
        and (p_categoria is null or upper(split_part(c.produto, ' ', 1)) = upper(p_categoria))
        and (v_busca is null or c.produto ilike '%' || v_busca || '%' or c.sku ilike '%' || v_busca || '%'
             or c.variante ilike '%' || v_busca || '%')
      order by abs(c.preco - coalesce(v_preco, 0)), c.produto, c.variante
      limit 40;
  end if;
end $$;

-- Primeiras palavras do nome dos produtos ativos (Anel, Brinco, Colar...) para os chips de filtro.
create or replace function public.categorias_catalogo()
returns table (categoria text, total integer)
language sql stable security invoker set search_path = public as $$
  select upper(split_part(c.produto, ' ', 1)) as categoria, count(distinct c.produto_id)::integer as total
  from catalogo_site c
  where (c.status is null or upper(c.status) = 'ACTIVE') and btrim(c.produto) <> ''
  group by 1
  having count(distinct c.produto_id) >= 5
  order by 2 desc, 1;
$$;

-- ---------------------------------------------------------------------------
-- Páginas públicas (cliente, sem login). Nunca CPF, telefone, e-mail, endereço ou custo.
-- ---------------------------------------------------------------------------
create or replace function public.troca_publica(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
      'pecas_total', coalesce(v_res.pecas_total, 0),
      'pecas_respondidas', coalesce(v_res.pecas_respondidas, 0)),
    'pecas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'foto_url', i.foto_url, 'nome', i.nome, 'variante', i.variante,
        'sku', i.sku, 'qtd', i.qtd,
        'valor_pago', coalesce((select c.valor_pago_item from v_troca_valores c
                                 where c.troca_peca_id = p.id and c.tipo = 'credito'), 0),
        'escolha_tipo', p.escolha_tipo,
        'escolha_opcao_id', p.escolha_opcao_id,
        'concluida', p.concluida_em is not null,
        'opcoes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante, 'sku', o.sku,
            'valor', x.valor_opcao, 'diferenca', x.diferenca, 'situacao', x.situacao)
            order by o.ordem, o.created_at)
          from troca_opcoes o
          join v_troca_valores x on x.opcao_id = o.id
          where o.troca_peca_id = p.id), '[]'::jsonb)
      ) order by i.ordem, p.created_at)
      from troca_pecas p
      join pedido_itens i on i.id = p.item_id
      where p.troca_id = v_t.id), '[]'::jsonb));
end $$;

create or replace function public.troca_escolher(p_token uuid, p_item uuid, p_tipo text, p_opcao uuid default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_t trocas%rowtype;
  v_p troca_pecas%rowtype;
begin
  if p_tipo not in ('opcao', 'credito', 'whatsapp') then
    raise exception 'Escolha inválida';
  end if;
  select * into v_t from trocas where token = p_token for update;
  if not found or v_t.status not in ('enviada', 'respondida') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  select * into v_p from troca_pecas where troca_id = v_t.id and item_id = p_item for update;
  if not found or v_p.concluida_em is not null then
    raise exception 'Peça inválida';
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_peca_id = v_p.id) then
      raise exception 'Opção inválida';
    end if;
  else
    p_opcao := null;
  end if;
  update troca_pecas
     set escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now()
   where id = v_p.id;
  -- Respondida quando todas as peças (ainda não feitas) têm escolha.
  if not exists (select 1 from troca_pecas where troca_id = v_t.id and escolha_tipo is null) then
    update trocas set status = 'respondida', respondida_em = now() where id = v_t.id;
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões e RLS (este projeto não dá GRANT automático)
-- ---------------------------------------------------------------------------
alter table public.trocas enable row level security;
alter table public.troca_pecas enable row level security;
alter table public.troca_opcoes enable row level security;

create policy equipe_le on public.trocas for select to authenticated using (true);
create policy equipe_cria on public.trocas for insert to authenticated with check (true);
create policy equipe_altera on public.trocas for update to authenticated using (true) with check (true);

create policy equipe_le on public.troca_pecas for select to authenticated using (true);
create policy equipe_cria on public.troca_pecas for insert to authenticated with check (true);
create policy equipe_altera on public.troca_pecas for update to authenticated using (true) with check (true);

create policy equipe_le on public.troca_opcoes for select to authenticated using (true);
create policy equipe_cria on public.troca_opcoes for insert to authenticated with check (true);
create policy equipe_altera on public.troca_opcoes for update to authenticated using (true) with check (true);
create policy equipe_apaga on public.troca_opcoes for delete to authenticated using (true);

revoke all on public.trocas, public.troca_pecas, public.troca_opcoes from anon;
grant select, insert, update on public.trocas to authenticated;
grant select, insert, update on public.troca_pecas to authenticated;
grant select, insert, update, delete on public.troca_opcoes to authenticated;
grant select on public.trocas, public.troca_pecas, public.troca_opcoes to service_role;

revoke all on public.v_troca_valores, public.v_troca_resumo from anon;
grant select on public.v_troca_valores, public.v_troca_resumo to authenticated, service_role;

revoke all on function public.sugerir_troca(uuid, text, text, numeric, numeric, text) from public;
grant execute on function public.sugerir_troca(uuid, text, text, numeric, numeric, text) to authenticated;
revoke all on function public.categorias_catalogo() from public;
grant execute on function public.categorias_catalogo() to authenticated;

revoke all on function public.troca_publica(uuid) from public;
revoke all on function public.troca_escolher(uuid, uuid, text, uuid) from public;
grant execute on function public.troca_publica(uuid) to anon, authenticated;
grant execute on function public.troca_escolher(uuid, uuid, text, uuid) to anon, authenticated;

revoke all on function public.tg_trocas_antes() from public;
revoke all on function public.tg_trocas_depois() from public;
revoke all on function public.tg_troca_pecas_depois() from public;

-- Tempo real: a escolha da cliente aparece na hora (igual a pedidos).
alter publication supabase_realtime add table public.trocas, public.troca_pecas, public.troca_opcoes;
