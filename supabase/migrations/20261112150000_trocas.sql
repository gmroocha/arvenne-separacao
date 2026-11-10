-- Troca de peça em falta: a funcionária monta opções, a cliente escolhe num link (/t/<token>).
-- Valores (o que a cliente pagou, diferença, crédito) saem daqui: a tela não calcula dinheiro.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.trocas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  item_id uuid not null references public.pedido_itens(id),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'respondida', 'concluida', 'cancelada')),
  escolha_tipo text check (escolha_tipo in ('opcao', 'credito', 'whatsapp')),
  escolha_opcao_id uuid,
  enviada_em timestamptz,
  respondida_em timestamptz,
  concluida_em timestamptz,
  resultado_diferenca numeric(10,2), -- positivo = cliente paga, negativo = crédito
  criado_por text default public.usuario_atual_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trocas_pedido_idx on public.trocas (pedido_id);
create index trocas_item_idx on public.trocas (item_id);

create table public.troca_opcoes (
  id uuid primary key default gen_random_uuid(),
  troca_id uuid not null references public.trocas(id) on delete cascade,
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
create index troca_opcoes_troca_idx on public.troca_opcoes (troca_id);

alter table public.trocas
  add constraint trocas_escolha_opcao_fk foreign key (escolha_opcao_id) references public.troca_opcoes(id) on delete set null;

create or replace function public.tg_trocas_antes() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trocas_antes before update on public.trocas
for each row execute function public.tg_trocas_antes();

-- Histórico do pedido: security definer porque a política de pedido_eventos só aceita 'nota' da tela.
create or replace function public.tg_trocas_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_texto text;
begin
  if new.status in ('enviada', 'respondida', 'concluida')
     and (new.status is distinct from old.status
          or (new.status = 'respondida'
              and (new.escolha_tipo is distinct from old.escolha_tipo
                   or new.escolha_opcao_id is distinct from old.escolha_opcao_id))) then
    select concat_ws(' · ', i.sku, i.nome, i.variante) into v_texto from pedido_itens i where i.id = new.item_id;
    if new.status = 'respondida' then
      v_texto := v_texto || ' → ' || case new.escolha_tipo
        when 'credito' then 'prefere crédito'
        when 'whatsapp' then 'quer falar no WhatsApp'
        else coalesce((select concat_ws(' · ', o.sku, o.nome, o.variante)
                         from troca_opcoes o where o.id = new.escolha_opcao_id), 'opção') end;
    end if;
    insert into pedido_eventos (pedido_id, item_id, tipo, de, para, texto, usuario_email)
    values (new.pedido_id, new.item_id, 'troca_' || new.status, old.status, new.status, v_texto,
            public.usuario_atual_email());
  end if;
  return null;
end $$;

create trigger trocas_depois after update on public.trocas
for each row execute function public.tg_trocas_depois();

-- ---------------------------------------------------------------------------
-- Histórico: novos tipos de evento
-- ---------------------------------------------------------------------------
alter table public.pedido_eventos drop constraint if exists pedido_eventos_tipo_check;
alter table public.pedido_eventos add constraint pedido_eventos_tipo_check check (tipo = any (array[
  'criado', 'status', 'item', 'nota', 'conferida', 'desconferida', 'etiquetada', 'desetiquetada', 'bipada',
  'qtd', 'preco', 'pago', 'nota_emitida', 'nota_desfeita', 'frete_gerado', 'frete_desfeito',
  'pedido_lr', 'pedido_lr_desfeito', 'embalado', 'desembalado', 'postado', 'desfeito_postagem',
  'rastreio_enviado', 'reiniciado',
  'troca_enviada', 'troca_respondida', 'troca_concluida']));

-- ---------------------------------------------------------------------------
-- Valores: uma linha por opção + uma linha "credito" por troca.
-- fator = 1 - desconto/subtotal do pedido (o mesmo desconto vale para a peça nova).
-- ---------------------------------------------------------------------------
create view public.v_troca_valores with (security_invoker = true) as
with base as (
  select t.id as troca_id, t.pedido_id, t.item_id, i.qtd,
         case when coalesce(p.subtotal, 0) > 0 then 1 - coalesce(p.desconto, 0) / p.subtotal else 1 end as fator,
         coalesce(i.preco, 0) as preco_item
  from public.trocas t
  join public.pedido_itens i on i.id = t.item_id
  join public.v_pedidos p on p.id = t.pedido_id
),
pago as (
  select b.*, round(b.qtd * b.preco_item * b.fator, 2) as valor_pago_item from base b
)
select g.troca_id, g.pedido_id, g.item_id, o.id as opcao_id, 'opcao'::text as tipo, g.qtd,
       g.valor_pago_item,
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) as valor_opcao,
       round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item as diferenca,
       case
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item > 0 then 'paga_diferenca'
         when round(g.qtd * coalesce(o.preco, 0) * g.fator, 2) - g.valor_pago_item < 0 then 'credito'
         else 'sem_diferenca'
       end as situacao
