# Vistoria 2 — Arvenne Separação

## Retomar daqui

- **Fase/item atual:** Fase 2, bloco de integrações V42–V44; verificar suíte completa antes de aplicar.
- **Base:** `3ce7b4a`, árvore limpa no início, 12/11/2026 (São Paulo).
- **Concluído:** documento inicial em `42c8af6`; linha de base completa local; catálogo efetivo (71 funções, 13 views, 16 tabelas, 27 gatilhos, 56 migrations); métricas remotas e primeira conferência publicada.
- **Em andamento:** V42 em `2fcb2f3`, V43 em `8808918`; V44 em `447774f`; V45 com migration e testes de segurança; V46 em investigação no catálogo. Nenhuma migration/Edge aplicada ainda. Dry-run V44 conferido; repetir com todas as migrations antes de aplicar. Scripts e linha de base em `f1f793e`.
- **Próximo passo exato:** rodar `npm test`; aplicar `20261120100000_leituras_vistoria2.sql` com dry-run, regenerar tipos, publicar `shopify-sync` e `carrinho-ler`; medir os dois planos antes bloqueados. Prosseguir dinheiro, etapas e UI.
- **Ao continuar:** ler esta seção, `git status`, `git log -10`; concluir alterações pendentes antes de iniciar outro defeito.

### Checklist do inventário

- [x] Ler regras, histórico V01–V41, testes e decisões anteriores.
- [x] Fase 0: testes, lint e bundle por chunk.
- [x] Fase 0: inconsistências e advisors; quatro planos medidos, dois bloqueados por GRANT (ver limitações).
- [x] Fase 0: site publicado e medidas móveis de laboratório; Lighthouse/INP ainda pendentes.
- [x] Fase 1: rotas, componentes de fluxo, integrações e catálogo SQL efetivo.
- [ ] Fase 2: dinheiro e conservação, inclusive desconto composto e reembolso.
- [ ] Fase 2: etapas, desvios, repetição, concorrência e trabalho reaberto.
- [ ] Fase 2: Shopify, catálogo, clientes, carrinho, ViaCEP, Zebra e links.
- [ ] Fase 2: segurança, permissões e páginas públicas.
- [ ] Fase 2: design, acessibilidade e estados nas três larguras e dois temas.
- [ ] Fase 2: desempenho, código e dependências.
- [ ] Fase 3: propriedades, contratos Edge, e2e, visual, axe e desempenho.
- [ ] Fase 4: testes finais, migrations/tipos/Edges necessários, push e conferência publicada.
- [ ] Entrega: Estado atual, métricas antes/depois, pendências e resumo em português.

## Escopo e proteções

Autorização explícita no pedido da Vistoria 2 para migrations (dry-run antes de aplicar), deploy das Edges, regeneração de tipos e push. Não inclui apagar/reconstruir pedidos, alterar segredos ou Authentication, nem chamar Edge fora do login. Testes usam PGlite e credenciais fictícias. Conferência publicada permite login de teste com gravações bloqueadas; nenhum segredo ou dado pessoal será registrado aqui.

Os avisos de ARV-1273/1274/1276/1277 e W0001/W0006/W0007/W0008 são históricos conhecidos: investigar causas, preservar os dados. V01–V41 continuam cobertos pelos testes anteriores; IDs novos começam em V42.

## Linha de base — antes × depois

| Medida | Antes (`3ce7b4a`) | Depois |
| --- | --- | --- |
| `npm test` completo | **109 unidade, 165 banco, 24 e2e**, tipos e build verdes | Pendente |
| Lint | **8 avisos / 0 erros** (6 Fast Refresh, 1 hook mobile, 1 catch) | Pendente |
| Bundle por chunk | Entrada 303,08 kB / gzip 97,32; Pedido 149,51 / 41,88; Supabase 216,72 / 55,95; demais abaixo | Pendente |
| Inconsistências remotas | **12** (4 composição, 5 etapa, 1 pagamento, 1 venda sem composição, 1 troca inativa) | Pendente |
| Advisors segurança/desempenho | **32**: 18 avisos, 14 informações, 0 erros; 5 FKs sem índice | Pendente |
| Planos SQL mais usados | Execução: expedição **53,959 ms**, detalhe **8,176 ms**, v_pedidos **19,182 ms**, alterações **22,368 ms** | Pendente |
| LCP / INP / CLS móvel | Expedição **1.752 ms / não medido / 0,0477**, laboratório sem throttling | Pendente |
| Requisições / abertura de telas | Expedição **88 / 2.447 ms**, pedido **79 / 1.794 ms** (leituras novas bloqueadas) | Pendente |

