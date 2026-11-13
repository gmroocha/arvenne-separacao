# Inventário efetivo — Vistoria 2

Gerado por `node scripts/vistoria/inventario.mjs` em PGlite, aplicando todas as migrations locais. As marcas indicam revisão, não apenas existência. Regenerar sobrescreve este arquivo: preservar as marcas de revisão antes de regenerar.

## Critério das marcas

Revisão da versão efetiva, fronteira de acesso e participação nos fluxos; não significa que cada combinação de entradas foi esgotada. 59 migrations locais, 72 funções, 16 tabelas, 13 views e 27 gatilhos. As permissões de todas as relações e o search_path de todos os definers têm teste genérico. Dinheiro, trocas, importação e máquina de etapas têm regressões, oráculos em centavos e sequências geradas; funções auxiliares de calendário, histórico e leitura são cobertas pelos fluxos e testes do assunto. Views estatísticas foram revistas na definição e permissões; não tiveram ensaio de carga com volume real.

Exceções intencionais: quatro definers públicos verificam token. `usuario_atual_email` só devolve o próprio claim (ou “sistema”); `tg_clientes_antes` retorna trigger e não pode ser invocada diretamente para ler clientes. `feriados` é interna, lida pelos definers do calendário. Exclusão de opções de troca ainda em rascunho é permitida à equipe; pedidos, itens e registros financeiros/históricos não têm DELETE autenticado. A comparação remota após aplicação está registrada no relatório principal.

## Funções SQL

72 funções ativas. Hash SHA-256 abreviado identifica o corpo efetivo.