from pago g
join public.troca_opcoes o on o.troca_id = g.troca_id
union all
select g.troca_id, g.pedido_id, g.item_id, null::uuid, 'credito'::text, g.qtd,
       g.valor_pago_item, 0::numeric, -g.valor_pago_item, 'credito'::text
from pago g;

-- ---------------------------------------------------------------------------
-- Sugestões (equipe): mesmo modelo em outras variantes e peças de valor parecido.
-- Não há estoque no app: quem confere a disponibilidade é a funcionária.
-- ---------------------------------------------------------------------------
create or replace function public.sugerir_troca(p_item uuid)
returns table (motivo text, variant_id bigint, produto_id bigint, sku text, produto text,
               variante text, preco numeric, foto_url text)
language sql stable security invoker set search_path = public as $$
  with it as (
    select i.shopify_variant_id, i.preco, i.nome,
           (select c.produto_id from catalogo_site c where c.variant_id = i.shopify_variant_id) as produto_id
    from pedido_itens i where i.id = p_item
  ),
  tipo as (
    select upper(split_part(coalesce(
             (select c.produto from catalogo_site c where c.variant_id = it.shopify_variant_id), it.nome), ' ', 1)) as palavra
    from it
  ),
  mesmo_modelo as (
    select 'mesmo_modelo'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url
    from catalogo_site c, it
    where it.produto_id is not null and c.produto_id = it.produto_id
      and c.variant_id is distinct from it.shopify_variant_id
      and (c.status is null or upper(c.status) = 'ACTIVE')
    order by c.variante
    limit 24
  ),
  mesmo_valor as (
    select 'mesmo_valor'::text as motivo, c.variant_id, c.produto_id, c.sku, c.produto, c.variante, c.preco, c.foto_url
    from catalogo_site c, it, tipo
    where it.preco is not null and it.preco > 0
      and c.preco between it.preco * 0.8 and it.preco * 1.2
      and upper(split_part(c.produto, ' ', 1)) = tipo.palavra
      and c.produto_id is distinct from it.produto_id
      and (c.status is null or upper(c.status) = 'ACTIVE')
    order by abs(c.preco - it.preco), c.produto
    limit 24
  )
  select * from mesmo_modelo
  union all
  select * from mesmo_valor;
$$;

