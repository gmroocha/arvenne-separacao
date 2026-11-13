# Vistoria 2 — Arvenne Separação

## Retomar daqui

- **Fase/item atual:** complemento de Fase 2/3 após a primeira suíte integral verde, antes da publicação.
- **Base:** `3ce7b4a`; inventário/medidas em `f1f793e`.
- **Concluído:** V42–V55 commitados; `npm test` verde em 13/11: **134 unidade, 173 banco, 52 e2e**, tipos, lint sem avisos e build. Dinheiro, 420 transições geradas, contratos Edge, segurança, erros e 12 baselines visuais cobertos. Dry-run confirmou as 3 migrations previstas; 54 remotas coincidem com a base. Corpos das 71 funções remotas iguais aos locais; só 4 configurações `search_path` aguardam alteração.
- **Em andamento:** sem commit: V56 — lista preenchida de Vendas não tinha filhos listitem (axe reproduziu); `ItemGroup` agora usa `ul`, LinhaPedido e Repetidas usam `li`. Matriz axe ampliada às 12 rotas e listas preenchidas; testes de concorrência/queda/HTML em `concorrencia.spec.mjs`; dois testes de tempo real verdes (136 unidades ao todo); patch Vite 8.3.7→8.3.8 no lock. Nenhum deploy/aplicação remota ainda.
- **Verificação complementar:** 12 testes de acessibilidade/concorrência passaram; V56 conferida visualmente nas quatro combinações. V57 atômica com 6 testes de banco verdes, aguarda suíte integral atual em `/tmp/arvenne-vistoria2-integral-atual.log`.
- **Próximo passo exato:** concluir `/tmp/arvenne-vistoria2-complementos.log`; repetir `concorrencia.spec.mjs` com localizadores por botão (“Encontradas (1)”), sem relaxar expectativa. Caso de resposta retida precisa confirmar atomicidade da etapa: deve ficar Separação após recarregar, mesmo sem a resposta chegar. Concluir V56 e suas capturas. Depois suíte completa com os complementos, aplicar migrations/tipos/Edges, push e conferência publicada.
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
| V44 | Média | Conferência segura recusava `troca_painel` e `v_pedido_alteracoes`; CLI sem EXECUTE no painel/sugestões. | Lista explícita de novas leituras na barreira; EXECUTE só em funções leitoras para conta de auditoria, mantendo anon e gravações bloqueados. | `447774f` | 2 casos de rede e 1 de banco falharam antes; 13 de rede e 9 de permissão verdes. |
| V45 | Média | Quatro definers usavam `search_path=public` sem `pg_temp` no fim. Tabela temporária `pedido_eventos` desviava o histórico da escolha para fora da tabela real. | Fixar `public, pg_temp` nas quatro funções, em migration nova. | `4ea876f` | 2 reproduções falharam antes (histórico real = 0); 5 verificações de segurança verdes após. |
| V46 | Alta | Catálogo marcava sincronização concluída após produto sumir/paginação incompleta; consulta incremental aninhava 25×100 variantes. | Recusar paginação interrompida/repetida, preservar marcador, limitar tempo e reduzir lote de produtos para 3 (continua paginando todos). | `2a3ad25` | 4 regressões falharam antes; 6 contratos verdes depois, incluindo >100 variantes. |
| V48 | Média | Advisor e catálogo confirmaram 5 FKs sem índice cobrindo a ordem de suas colunas. | Cinco índices de apoio, preservando todos os existentes. | `e4f026e` | Verificação genérica de cobertura de todas as FKs falhou com os mesmos 5 casos e passou após. Considera os índices parciais `IS NOT NULL` que já cobriam as outras relações. |
| V47 | Alta | Na venda, digitar CNPJ, trocar para CPF e só então receber a resposta antiga preenchia empresa/endereço da cliente anterior. | Versão única para buscas CEP/CNPJ e seleção de cliente; respostas/erros antigos não alteram o formulário nem o indicador de carregamento. | `cc438cf` | E2E reproduziu empresa/endereço antigos; passou em 390 e 1280 após a correção. |
| V51 | Média | Cliente HTTP Shopify não repetia HTTP 429 e seis tentativas podiam ultrapassar o teto da Edge, mesmo com tempo por chamada. | Prazo compartilhado entre token, requests e espera; cada Edge repassa seu prazo absoluto; 429 recuperável; erro claro ao esgotar o tempo. | `b6eb0af` | 2 contratos falharam antes (429 e prazo de 5 s); 22 contratos de HTTP/Edges verdes após. Erro permanente não é repetido. |
| V49 | Média | Abas de Vendas/Feedbacks apontavam para painéis inexistentes; barra de peças sem nome e sem valor ARIA. | Painéis TabsContent ligados às abas; progresso com título e percentual repassado à raiz Radix. | `108341f` | Axe/teclado falharam antes e passaram depois em 390/768/1280, dois temas. Capturas inspecionadas antes do commit. |
| V50 | Média | Avisos, selos de sucesso e textos secundários no claro tinham contraste de 3,24–4,42:1. | Ajustar quatro tokens claros, preservando funções semânticas e tema escuro. | `15239f1` | Axe sem violações WCAG A/AA nas 9 telas × 3 larguras × 2 temas (54 situações). Capturas de celular/PC claro/escuro inspecionadas. |
| V52 | Média | ViaCEP/CNPJá/BrasilAPI sem limite: serviço sem resposta deixava a busca e o formulário esperando indefinidamente. | AbortSignal de 10 s por serviço; CNPJ ainda tenta a reserva e termina em até 20 s de rede. | `ea54493` | 2 reproduções de rede parada falharam antes e passaram após; contrato de CEP inválido/inexistente/válido mantido. |
| V53 | Média | Falha temporária no RPC do romaneio virava `null` e dizia “não encontrado”. | Distinguir falha de rede de link inexistente; erro claro e botão Tentar novamente. Token malformado continua como inexistente. | `dbd7182` | Regressão falhou antes e passou em celular/PC, claro/escuro; recuperação real com RPC fictícia, sem recarregar a página. Capturas inspecionadas. |
| V54 | Média | Foto sem `width` nos cartões, repetidas, miniaturas e bipagem baixava o original inteiro da Shopify. | Limitar miniaturas a 600 px, preservar tamanhos menores explícitos e manter ampliação em 1200 px; outras origens intactas. | `7819cb8` | HTML realmente renderizado falhou sem width antes; passa com limite e preservação de tamanho/host. Layout preservado. |
| V55 | Média | Falha na leitura de Expedição, Vendas, Arquivo, Clube, Repetidas ou Feedbacks aparecia como lista vazia (ou sem conteúdo). | Aviso comum com Tentar novamente; na falha de atualização mantém os dados anteriores com aviso. Sem lista vazia falsa na falha inicial. | `b20a113` | Reprodução HTTP 500 falhou no código anterior; recuperação e axe passaram em 24 situações (6 listas × 2 temas × celular/PC). Capturas nas quatro combinações inspecionadas. |