## Correções e evidências

| ID | Gravidade | Onde / reprodução | Correção | Commit | Teste vermelho → verde |
| --- | --- | --- | --- | --- | --- |
| V42 | Alta | `shopify-sync`: pedido com >50 linhas; Shopify devolve nó nulo ou cursor repetido/ausente durante a paginação. A composição parcial era enviada ao banco como completa. | Recusar a importação desse pedido com erro claro; validar avanço do cursor e teto de tempo antes de cada página. Importação íntegra de 151 linhas coberta. | `2fcb2f3` | Contrato `shopify-sync.test.mjs`: 3 casos falharam antes; 10 passaram após. |

| V43 | Alta | Edge `carrinho-ler` lia só 100 linhas e comparava o token com `includes`, aceitando coincidência na query string de outro checkout. | Busca só ID/URL dos checkouts (sem conexão aninhada de 100×100); paginar linhas por ID até terminar; recusar falha/tempo/cursor inválido; comparar token exato do caminho. | `8808918` | Contrato novo: 3 reproduções falharam antes e passaram depois, incluindo 101 linhas. |

| V44 | Média | Conferência segura recusava `troca_painel` e `v_pedido_alteracoes`; CLI sem EXECUTE no painel/sugestões. | Lista explícita de novas leituras na barreira; EXECUTE só em funções leitoras para conta de auditoria, mantendo anon e gravações bloqueados. | Commit desta correção | 2 casos de rede e 1 de banco falharam antes; 13 de rede e 9 de permissão verdes. |

| V45 | Média | Quatro definers usavam `search_path=public` sem `pg_temp` no fim. Tabela temporária `pedido_eventos` desviava o histórico da escolha para fora da tabela real. | Fixar `public, pg_temp` nas quatro funções, em migration nova. | Commit desta correção | 2 reproduções falharam antes (histórico real = 0); 5 verificações de segurança verdes após. |

## Decisões tomadas sem o Gustavo

- Preservar comportamentos e decisões de produto documentados; nenhuma limpeza de dados antigos e nenhuma sincronização real durante testes.
- Medidas de laboratório serão identificadas como tal: INP real exige uso e amostragem, não será inventado a partir do tempo de carregamento.
- Não instalar plugins de contas externas para a vistoria: usar ferramentas locais e CLI já disponíveis.

## Pendências e limitações

Preencher com evidência ao concluir cada verificação. Itens ainda desmarcados não foram declarados concluídos.

## Inventário por área

O catálogo SQL, com assinaturas, GRANTs, RLS, hashes dos corpos e gatilhos efetivos está em [VISTORIA-2-INVENTARIO.md](VISTORIA-2-INVENTARIO.md). Checklist detalhado de revisão nesse arquivo; criar o inventário não significa concluir sua revisão.

| Revisado | Rota / tela | Componentes de fluxo |
| --- | --- | --- |
| [ ] | `/login` | Login, Protegido |
| [ ] | `/` | Expedição, CardPedido, LinhaPedido, Etapas, MenuAcoes, SeloAcerto, AvisoVistoria |
| [ ] | `/vendas` | Vendas, LinhaPedido |
| [ ] | `/vendas/nova` | NovaVenda, AdicionarPecas, BuscaPecas, ColarCarrinho |
| [ ] | `/vendas/:id` | Venda, ClienteCard, PecasVenda, ResumoVenda, PagoDialog, SomarPedido |
| [ ] | `/pedidos/:id` | Pedido, Cabecalho, PainelEtapa, Separacao, Conferencia, Etiquetagem, Bipagem, NotaFrete, Fechamento |
| [ ] | fluxos auxiliares do pedido | TrocaDialog, ConfirmarTroca, AcertoTroca, Problemas, AvisoPendentes, AvisoConferencia, DialogEtapa, useAcoesPedido |
| [ ] | consulta do pedido | AlteracoesDialog, HistoricoDialog, DadosCliente, CampoSalvo, LinhaPeca, TilePeca, Prazo |
| [ ] | `/arquivo` | Arquivo, LinhaPedido, busca e carregar mais |
| [ ] | `/repetidas` | Repetidas, miniaturas e pedidos |
| [ ] | `/clube` | Clube, PecaClubeForm, CartaoCatalogo |
| [ ] | `/feedbacks` | Feedbacks, FeedbackDialog |
| [ ] | `/r/:token` | Romaneio, PaginaPublica, LinhaValor |
| [ ] | `/t/:token` | Troca, carrinho, confirmação pública |
| [ ] | estrutura transversal | Layout, AppSidebar, RespDialog, ErrorBoundary, Foto, Miniaturas, TempoReal, componentes ui |

