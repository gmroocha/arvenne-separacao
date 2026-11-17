-- Venda do WhatsApp só vai para paga com dados completos; "Editar dados do pedido" corrige o frete já pago
-- (decisões do Gustavo, 17/11/2026).
--
-- 1) faltas_para_pagar(p jsonb): lista o que falta numa venda para ser marcada como paga (fonte da verdade;
--    o app tem um espelho em src/lib/faltasPagar.ts para avisar na hora, e um teste confere os dois).
-- 2) tg_pedidos_antes (cópia de 20261122140000_frete_e_time.sql): ao sair de em_aberto/aguardando_pagamento
--    para a esteira, venda do WhatsApp recusa com a lista do que falta. Shopify e somar_venda ficam fora.
-- 3) corrigir_frete_pedido: pedido já pago, a cliente pagou o frete junto; ao mudar quem paga ou o frete que a
--    cliente pagou, o valor pago sobe/desce na mesma diferença (nada fica a receber) e a correção entra no
--    histórico como nota. Recusa o que não dá para manter com o saldo igual.

create function public.faltas_para_pagar(p jsonb) returns text[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  f text[] := '{}';
  v_tel  text := regexp_replace(coalesce(p->>'cliente_telefone', ''), '\D', '', 'g');
  v_doc  text := regexp_replace(coalesce(p->>'cliente_cpf', ''), '\D', '', 'g');
  v_cep  text := regexp_replace(coalesce(p->>'entrega_cep', ''), '\D', '', 'g');
  v_tipo text := nullif(btrim(coalesce(p->>'frete_tipo', '')), '');
  v_por  text := nullif(btrim(coalesce(p->>'frete_pago_por', '')), '');
  v_cobrado numeric := coalesce(nullif(btrim(coalesce(p->>'frete_cobrado', '')), '')::numeric, 0);
begin
  if btrim(coalesce(p->>'cliente_nome', '')) = '' then f := array_append(f, 'nome da cliente'); end if;
  if length(v_tel) not between 10 and 11 then f := array_append(f, 'telefone com DDD'); end if;
  if length(v_doc) not in (11, 14) then f := array_append(f, 'CPF ou CNPJ'); end if;
  if v_tipo is null or v_tipo not in ('PAC', 'SEDEX', 'retirada', 'outro') then f := array_append(f, 'tipo de frete'); end if;
  if v_por is null or v_por not in ('cliente', 'arvenne') then
    f := array_append(f, 'quem paga o frete');
  elsif v_por = 'cliente' and v_tipo is not null and v_tipo <> 'retirada' and v_cobrado <= 0 then
    f := array_append(f, 'frete que a cliente pagou');
  end if;
  -- Retirada não tem endereço de entrega.
  if v_tipo is distinct from 'retirada' then
    if length(v_cep) <> 8 then f := array_append(f, 'CEP'); end if;
    if btrim(coalesce(p->>'entrega_logradouro', '')) = '' then f := array_append(f, 'rua'); end if;
    if btrim(coalesce(p->>'entrega_numero', '')) = '' then f := array_append(f, 'número do endereço'); end if;
    if btrim(coalesce(p->>'entrega_bairro', '')) = '' then f := array_append(f, 'bairro'); end if;
    if btrim(coalesce(p->>'entrega_cidade', '')) = '' then f := array_append(f, 'cidade'); end if;
    if length(btrim(coalesce(p->>'entrega_uf', ''))) <> 2 then f := array_append(f, 'UF'); end if;
  end if;
  return f;
end $$;
revoke all on function public.faltas_para_pagar(jsonb) from public, anon;
grant execute on function public.faltas_para_pagar(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Gatilho de pedidos: venda do WhatsApp só vai para paga com os dados completos
--    (cópia de 20261122140000_frete_e_time.sql; muda só o bloco marcado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_pedidos_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v record;
  v_acerto boolean;
  v_regras jsonb;
  v_motivo text;
  v_faltas text[];
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    if new.status='somada' and (new.somar_em is null or new.somada_em is null
        or new.somada_valor is null or new.somada_retrato is null) then
      raise exception 'Use a operação de somar a venda: faltam o vínculo e o retrato da compra';
    end if;
    select count(*)::int as linhas,coalesce(sum(qtd),0)::int as pecas,
      (count(*) filter (where status='encontrado'))::int as encontradas,
      (count(*) filter (where status='encontrado' and conferido_em is not null))::int as conferidas,
      (count(*) filter (where status='encontrado' and etiquetado_em is not null))::int as etiquetadas,
      coalesce(sum(qtd_bipada),0)::int as bipadas into v
    from public.pedido_itens where pedido_id=new.id and status<>'removido';
    if new.status in ('embalagem','frete','pronto_envio','enviado') then
      select acerto_pendente into v_acerto from public.v_pedidos where id=new.id;
    end if;
    v_regras := public.regras_etapas(jsonb_build_object(
      'status',case when tg_op='INSERT' then new.status else old.status end,'inserindo',tg_op='INSERT',
      'linhas',v.linhas,'pecas',v.pecas,'encontradas',v.encontradas,'conferidas',v.conferidas,
      'etiquetadas',v.etiquetadas,'bipadas',v.bipadas,'nota',new.nf_emitida_em,
      'frete',new.frete_gerado_em,'fornecedor',new.pedido_fornecedor_em,'embalado',new.embalado_em,
      'postado',new.postado_em,'acerto',coalesce(v_acerto,false)));
    v_motivo := coalesce(v_regras->>new.status,case when not v_regras ? new.status then 'Etapa inválida' end);
    if v_motivo is not null then raise exception '%',v_motivo; end if;
  end if;

  if tg_op = 'INSERT' then
    if new.numero is null or new.numero = '' then
      new.numero := 'W' || lpad(nextval('public.pedido_whatsapp_seq')::text, 4, '0');
    end if;
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      new.status_desde := now();
      if old.status in ('em_aberto', 'aguardando_pagamento')
         and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
        if not exists (select 1 from public.pedido_itens where pedido_id = new.id and status <> 'removido') then
          raise exception 'A venda não tem nenhuma peça. Adicione as peças antes de marcar como paga.';
        end if;
        if exists (select 1 from public.pedido_itens
                   where pedido_id = new.id and status <> 'removido' and preco is null) then
          raise exception 'Há peça sem preço. Informe o preço de todas as peças antes de marcar como paga.';
        end if;
        -- Venda do WhatsApp só vira pedido pago com os dados completos (nome, telefone, documento, frete e
        -- endereço). Pedido da Shopify e venda somada (somar_venda) ficam fora: a somada usa os dados do principal.
        if new.origem = 'whatsapp' and new.status <> 'somada' then
          v_faltas := public.faltas_para_pagar(jsonb_build_object(
            'cliente_nome', new.cliente_nome, 'cliente_telefone', new.cliente_telefone, 'cliente_cpf', new.cliente_cpf,
            'frete_tipo', new.frete_tipo, 'frete_pago_por', new.frete_pago_por, 'frete_cobrado', new.frete_cobrado,
            'entrega_cep', new.entrega_cep, 'entrega_logradouro', new.entrega_logradouro,
            'entrega_numero', new.entrega_numero, 'entrega_bairro', new.entrega_bairro,
            'entrega_cidade', new.entrega_cidade, 'entrega_uf', new.entrega_uf));
          if cardinality(v_faltas) > 0 then
            raise exception 'Falta para marcar como pago: %.', array_to_string(v_faltas, ', ');
          end if;
        end if;
      end if;
    end if;
  end if;
  if new.pago_em is null
     and new.status not in ('em_aberto', 'aguardando_pagamento', 'perdida', 'cancelado') then
    new.pago_em := now();
  end if;
  return new;
end $function$;
revoke all on function public.tg_pedidos_antes() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Corrigir o frete de pedido já pago (Editar dados do pedido)
-- ---------------------------------------------------------------------------
create function public.corrigir_frete_pedido(p_pedido uuid, p_pago_por text, p_cobrado numeric default null,
  p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.pedidos%rowtype;
  v_dados public.pedidos%rowtype;
  v_financeiro_mudou boolean;
  v_principal text;
  v_cobrado numeric(10,2);
  v_antes_conta numeric(10,2);
  v_depois_conta numeric(10,2);
  v_delta numeric(10,2);
  v_pago_novo numeric(10,2);
  a record;
  d record;
  v_texto text;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do pedido inválidos.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_dados) as k(campo) where campo not in (
    'cliente_nome','cliente_telefone','cliente_email','cliente_cpf','entrega_cep','entrega_logradouro',
    'entrega_numero','entrega_complemento','entrega_bairro','entrega_cidade','entrega_uf','frete_tipo','frete_custo')) then
    raise exception 'Campo não permitido na correção dos dados do pedido.';
  end if;
  if p_pago_por is null or p_pago_por not in ('cliente', 'arvenne') then
    raise exception 'Escolha quem paga o frete: cliente ou Arvenne.';
  end if;
  if p_pago_por = 'cliente' then
    if p_cobrado is null then raise exception 'Informe o frete que a cliente pagou.'; end if;
    if p_cobrado < 0 or p_cobrado >= 100000000 then raise exception 'O frete que a cliente pagou não pode ser negativo.'; end if;
    v_cobrado := round(p_cobrado, 2);
  else
    v_cobrado := 0; -- frete grátis: nada do frete entra na conta da cliente
  end if;

  select * into v from public.pedidos where id = p_pedido and excluido_em is null for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v.status = 'somada' then
    select numero into v_principal from public.pedidos where id = v.somar_em;
    raise exception 'Esta venda foi somada ao pedido %. Corrija o frete no pedido principal.', coalesce(v_principal, '');
  end if;
  if v.status in ('em_aberto', 'aguardando_pagamento') then
    raise exception 'A venda ainda não foi paga: ajuste o frete no formulário da venda.';
  end if;
  if v.status in ('enviado', 'cancelado', 'perdida') then
    raise exception 'O pedido já está no Arquivo: o frete pago não pode mais ser corrigido.';
  end if;
  if v.origem = 'shopify' then
    raise exception 'O frete de pedido da Shopify vem da loja e não é corrigido aqui.';
  end if;
  if v.pago_em is null or v.valor_pago is null then
    raise exception 'Este pedido não tem valor pago registrado: confira o pagamento antes de corrigir o frete.';
  end if;

  select * into a from public.v_pedidos where id = p_pedido;
  if a.total_pago is null or public.saldo_financeiro(p_pedido) is null then
    raise exception 'Este pedido tem acerto antigo sem controle de movimentos: confira os valores antes de corrigir o frete.';
  end if;

  v_antes_conta := case when v.frete_pago_por = 'cliente' then coalesce(v.frete_cobrado, 0) else 0 end;
  v_depois_conta := v_cobrado;
  v_delta := v_depois_conta - v_antes_conta;
  v_financeiro_mudou := v.frete_pago_por is distinct from p_pago_por or coalesce(v.frete_cobrado, 0) <> v_cobrado;
  if not v_financeiro_mudou and p_dados = '{}'::jsonb then
    return; -- nada mudou
  end if;
  v_pago_novo := v.valor_pago + v_delta;
  if v_pago_novo < 0 then
    raise exception 'Com este frete o valor pago ficaria negativo (R$ %). Confira os valores.', to_char(v_pago_novo, 'FM990.00');
  end if;

  -- Cliente, endereço, tipo e custo do frete acompanham a correção financeira na mesma transação.
  -- Só os campos da lista acima são aceitos; status, pagamento e vínculos não vêm do navegador.
  v_dados := jsonb_populate_record(v, p_dados);
  update public.pedidos
     set frete_pago_por = p_pago_por, frete_cobrado = v_cobrado, valor_pago = v_pago_novo,
         cliente_nome = v_dados.cliente_nome, cliente_telefone = v_dados.cliente_telefone,
         cliente_email = v_dados.cliente_email, cliente_cpf = v_dados.cliente_cpf,
         entrega_cep = v_dados.entrega_cep, entrega_logradouro = v_dados.entrega_logradouro,
         entrega_numero = v_dados.entrega_numero, entrega_complemento = v_dados.entrega_complemento,
         entrega_bairro = v_dados.entrega_bairro, entrega_cidade = v_dados.entrega_cidade,
         entrega_uf = v_dados.entrega_uf, frete_tipo = v_dados.frete_tipo, frete_custo = v_dados.frete_custo
   where id = p_pedido;

  -- O saldo, o que falta devolver e o acerto têm de ficar exatamente como estavam (a diferença do frete
  -- entra de um lado e do outro). Se não fecharem, nada é gravado.
  select * into d from public.v_pedidos where id = p_pedido;
  if d.total_pago is null or d.total_pago < 0 or d.total_geral < 0
     or public.saldo_financeiro(p_pedido) is null
     or abs(public.saldo_financeiro(p_pedido) - (a.total_geral - a.total_pago + a.a_devolver)) > 0.004
     or d.a_devolver is distinct from a.a_devolver
     or d.acerto_pendente is distinct from a.acerto_pendente then
    raise exception 'Não foi possível corrigir o frete mantendo o acerto do pedido. Nada foi alterado.';
  end if;

  if v_financeiro_mudou then
    v_texto := 'Frete corrigido: '
    || case v.frete_pago_por when 'cliente' then 'cliente pagou R$ ' || replace(to_char(v_antes_conta, 'FM999999990.00'), '.', ',')
                             when 'arvenne' then 'Arvenne pagou (frete grátis)' else 'sem registro' end
    || ' → '
    || case p_pago_por when 'cliente' then 'cliente pagou R$ ' || replace(to_char(v_cobrado, 'FM999999990.00'), '.', ',')
                       else 'Arvenne paga (frete grátis)' end
    || ' · valor pago R$ ' || replace(to_char(v.valor_pago, 'FM999999990.00'), '.', ',')
    || ' → R$ ' || replace(to_char(v_pago_novo, 'FM999999990.00'), '.', ',');
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (p_pedido, 'nota', v_texto, public.usuario_atual_email());
  end if;
  if v_dados.frete_tipo is distinct from v.frete_tipo or v_dados.frete_custo is distinct from v.frete_custo then
    insert into public.pedido_eventos (pedido_id, tipo, texto, usuario_email)
    values (p_pedido, 'nota', 'Frete alterado: ' || coalesce(v.frete_tipo, '—') || ' → ' || coalesce(v_dados.frete_tipo, '—')
      || case when v_dados.frete_custo is not null then ' · custo R$ ' || replace(to_char(v_dados.frete_custo, 'FM999999990.00'), '.', ',') else '' end,
      public.usuario_atual_email());
  end if;
end $$;
revoke all on function public.corrigir_frete_pedido(uuid, text, numeric, jsonb) from public, anon;
grant execute on function public.corrigir_frete_pedido(uuid, text, numeric, jsonb) to authenticated;