| V56 | Média | Axe nas listas preenchidas de Vendas/Repetidas encontrou links diretamente sob `role=list`, sem listitem. | Grupo como `ul` e cada linha como `li`, mantendo navegação e aparência. | Neste commit | 6 verificações axe falharam antes; matriz ampliada de 12 rotas × 3 larguras × 2 temas passou (72 situações). Capturas de ambas as listas em 390/1280, claro/escuro, inspecionadas. |

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

Manutenção do código: lint **8 → 0 avisos**, sem desabilitar regras. Exports internos sem uso removidos; variantes e contexto da sidebar separados para preservar Fast Refresh; `useIsMobile` usa assinatura de `matchMedia` por `useSyncExternalStore`; catch sem parâmetro inútil. `test:rapido`: tipos + lint + 122 unidades verdes. Bloco V42–V44: `npm test` verde (118 unidade, 166 banco, 24 e2e e build); V45/V46 entrarão na próxima suíte completa antes da aplicação.

Lighthouse do login publicado (móvel, emulação/throttling padrão): desempenho **98**, acessibilidade **98**, boas práticas **100**, LCP **2,0 s**, CLS **0**, TBT **100 ms**. Autenticação não foi incluída nesse Lighthouse; telas internas têm medidas Chromium separadas.

Decisão de design: os tokens claros de aviso/sucesso/erro/texto secundário são escurecidos só o necessário para WCAG AA sobre fundos suaves. Inter Tight, peso máximo semibold, cores semânticas e tema escuro preservados. Antes: axe apontou contraste 3,24–4,42:1 em selos/avisos; abas sem painel e progresso sem nome. Nenhuma regra do axe será desabilitada para passar.

