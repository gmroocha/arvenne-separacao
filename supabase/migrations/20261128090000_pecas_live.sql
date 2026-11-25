-- Peças da Live: catálogo novo, igual ao Clube, com a data da live (uma data por peça).
-- Reaproveita pecas_clube/clube_modelos com o campo "catalogo" ('clube' padrão ou 'live'). A peça da live entra no pedido
-- como origem 'clube' com peca_clube_id: pedido_itens, trocas, acerto e dinheiro não mudam.

alter table public.pecas_clube
  add column catalogo text not null default 'clube' check (catalogo in ('clube','live')),
  add column live_em date,
  add constraint pecas_clube_live_data check ((catalogo = 'live') = (live_em is not null));
alter table public.clube_modelos
  add column catalogo text not null default 'clube' check (catalogo in ('clube','live')),
  add column live_em date,
  add constraint clube_modelos_live_data check ((catalogo = 'live') = (live_em is not null));
create index pecas_clube_catalogo on public.pecas_clube (catalogo, live_em desc);

-- Datas de live com peças ativas e a contagem, a mais recente primeiro (alimenta o seletor de live).
create or replace function public.lives() returns table (live_em date, pecas int)
language sql stable set search_path to 'public','pg_temp' as $$
  select p.live_em, count(*)::int
    from public.pecas_clube p
   where p.catalogo = 'live' and p.ativo
   group by p.live_em
   order by p.live_em desc
$$;
revoke all on function public.lives() from public, anon;
grant execute on function public.lives() to authenticated, service_role;