| Revisado | Assinatura | Última definição local | Definer | anon/equipe | Hash |
| --- | --- | --- | --- | --- | --- |
| [x] | `adicionar_itens(uuid,jsonb,boolean)` | `20261118150000_substituicao_atomica.sql` | false | false/true | d4d3dcc295ec |
| [x] | `alterar_item(uuid,jsonb)` | `20261120130000_acao_item_atomica.sql` | false | false/true | 07d5999ccf6f |
| [x] | `bipar(uuid,uuid,text)` | `20261119120000_bipagem_valida_codigo.sql` | false | false/true | 2e9535522980 |
| [x] | `bipar_ajustar(uuid,integer)` | `20261119120000_bipagem_valida_codigo.sql` | false | false/true | 4907cf86de6c |
| [x] | `categorias_catalogo()` | `20261112150000_trocas.sql` | false | false/true | ece9b0c11621 |
| [x] | `criar_venda(jsonb)` | `20261117090000_protecoes_integridade.sql` | false | false/true | 24a4d4889833 |
| [x] | `enviar_troca(uuid)` | `20261113110000_acoes.sql` | false | false/true | 5c92dc2c3821 |
| [x] | `fator_pedido(uuid)` | `20261114100000_troca_cobertura.sql` | false | false/true | 61e5b2f5d661 |
| [x] | `fechar_financeiro(uuid)` | `20261118180000_financeiro_por_parte.sql` | true | false/false | 4127a49711da |
| [x] | `feriados_ate()` | `20261119170000_calendario_feriados.sql` | true | false/true | 40c6b6d41a3d |
| [x] | `garantir_troca(uuid,uuid[])` | `20261113110000_acoes.sql` | false | false/true | 91676c9401f4 |
| [x] | `horas_uteis(timestamp with time zone,timestamp with time zone)` | `20261120110000_definer_pg_temp.sql` | true | false/true | 18df48bf3e23 |
| [x] | `importar_pedido_shopify(jsonb)` | `20261119110000_valor_exato_linha_shopify.sql` | true | false/false | a4faeebdf24b |
| [x] | `listar_inconsistencias()` | `20261119170000_calendario_feriados.sql` | false | false/true | 9a784127625c |
| [x] | `marcar_devolvido(uuid,boolean)` | `20261118190000_movimentos_financeiros.sql` | true | false/true | 05ebcdbe1d59 |
| [x] | `marcar_falta(uuid,integer,text)` | `20261120130000_acao_item_atomica.sql` | false | false/true | fb3f9d6d4158 |
| [x] | `normalizar_descontos(jsonb)` | `20261120090000_trocas_visiveis.sql` | false | false/false | 2b105323fb7a |
| [x] | `pascoa(integer)` | `20261119170000_calendario_feriados.sql` | false | false/true | 267a70a02099 |
| [x] | `prazo_envio(timestamp with time zone)` | `20261114090000_vistoria.sql` | true | false/true | c17b7cdb62da |
| [x] | `reavaliar_etapa(uuid)` | `20261119190000_gatilhos_leves.sql` | true | false/false | fb367d11cbf7 |
| [x] | `reconciliar_acertos(uuid,uuid)` | `20261119190000_gatilhos_leves.sql` | true | false/false | d0f2b3f925b2 |
| [x] | `registrar_movimento_troca(uuid,text,text)` | `20261118200000_devolucao_adicionais.sql` | true | false/false | 01d5284cf5e0 |
| [x] | `registrar_vistoria()` | `20261117100000_vigia_diario.sql` | true | false/false | 5951323c08b3 |
| [x] | `regras_etapas(jsonb)` | `20261118170000_retornar_trabalho_reaberto.sql` | false | false/true | ac0038e32b50 |
| [x] | `reiniciar_pedido(uuid,text,boolean)` | `20261118130000_preservar_devolucao_no_reinicio.sql` | false | false/true | a5004e58b155 |
| [x] | `romaneio_publico(uuid)` | `20261120140000_privacidade_romaneio.sql` | true | true/true | 102f713356c5 |
| [x] | `sair_do_desvio(uuid)` | `20261120090000_trocas_visiveis.sql` | true | false/true | 1d55967b3b5d |
| [x] | `saldo_financeiro(uuid)` | `20261118190000_movimentos_financeiros.sql` | false | false/true | e0e0aedf59e0 |
| [x] | `somar_venda(uuid,text,numeric,timestamp with time zone)` | `20261118100000_retrato_venda_somada.sql` | true | false/true | ac59f17a515f |
| [x] | `substituir_item(uuid,jsonb)` | `20261118150000_substituicao_atomica.sql` | true | false/true | d68940c406c1 |
| [x] | `sugerir_troca(uuid,text,text,numeric,text,boolean,boolean)` | `20261120090000_trocas_visiveis.sql` | false | false/true | 71f4370600ed |
| [x] | `tg_clientes_antes()` | `20261117090000_protecoes_integridade.sql` | false | true/true | 44ef56e9c9c9 |
| [x] | `tg_descontos_shopify()` | `20261120090000_trocas_visiveis.sql` | true | false/false | 1a6a897e2f5f |
| [x] | `tg_documento_reaberto()` | `20261118170000_retornar_trabalho_reaberto.sql` | true | false/false | 566dd91e6d51 |
| [x] | `tg_estorno_validar()` | `20261118190000_movimentos_financeiros.sql` | false | false/false | dce5cf22d506 |
| [x] | `tg_etapa_antes_desvio()` | `20261120090000_trocas_visiveis.sql` | false | false/false | b14afa35031b |
| [x] | `tg_fechar_financeiro()` | `20261118180000_financeiro_por_parte.sql` | true | false/false | fd38e12e9ccf |
| [x] | `tg_financeiro_imutavel()` | `20261118180000_financeiro_por_parte.sql` | false | false/false | 8f68d33c1314 |
| [x] | `tg_itens_antes()` | `20261118130000_preservar_devolucao_no_reinicio.sql` | false | false/false | 550a0e8fd509 |
| [x] | `tg_itens_antes_ins()` | `20261114090000_vistoria.sql` | false | false/false | 11fddb554c20 |
| [x] | `tg_itens_depois()` | `20261120110000_definer_pg_temp.sql` | true | false/false | f15818779aeb |
| [x] | `tg_movimento_imutavel()` | `20261118190000_movimentos_financeiros.sql` | false | false/false | 7756d847f24f |
| [x] | `tg_pedidos_antes()` | `20261118160000_travas_etapas.sql` | false | false/false | 2a6169430c5c |
| [x] | `tg_pedidos_cancela_trocas()` | `20261114090000_vistoria.sql` | true | false/false | e623a75773db |
| [x] | `tg_pedidos_depois()` | `20261120110000_definer_pg_temp.sql` | true | false/false | 81acd5cc9984 |
| [x] | `tg_retrato_somada_imutavel()` | `20261118100000_retrato_venda_somada.sql` | false | false/false | cec90bff8847 |
| [x] | `tg_saldo_itens_alterado()` | `20261119190000_gatilhos_leves.sql` | true | false/false | 6a84b3322fba |
| [x] | `tg_saldo_pagamento_alterado()` | `20261118200000_devolucao_adicionais.sql` | true | false/false | 76512e3b0057 |
| [x] | `tg_trabalho_reaberto()` | `20261118170000_retornar_trabalho_reaberto.sql` | true | false/false | c8c83c3a0e1e |
| [x] | `tg_troca_escolhas_apagada()` | `20261114130000_carrinho_falta_parcial.sql` | true | false/false | 392b7f55c54a |
| [x] | `tg_troca_escolhas_historico()` | `20261119160000_historico_carrinho_troca.sql` | true | false/false | bb8416f959aa |
| [x] | `tg_troca_opcoes_historico()` | `20261119150000_opcao_concluida_imutavel.sql` | false | false/false | ded4c73ccf77 |
| [x] | `tg_troca_pecas_depois()` | `20261120110000_definer_pg_temp.sql` | true | false/false | af3556bd7867 |
| [x] | `tg_troca_pecas_validar()` | `20261114130000_carrinho_falta_parcial.sql` | false | false/false | 6decb56540f8 |
| [x] | `tg_trocas_antes()` | `20261118190000_movimentos_financeiros.sql` | true | false/false | f1d7b83b02c7 |
| [x] | `tg_trocas_cobertura()` | `20261114100000_troca_cobertura.sql` | false | false/false | f3bbe2311752 |
| [x] | `tg_trocas_depois()` | `20261118190000_movimentos_financeiros.sql` | true | false/false | f50c8ec2c4df |
| [x] | `troca_acerto(uuid,text)` | `20261118190000_movimentos_financeiros.sql` | false | false/true | edcf54aff2fa |
| [x] | `troca_aprovar(uuid,uuid,text,uuid)` | `20261114130000_carrinho_falta_parcial.sql` | false | false/true | 7440fdb4359a |
| [x] | `troca_aprovar_carrinho(uuid,uuid)` | `20261114130000_carrinho_falta_parcial.sql` | false | false/true | a1b152d816d1 |
| [x] | `troca_carrinho(uuid,uuid,uuid,integer)` | `20261118120000_conclusao_pecas_ativas.sql` | true | true/true | cdc88bd86dca |
| [x] | `troca_carrinho_definir(uuid,uuid)` | `20261119140000_carrinho_definir_valida.sql` | true | false/true | f8865c555aa8 |
| [x] | `troca_concluir_peca(uuid,uuid,text,uuid,text,timestamp with time zone)` | `20261120090000_trocas_visiveis.sql` | true | false/true | 5525a70cb585 |
| [x] | `troca_escolher(uuid,uuid,text,uuid)` | `20261118120000_conclusao_pecas_ativas.sql` | true | true/true | 56d8a1f65be9 |
| [x] | `troca_fator(uuid)` | `20261118180000_financeiro_por_parte.sql` | false | false/true | f86160f30b37 |
| [x] | `troca_painel(uuid)` | `20261120090000_trocas_visiveis.sql` | false | false/true | 2497ac7404b7 |
| [x] | `troca_publica(uuid)` | `20261115100000_troca_pecas_ativas.sql` | true | true/true | 918dae4e6530 |
| [x] | `troca_recalcular_escolha(uuid)` | `20261114130000_carrinho_falta_parcial.sql` | true | false/false | 35cc20ae83f4 |
| [x] | `troca_saldo_liquido(uuid)` | `20261118110000_acerto_liquido.sql` | false | false/true | 842cf24aea3c |
| [x] | `troca_valor_pago(uuid)` | `20261118180000_financeiro_por_parte.sql` | false | false/true | 2b3f0553f724 |
| [x] | `usuario_atual_email()` | `20261117090000_protecoes_integridade.sql` | false | true/true | 61ae2fa6449d |
| [x] | `valor_linha_shopify(pedido_itens,text,integer,numeric)` | `20261119110000_valor_exato_linha_shopify.sql` | false | false/false | 64f20d3e2d68 |