Validação visual/acessibilidade: `npx playwright test tests/e2e/semantica.spec.mjs tests/e2e/acessibilidade.spec.mjs`: **12 testes verdes**, 3,6 min, 54 situações de telas e 18 situações com troca de aba por teclado. Artefatos locais em `capturas/vistoria2/`, ignorados pelo git. Deno check das quatro Edges também passou (só análise de tipos, sem execução remota).

Propriedades financeiras permanentes reforçadas: `conservacao.test.mjs` agora combina preços inteiros e fracionados em centavos e coberturas em centavos; não mantém cópia duplicada do teste. 300 sequências adicionais na seed 45 passaram em 96,34 s após ampliar o gerador.

Limitação observada durante a suíte do bloco 2: máquina com cerca de 6/7,6 GiB em uso e 1,8/2 GiB de swap, outros trabalhos ativos. Um teste visual estourou o tempo na preparação do PGlite (antes de abrir a tela), sem divergência de imagem. Não aumentar timeout nem marcar esperado: reduzir custo de preparar o banco e repetir a suíte integral antes de publicar.

Fase 3: novo oráculo de etapas gerou 60 combinações de peças/documentos e conferiu as sete etapas posteriores tanto pela regra enviada à interface quanto pelo gatilho real (420 tentativas). Passou. Contratos da Edge de clientes: cinco casos verdes (busca curta, telefone E.164, CPF opcional indisponível e erro remoto). Baselines visuais novos totalizam oito PNGs (340 KiB); criados após inspeção, sem substituir referência antiga nem tolerância de pixels. Limite de abertura de pedido/troca em memória: 7 s, inclui navegador/SQL; não substitui métricas do site real.

Retomada de 13/11: a execução anterior também falhou ao criar a página do Chromium e ao inspecionar uma tela já carregada, durante pressão extrema de memória. Não foi diagnosticado como regressão funcional nem ocultado como falha esperada; falta nova execução integral verde.

O ambiente foi reiniciado durante a falta de memória: logs em `/tmp` da sessão anterior desapareceram; os resultados já registrados neste relatório e todos os commits persistiram. Memória livre voltou a mais de 3 GiB. Nenhum processo de outro trabalho foi encerrado. A única redução de paralelismo é `maxWorkers: 2` para unidades, mantendo testes, seeds, timeouts e regras.

Regressão visual do coração do app: adicionadas quatro referências da região “A encontrar” (celular/PC × claro/escuro), com foto, SKU, quantidade e ações. Recorte evita prazos/relógios variáveis; pedido continua calculado pelo PostgreSQL real. Também verifica que nenhuma quantia aparece na etapa. As oito referências públicas existentes passaram sem atualização; `--update-snapshots=missing` criou apenas as quatro novas.

Primeira suíte final verde (`/tmp/arvenne-vistoria2-final.log`): 134 unidade + 173 banco + 52 e2e (6,4 min nas telas), tipos e build. Entrada do bundle: 301,32 kB / gzip 96,68; Pedido: 149,50 / 41,86; Supabase: 216,72 / 55,95. O complemento de revisão ainda está em andamento, portanto esse resultado não declara toda a vistoria encerrada.