-- ---------------------------------------------------------------------------
-- Páginas públicas (cliente, sem login). Nunca CPF, telefone, e-mail, endereço ou custo.
-- ---------------------------------------------------------------------------
create or replace function public.troca_publica(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_t trocas%rowtype;
  v_ped record;
  v_item pedido_itens%rowtype;
  v_pago numeric;
  v_nome text;
begin
  select * into v_t from trocas where token = p_token and status <> 'rascunho' and status <> 'cancelada';
  if not found then return null; end if;
  select numero, cliente_nome into v_ped from v_pedidos where id = v_t.pedido_id;
  select * into v_item from pedido_itens where id = v_t.item_id;
  select valor_pago_item into v_pago from v_troca_valores where troca_id = v_t.id and tipo = 'credito';
  v_nome := nullif(split_part(coalesce(v_ped.cliente_nome, ''), ' ', 1), '');
  if v_nome like '%@%' then v_nome := null; end if;
  return jsonb_build_object(
    'numero', v_ped.numero,
    'cliente', v_nome,
    'status', v_t.status,
    'escolha_tipo', v_t.escolha_tipo,
    'escolha_opcao_id', v_t.escolha_opcao_id,
    'valor_credito', coalesce(v_pago, 0),
    'item', jsonb_build_object(
      'foto_url', v_item.foto_url, 'nome', v_item.nome, 'variante', v_item.variante,
      'sku', v_item.sku, 'qtd', v_item.qtd, 'valor_pago', coalesce(v_pago, 0)),
    'opcoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'foto_url', o.foto_url, 'nome', o.nome, 'variante', o.variante, 'sku', o.sku,
        'valor', x.valor_opcao, 'diferenca', x.diferenca, 'situacao', x.situacao) order by o.ordem, o.created_at)
      from troca_opcoes o
      join v_troca_valores x on x.opcao_id = o.id
      where o.troca_id = v_t.id), '[]'::jsonb));
end $$;

create or replace function public.troca_escolher(p_token uuid, p_tipo text, p_opcao uuid default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_t trocas%rowtype;
begin
  if p_tipo not in ('opcao', 'credito', 'whatsapp') then
    raise exception 'Escolha inválida';
  end if;
  select * into v_t from trocas where token = p_token for update;
  if not found or v_t.status not in ('enviada', 'respondida') then
    raise exception 'Esta troca não aceita mais escolha';
  end if;
  if p_tipo = 'opcao' then
    if p_opcao is null or not exists (select 1 from troca_opcoes where id = p_opcao and troca_id = v_t.id) then
      raise exception 'Opção inválida';
    end if;
  else
    p_opcao := null;
  end if;
  update trocas
     set status = 'respondida', escolha_tipo = p_tipo, escolha_opcao_id = p_opcao, respondida_em = now()
   where id = v_t.id;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões e RLS
-- ---------------------------------------------------------------------------
alter table public.trocas enable row level security;
alter table public.troca_opcoes enable row level security;

create policy equipe_le on public.trocas for select to authenticated using (true);
create policy equipe_cria on public.trocas for insert to authenticated with check (true);
create policy equipe_altera on public.trocas for update to authenticated using (true) with check (true);

create policy equipe_le on public.troca_opcoes for select to authenticated using (true);
create policy equipe_cria on public.troca_opcoes for insert to authenticated with check (true);
create policy equipe_altera on public.troca_opcoes for update to authenticated using (true) with check (true);
create policy equipe_apaga on public.troca_opcoes for delete to authenticated using (true);

grant select, insert, update on public.trocas to authenticated;
grant select, insert, update, delete on public.troca_opcoes to authenticated;
grant select on public.trocas, public.troca_opcoes to service_role;
grant select on public.v_troca_valores to authenticated, service_role;

revoke all on function public.sugerir_troca(uuid) from public;
grant execute on function public.sugerir_troca(uuid) to authenticated;

revoke all on function public.troca_publica(uuid) from public;
revoke all on function public.troca_escolher(uuid, text, uuid) from public;
grant execute on function public.troca_publica(uuid) to anon, authenticated;
grant execute on function public.troca_escolher(uuid, text, uuid) to anon, authenticated;

revoke all on function public.tg_trocas_antes() from public;
revoke all on function public.tg_trocas_depois() from public;

-- Tempo real: a escolha da cliente aparece na hora (igual a pedidos).
alter publication supabase_realtime add table public.trocas;