## Tabelas e views

| Revisado | Nome | Tipo | RLS / opções | anon/equipe SELECT | equipe DELETE |
| --- | --- | --- | --- | --- | --- |
| [x] | `bipagens` | tabela | true / null | false/true | false |
| [x] | `catalogo_sincronizacao` | tabela | true / null | false/true | false |
| [x] | `catalogo_site` | tabela | true / null | false/true | false |
| [x] | `clientes` | tabela | true / null | false/true | false |
| [x] | `feedbacks` | tabela | true / null | false/true | false |
| [x] | `feriados` | tabela | true / null | false/false | false |
| [x] | `movimentos_financeiros` | tabela | true / null | false/true | false |
| [x] | `pecas_clube` | tabela | true / null | false/true | false |
| [x] | `pedido_eventos` | tabela | true / null | false/true | false |
| [x] | `pedido_itens` | tabela | true / null | false/true | false |
| [x] | `pedidos` | tabela | true / null | false/true | false |
| [x] | `troca_escolhas` | tabela | true / null | false/true | false |
| [x] | `troca_opcoes` | tabela | true / null | false/true | true |
| [x] | `troca_pecas` | tabela | true / null | false/true | false |
| [x] | `trocas` | tabela | true / null | false/true | false |
| [x] | `vistoria_execucoes` | tabela | true / null | false/true | false |
| [x] | `v_cobertura_troca_peca` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_item_liquido` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_parte_somada` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_pecas_em_varios_pedidos` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_pedido_acerto` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_pedido_alteracoes` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_pedidos` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_tempo_etapas` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_tempo_sku` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_troca_carrinho` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_troca_resumo` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_troca_valores` | view | false / ["security_invoker=true"] | false/true | false |
| [x] | `v_vistoria_resumo` | view | false / ["security_invoker=true"] | false/true | false |

## Gatilhos ativos

- [x] `clientes.clientes_antes`: `CREATE TRIGGER clientes_antes BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION tg_clientes_antes()`
- [x] `movimentos_financeiros.estorno_validar`: `CREATE TRIGGER estorno_validar BEFORE INSERT ON public.movimentos_financeiros FOR EACH ROW EXECUTE FUNCTION tg_estorno_validar()`
- [x] `movimentos_financeiros.movimento_imutavel`: `CREATE TRIGGER movimento_imutavel BEFORE DELETE OR UPDATE ON public.movimentos_financeiros FOR EACH ROW EXECUTE FUNCTION tg_movimento_imutavel()`
- [x] `pedido_itens.itens_antes`: `CREATE TRIGGER itens_antes BEFORE UPDATE ON public.pedido_itens FOR EACH ROW EXECUTE FUNCTION tg_itens_antes()`
- [x] `pedido_itens.itens_antes_ins`: `CREATE TRIGGER itens_antes_ins BEFORE INSERT ON public.pedido_itens FOR EACH ROW EXECUTE FUNCTION tg_itens_antes_ins()`
- [x] `pedido_itens.itens_depois`: `CREATE TRIGGER itens_depois AFTER UPDATE ON public.pedido_itens FOR EACH ROW EXECUTE FUNCTION tg_itens_depois()`
- [x] `pedido_itens.saldo_itens_alterado`: `CREATE TRIGGER saldo_itens_alterado AFTER UPDATE ON public.pedido_itens REFERENCING OLD TABLE AS antigos NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION tg_saldo_itens_alterado()`
- [x] `pedido_itens.trabalho_inserido`: `CREATE TRIGGER trabalho_inserido AFTER INSERT ON public.pedido_itens REFERENCING NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION tg_trabalho_reaberto()`
- [x] `pedido_itens.trabalho_reaberto`: `CREATE TRIGGER trabalho_reaberto AFTER UPDATE ON public.pedido_itens REFERENCING OLD TABLE AS antigos NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION tg_trabalho_reaberto()`
- [x] `pedidos.documento_reaberto`: `CREATE TRIGGER documento_reaberto AFTER UPDATE OF nf_emitida_em, frete_gerado_em, pedido_fornecedor_em, embalado_em, postado_em ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_documento_reaberto()`
- [x] `pedidos.fechar_financeiro`: `CREATE TRIGGER fechar_financeiro AFTER UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_fechar_financeiro()`
- [x] `pedidos.financeiro_imutavel`: `CREATE TRIGGER financeiro_imutavel BEFORE INSERT OR UPDATE OF financeiro_retrato ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_financeiro_imutavel()`
- [x] `pedidos.pedidos_antes`: `CREATE TRIGGER pedidos_antes BEFORE INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_pedidos_antes()`
- [x] `pedidos.pedidos_cancela_trocas`: `CREATE TRIGGER pedidos_cancela_trocas AFTER UPDATE OF status ON public.pedidos FOR EACH ROW WHEN (((new.status = 'cancelado'::text) AND (old.status IS DISTINCT FROM 'cancelado'::text))) EXECUTE FUNCTION tg_pedidos_cancela_trocas()`
- [x] `pedidos.pedidos_depois`: `CREATE TRIGGER pedidos_depois AFTER INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_pedidos_depois()`
- [x] `pedidos.pedidos_descontos_shopify`: `CREATE TRIGGER pedidos_descontos_shopify BEFORE INSERT OR UPDATE OF shopify_bruto ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_descontos_shopify()`
- [x] `pedidos.pedidos_etapa_desvio`: `CREATE TRIGGER pedidos_etapa_desvio BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_etapa_antes_desvio()`
- [x] `pedidos.retrato_somada_imutavel`: `CREATE TRIGGER retrato_somada_imutavel BEFORE UPDATE OF somada_retrato ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_retrato_somada_imutavel()`
- [x] `pedidos.saldo_pagamento_alterado`: `CREATE TRIGGER saldo_pagamento_alterado AFTER UPDATE OF valor_pago, valor_total, frete_cobrado ON public.pedidos FOR EACH ROW EXECUTE FUNCTION tg_saldo_pagamento_alterado()`
- [x] `troca_escolhas.troca_escolhas_apagada`: `CREATE TRIGGER troca_escolhas_apagada AFTER DELETE ON public.troca_escolhas FOR EACH ROW EXECUTE FUNCTION tg_troca_escolhas_apagada()`
- [x] `troca_escolhas.troca_escolhas_historico`: `CREATE TRIGGER troca_escolhas_historico AFTER INSERT OR DELETE OR UPDATE ON public.troca_escolhas FOR EACH ROW EXECUTE FUNCTION tg_troca_escolhas_historico()`
- [x] `troca_opcoes.troca_opcoes_historico`: `CREATE TRIGGER troca_opcoes_historico BEFORE INSERT OR UPDATE ON public.troca_opcoes FOR EACH ROW EXECUTE FUNCTION tg_troca_opcoes_historico()`
- [x] `troca_pecas.troca_pecas_depois`: `CREATE TRIGGER troca_pecas_depois AFTER UPDATE ON public.troca_pecas FOR EACH ROW EXECUTE FUNCTION tg_troca_pecas_depois()`
- [x] `troca_pecas.troca_pecas_validar`: `CREATE TRIGGER troca_pecas_validar BEFORE UPDATE ON public.troca_pecas FOR EACH ROW EXECUTE FUNCTION tg_troca_pecas_validar()`
- [x] `trocas.trocas_antes`: `CREATE TRIGGER trocas_antes BEFORE INSERT OR UPDATE ON public.trocas FOR EACH ROW EXECUTE FUNCTION tg_trocas_antes()`
- [x] `trocas.trocas_cobertura`: `CREATE TRIGGER trocas_cobertura BEFORE UPDATE ON public.trocas FOR EACH ROW EXECUTE FUNCTION tg_trocas_cobertura()`
- [x] `trocas.trocas_depois`: `CREATE TRIGGER trocas_depois AFTER UPDATE ON public.trocas FOR EACH ROW EXECUTE FUNCTION tg_trocas_depois()`
