// Volume parecido com o real (V115): ~300 pedidos, ~2 mil peças, 150 trocas, equipe de gestor + 3 funcionárias.
// Monta tudo em lote, como dono do banco. É DETERMINÍSTICO (nada depende do uuid sorteado): dois bancos montados com
// este mesmo arquivo ficam com os mesmos pedidos por número (W0001...), o que permite comparar versões do banco.
export const UG = '33333333-3333-4333-8333-333333333333'
export const UA = '11111111-1111-4111-8111-111111111111'
export const UB = '22222222-2222-4222-8222-222222222222'
export const UC = '44444444-4444-4444-8444-444444444444'
export const ETAPAS = ['separacao', 'conferencia', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio', 'enviado']
const NIVEIS = ['novo', 'separacao', 'conferencia', 'bipagem', 'faturamento', 'embalagem', 'pronto_envio', 'enviar_rastreio', 'enviado']

export async function montarVolume(db, { pedidos = 300, trocas = 150 } = {}) {
  await db.exec('reset role')
  // A sequência dos números (W0001...) não volta com o rollback dos testes: recomeça para o volume ser sempre o mesmo.
  await db.exec("select setval('public.pedido_whatsapp_seq', 1, false)")
  await db.exec(`insert into equipe (nome, papel, user_id, ativo) values
    ('Gestor','gestor','${UG}',true), ('Ana','funcionaria','${UA}',true), ('Bia','funcionaria','${UB}',true), ('Cida','funcionaria','${UC}',true)`)
  const por = Object.fromEntries((await db.query('select id, nome from equipe')).rows.map((e) => [e.nome, e.id]))
  // Pedidos: 2/3 do WhatsApp, 1/3 da Shopify, todos pagos, espalhados pelas etapas (a maioria já concluída).
  await db.exec(`insert into pedidos (origem, status, cliente_nome, cliente_telefone, cliente_cpf, frete_tipo, frete_pago_por, entrega_cep,
      entrega_logradouro, entrega_numero, entrega_bairro, entrega_cidade, entrega_uf, shopify_order_id, valor_total)
    select case when n % 3 = 0 then 'shopify' else 'whatsapp' end, 'novo', 'Cliente ' || n, '11987654321', '12345678909', 'PAC', 'arvenne', '01001000',
      'Praça da Sé', '100', 'Sé', 'São Paulo', 'SP', case when n % 3 = 0 then 500000 + n end, case when n % 3 = 0 then 100 end
    from generate_series(1, ${pedidos}) n`)
  const ped = (await db.query('select id, origem, numero from pedidos order by numero')).rows
  // ~6,7 peças por pedido (2 mil no total).
  await db.exec(`insert into pedido_itens (pedido_id, origem, nome, sku, variante, qtd, preco, ordem)
    select p.id, case when p.origem = 'shopify' then 'shopify' else 'avulso' end, 'Peça ' || k, 'SKU-' || (k % 40), 'Aro ' || (k % 5), 1 + (k % 2), 50 + k, k
    from pedidos p cross join lateral generate_series(1, 6 + (abs(hashtext(p.numero)) % 2) + (case when abs(hashtext(p.numero)) % 3 = 0 then 1 else 0 end)) k`)
  await db.exec("update pedidos set pago_em = now() - ((abs(hashtext(numero)) % 20) || ' days')::interval - interval '7 hours', valor_pago = 100 where status = 'novo'")
  // Cada pedido numa etapa, com o trabalho das anteriores feito (como prepararEtapa dos testes).
  const dist = [['separacao', 30], ['conferencia', 15], ['bipagem', 15], ['faturamento', 10], ['embalagem', 15], ['pronto_envio', 10], ['enviar_rastreio', 5], ['enviado', 200]]
  let i = 0
  for (const [etapa, qtd] of dist) {
    const fatia = ped.slice(i, i + qtd)
    i += qtd
    // Pedido da Shopify pula "Enviar rastreio".
    const ids = fatia.filter((p) => etapa !== 'enviar_rastreio' || p.origem !== 'shopify').map((p) => `'${p.id}'`).join(',')
    if (!ids) continue
    const n = NIVEIS.indexOf(etapa)
    if (n >= 2) await db.exec(`update pedido_itens set status='encontrado' where pedido_id in (${ids})`)
    if (n >= 3) await db.exec(`update pedido_itens set conferido_em=now(),etiquetado_em=now() where pedido_id in (${ids})`)
    if (n >= 4) await db.exec(`update pedido_itens set qtd_bipada=qtd,bipado_em=now() where pedido_id in (${ids})`)
    if (n >= 5) await db.exec(`update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now() where id in (${ids})`)
    if (n >= 6) await db.exec(`update pedidos set embalado_em=now(),frete_gerado_em=now(),frete_peso_g=450 where id in (${ids})`)
    if (n >= 7) await db.exec(`update pedidos set postado_em=now() where id in (${ids})`)
    if (n >= 8) await db.exec(`update pedidos set rastreio_enviado_em=case when origem<>'shopify' then now() end where id in (${ids})`)
    await db.exec(`update pedidos set status='${etapa}' where id in (${ids})`)
  }
  // Responsáveis: cada etapa com uma funcionária (rodízio), em 90% dos casos.
  await db.query(`update pedidos set responsaveis = (
      select coalesce(jsonb_object_agg(e, ($1::text[])[1 + (abs(hashtext(pedidos.numero || e)) % 3)]), '{}'::jsonb)
      from unnest($2::text[]) e where abs(hashtext(pedidos.numero || e || 'x')) % 10 <> 0)`, [[por.Ana, por.Bia, por.Cida], ETAPAS])
  // Trocas nos primeiros pedidos: 30 em andamento (enviadas), o resto concluído.
  const lista = ped.slice(0, trocas).map((p) => `'${p.id}'`).join(',')
  await db.exec(`insert into trocas (pedido_id, status, enviada_em) select id, 'enviada', now() from pedidos where id in (${lista})`)
  await db.exec(`insert into troca_pecas (troca_id, item_id)
    select t.id, i.id from trocas t join lateral (select id from pedido_itens where pedido_id = t.pedido_id order by ordem limit 2) i on true`)
  await db.exec(`insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco, ordem)
    select tp.id, 'clube', 'Opção ' || o, 'OP-' || o, 60 + o * 10, o from troca_pecas tp cross join generate_series(1, 3) o`)
  await db.exec(`insert into troca_escolhas (troca_peca_id, opcao_id, qtd)
    select tp.id, (select id from troca_opcoes o where o.troca_peca_id = tp.id order by ordem limit 1), 1 from troca_pecas tp`)
  const concluidas = `select t.id from trocas t join pedidos p on p.id = t.pedido_id where p.numero > '${ped[29].numero}'`
  await db.exec(`update troca_pecas set escolha_tipo = 'opcao', concluida_em = now(),
      resultado_diferenca = 10 + 5 * (select ordem from pedido_itens i where i.id = troca_pecas.item_id) where troca_id in (${concluidas})`)
  // Metade das trocas concluídas com cobertura da loja (cobrir_ate), para o rateio ter o que dividir.
  await db.exec(`update trocas set status = 'concluida', concluida_em = now(), cobrir_ate = 12 where id in (${concluidas})`)
  // Peças que nasceram das trocas concluídas (duas por peça trocada, com valor pago por linha), como troca_concluir_peca cria.
  // Sem gatilhos: os pedidos já concluídos não aceitam peça nova, e aqui só importa ter os dados para o rateio da cobertura.
  await db.exec('set session_replication_role = replica')
  await db.exec(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, ordem, valor_pago_linha, troca_peca_origem_id, observacao)
    select t.pedido_id, 'clube', 'Troca ' || q, 'TR-' || oi.ordem || '-' || q, q, 60 + q * 10, 100 + 10 * oi.ordem + q, (60 + q * 10) * q, tp.id, 'troca de x'
      from troca_pecas tp join trocas t on t.id = tp.troca_id join pedido_itens oi on oi.id = tp.item_id
      cross join generate_series(1, 2) q where tp.concluida_em is not null`)
  await db.exec('set session_replication_role = origin')
  await db.exec('analyze')
  return { por, numeros: ped.map((p) => p.numero) }
}