-- salvar_modelo_clube: agora aceita "catalogo" e "live_em" no item e propaga às variantes. Sem eles, igual a antes.
create or replace function public.salvar_modelo_clube(p jsonb) returns jsonb
language plpgsql set search_path to 'public','pg_temp' as $$
declare
  v_itens  jsonb;
  v_item   jsonb;
  v_var    jsonb;
  v_n      int := 0;
  v_modelo uuid;
  v_nome   text;
  v_codigo text;
  v_foto   text;
  v_preco  numeric;
  v_pv     numeric;
  v_codv   text;
  v_varia  text;
  v_ativo  boolean;
  v_cat    text;
  v_live   date;
  v_tem_cat boolean;
  v_codigos text[];
  v_peca   public.pecas_clube%rowtype;
  v_pecas  jsonb;
  v_res    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p) not in ('array','object') then raise exception 'Informe a peça ou a lista de peças'; end if;
  v_itens := case when jsonb_typeof(p) = 'array' then p else jsonb_build_array(p) end;
  if jsonb_array_length(v_itens) = 0 then raise exception 'Nenhuma peça para salvar'; end if;
  for v_item in select value from jsonb_array_elements(v_itens) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Linha %: dados inválidos', v_n; end if;
    v_nome := btrim(coalesce(v_item->>'nome',''));
    v_codigo := btrim(coalesce(v_item->>'codigo',''));
    v_foto := nullif(btrim(coalesce(v_item->>'foto_url','')),'');
    if v_nome = '' then raise exception 'Linha %: informe o nome', v_n; end if;
    if v_codigo = '' then raise exception 'Linha %: informe o código', v_n; end if;
    begin
      v_preco := nullif(btrim(coalesce(v_item->>'preco','')),'')::numeric;
    exception when others then
      raise exception 'Linha %: preço inválido', v_n;
    end;
    if v_preco is not null and v_preco < 0 then raise exception 'Linha %: o preço não pode ser negativo', v_n; end if;
    v_ativo := case when v_item ? 'ativo' then (v_item->>'ativo')::boolean end;
    -- Catálogo da peça: 'clube' (padrão) ou 'live' (com a data da live). Sem os campos, comporta-se como antes.
    v_tem_cat := (v_item ? 'catalogo') or (v_item ? 'live_em');
    v_cat := coalesce(nullif(btrim(coalesce(v_item->>'catalogo','')),''), 'clube');
    if v_cat not in ('clube','live') then raise exception 'Linha %: catálogo inválido', v_n; end if;
    begin
      v_live := nullif(btrim(coalesce(v_item->>'live_em','')),'')::date;
    exception when others then
      raise exception 'Linha %: data da live inválida', v_n;
    end;
    if v_cat = 'live' and v_live is null then raise exception 'Linha %: informe a data da live', v_n; end if;
    if v_cat = 'clube' then v_live := null; end if;

    if jsonb_array_length(coalesce(v_item->'variantes','[]'::jsonb)) = 0 and nullif(v_item->>'id','') is null then
      -- Peça simples (sem pai).
      insert into public.pecas_clube (codigo, nome, variante, foto_url, preco, ativo, catalogo, live_em)
      values (v_codigo, v_nome, nullif(btrim(coalesce(v_item->>'variante','')),''), v_foto, v_preco, coalesce(v_ativo, true), v_cat, v_live)
      returning * into v_peca;
      v_res := v_res || jsonb_build_object('modelo_id', null, 'pecas', jsonb_build_array(to_jsonb(v_peca)));
      continue;
    end if;

    -- Produto com variantes.
    v_codigos := array[]::text[];
    if nullif(v_item->>'id','') is null then
      insert into public.clube_modelos (nome, foto_url, codigo_base, preco, ativo, catalogo, live_em)
      values (v_nome, v_foto, v_codigo, v_preco, coalesce(v_ativo, true), v_cat, v_live) returning id into v_modelo;
    else
      v_modelo := (v_item->>'id')::uuid;
      update public.clube_modelos set nome = v_nome, foto_url = v_foto, codigo_base = v_codigo, preco = v_preco,
             ativo = coalesce(v_ativo, ativo),
             catalogo = case when v_tem_cat then v_cat else catalogo end,
             live_em = case when v_tem_cat then v_live else live_em end
       where id = v_modelo;
      if not found then raise exception 'Linha %: produto não encontrado', v_n; end if;
      if v_ativo is not null then update public.pecas_clube set ativo = v_ativo where modelo_id = v_modelo; end if;
      if v_tem_cat then update public.pecas_clube set catalogo = v_cat, live_em = v_live where modelo_id = v_modelo; end if;
    end if;
    v_pecas := '[]'::jsonb;
    for v_var in select value from jsonb_array_elements(coalesce(v_item->'variantes','[]'::jsonb)) loop
      v_codv := btrim(coalesce(v_var->>'codigo',''));
      v_varia := btrim(coalesce(v_var->>'variante',''));
      if v_codv = '' then raise exception 'Linha %: informe o código de cada variante', v_n; end if;
      if v_varia = '' then raise exception 'Linha %: informe a variante do código %', v_n, v_codv; end if;
      if lower(v_codv) = any(v_codigos) then raise exception 'Linha %: o código % se repete nas variantes', v_n, v_codv; end if;
      v_codigos := v_codigos || lower(v_codv);
      begin
        v_pv := coalesce(nullif(btrim(coalesce(v_var->>'preco','')),'')::numeric, v_preco);
      exception when others then
        raise exception 'Linha %: preço inválido na variante %', v_n, v_codv;
      end;
      if v_pv is not null and v_pv < 0 then raise exception 'Linha %: o preço não pode ser negativo', v_n; end if;
      if nullif(v_var->>'id','') is null then
        insert into public.pecas_clube (codigo, nome, variante, foto_url, preco, ativo, modelo_id, catalogo, live_em)
        values (v_codv, v_nome, v_varia, coalesce(nullif(btrim(coalesce(v_var->>'foto_url','')),''), v_foto), v_pv,
                coalesce((v_var->>'ativo')::boolean, v_ativo, true), v_modelo,
                (select m.catalogo from public.clube_modelos m where m.id = v_modelo),
                (select m.live_em from public.clube_modelos m where m.id = v_modelo))
        returning * into v_peca;
      else
        update public.pecas_clube set codigo = v_codv, nome = v_nome, variante = v_varia, preco = v_pv,
               foto_url = coalesce(nullif(btrim(coalesce(v_var->>'foto_url','')),''), v_foto),
               ativo = coalesce((v_var->>'ativo')::boolean, ativo)
         where id = (v_var->>'id')::uuid and modelo_id = v_modelo
        returning * into v_peca;
        if not found then raise exception 'Linha %: variante % não encontrada neste produto', v_n, v_codv; end if;
      end if;
      v_pecas := v_pecas || jsonb_build_array(to_jsonb(v_peca));
    end loop;
    v_res := v_res || jsonb_build_object('modelo_id', v_modelo, 'pecas', v_pecas);
  end loop;
  return v_res;
end $$;
revoke all on function public.salvar_modelo_clube(jsonb) from public, anon;
grant execute on function public.salvar_modelo_clube(jsonb) to authenticated, service_role;