| Revisado | Integração | Entrada e fronteira |
| --- | --- | --- |
| [ ] | Shopify pedidos | Edge `shopify-sync`, `_shared/shopify.ts`, importação SQL; paginação, descontos, pagamentos, cancelamento, edições |
| [ ] | Shopify catálogo | Edge `catalogo-sync`, cache `catalogo_site`, marcador completo/incremental, variantes avulsas |
| [ ] | Shopify clientes | Edge `shopify-clientes`, `_shared/cliente.ts`, busca local/remota |
| [ ] | Carrinhos | parser local `/cart/ID:QTD`, Edge `carrinho-ler` para checkout; `/cart/c/` explicitamente recusado |
| [ ] | Endereço e empresa | ViaCEP; CNPJá e BrasilAPI (também existem no código) |
| [ ] | Zebra | `zebra.ts`, `etiquetas.ts`, useImprimirEtiquetas, FolhaEtiquetas, Browser Print/fallback do navegador |
| [ ] | WhatsApp | links `wa.me` de troca, romaneio e rastreio; nenhum envio automático |
| [ ] | Supabase | Auth, PostgREST/RPC, Realtime e Storage de fotos (leituras/gravações separadas nos testes) |
| [x] | Frenet | Sem integração HTTP ativa: preenchimento manual de dados; API só no roadmap |
| [ ] | Cloudflare | build automático por push, SPA e arquivos estáticos |

## Medições e ressalvas da linha de base

- Banco remoto: 12 avisos preservados. `etapa_adiantada` também aparece em ARV-1272/1275 (além dos explicitamente citados pelo pedido): não houve alteração nesses pedidos.
- Advisors: 4 funções públicas por token e 13 funções definer autenticadas intencionais; `feriados` sem policy intencional; proteção de senha vazada fora da autorização; 5 FKs sem índice e 8 índices ainda sem uso. Não apagar índices por estatísticas de banco novo.
- Planos via `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` em transações somente leitura. `troca_painel` e `sugerir_troca` recusadas para `supabase_read_only_user`. O lote inicial abortou nessa permissão; repetido cada plano separadamente. Sem execução sob conta administrativa.
- Site publicado, Chromium 390×844, sem throttling, reload completo e espera `networkidle`: vendas 49 req / 1.903 ms / LCP 1.080 ms / CLS 0,0359; arquivo 53 / 2.852 / 968 / 0,0382; Clube 45 / 2.579 / 1.196 / 0,0714; repetidas 50 / 2.453 / 1.608 / 0,0599; feedbacks 39 / 2.649 / 1.004 / 0,0170. Zero erros de JavaScript e overflow em todas. Browser Print foi bloqueado intencionalmente. `troca_painel` e `v_pedido_alteracoes` foram recusadas pela barreira (defeito da ferramenta de conferência, a corrigir). Não é Lighthouse nem INP de campo.
- Baseline completa do build no log temporário `/tmp/arvenne-vistoria2-baseline.log`; métricas resumidas aqui permanecem versionadas. Os logs temporários não são a única evidência dos resultados.

Bundle inicial completo por chunk, inclusive fontes: [VISTORIA-2-BUNDLE-ANTES.json](VISTORIA-2-BUNDLE-ANTES.json).

Contrato de paginação do checkout conferido na [API Shopify 2026-01 (AbandonedCheckout)](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/AbandonedCheckout): conexão `lineItems` e interface Node permitem buscar as próximas páginas pelo ID. Nenhuma API real da Shopify foi acionada nos contratos.

Varredura de segurança em PGlite: 16 tabelas com RLS; 13 views invoker; anon sem acesso a nenhuma relação interna; sem DELETE de pedidos/itens/movimentos/eventos; quatro definers públicos intencionais; respostas públicas verificadas recursivamente sem CPF/e-mail/endereço/telefone/dados brutos; token de outra troca recusado. Propriedade extra com centavos: 300 sequências (`PROP_SEED=45`) passaram em 105 s; nenhuma falha financeira nova encontrada nessa amostra.
