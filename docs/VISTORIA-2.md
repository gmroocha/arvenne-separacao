# Vistoria 2 — Arvenne Separação

## Retomar daqui

- **Fase/item atual:** complemento final V59 identificado pelo Lighthouse publicado.
- **Base:** `3ce7b4a`; inventário/medidas em `f1f793e`.
- **Concluído:** V42–V58 commitados. Primeira suíte integral: **134 unidade, 173 banco, 52 e2e**, tipos/lint/build verdes. Complemento: 72 situações axe sem violações e 6 e2e de concorrência/queda/HTML verdes; 6 testes atômicos SQL verdes. Capturas de V56 inspecionadas nas quatro combinações.
- **Resultado final:** `npm test` verde: **137 unidade, 180 banco, 58 e2e (7,3 min)**, tipos, lint sem avisos e build. Scanner do build final: 2 valores privados conhecidos ausentes, chave anon/publishable.
- **Em andamento:** suíte completa atual em `/tmp/arvenne-vistoria2-validacao-final.log`; Tempo real, patch Vite 8.3.8 e conferência publicada ampliada commitados; inventário e medição remota em revisão. 5 migrations aplicadas no Supabase; tipos oficiais regenerados; `shopify-sync` publicada. 4 Edges publicadas; tipos oficiais/complemento regenerados e tipos/lint/137 unidades/build verdes. Push `f709894` publicado; asset `index-CrVpaqnx.js` idêntico ao build local. Conferência publicada/Lighthouse em execução.
- **Próximo passo exato:** V59 reproduzida em celular nos dois temas (falta landmark main no login); corrigir e conferir capturas, testar suíte final, push e repetir Lighthouse/medidas; comparar métricas/capturas; atualizar Estado atual e fechar relatórios. Banco remoto já comparado: 72 funções, 29 relações, 32 policies, 27 gatilhos e 59 migrations iguais. Hashes de dados antes/depois iguais (23 pedidos, 456 itens, 21 trocas).
- **Ao continuar:** ler esta seção, `git status`, `git log -10`; concluir alterações pendentes antes de iniciar outro defeito.

### Checklist do inventário

- [x] Ler regras, histórico V01–V41, testes e decisões anteriores.
- [x] Fase 0: testes, lint e bundle por chunk.
- [x] Fase 0: inconsistências e advisors; quatro planos medidos, dois bloqueados por GRANT (ver limitações).
- [x] Fase 0: site publicado e medidas móveis de laboratório; Lighthouse do login concluído; INP de campo indisponível, interação de laboratório medida.
- [x] Fase 1: rotas, componentes de fluxo, integrações e catálogo SQL efetivo.
- [x] Fase 2: dinheiro e conservação, inclusive desconto composto e reembolso.
- [x] Fase 2: etapas, desvios, repetição, concorrência e trabalho reaberto.
- [x] Fase 2: Shopify, catálogo, clientes, carrinho, ViaCEP, Zebra e links.
- [x] Fase 2: segurança, permissões e páginas públicas.
- [x] Fase 2: design, acessibilidade e estados nas três larguras e dois temas.
- [x] Fase 2: desempenho, código e dependências (medições finais remotas na Fase 4).
- [x] Fase 3: propriedades, contratos Edge, e2e, visual, axe e desempenho.
- [ ] Fase 4: testes finais, migrations/tipos/Edges necessários, push e conferência publicada.
- [ ] Entrega: Estado atual, métricas antes/depois, pendências e resumo em português.

## Escopo e proteções

Autorização explícita no pedido da Vistoria 2 para migrations (dry-run antes de aplicar), deploy das Edges, regeneração de tipos e push. Não inclui apagar/reconstruir pedidos, alterar segredos ou Authentication, nem chamar Edge fora do login. Testes usam PGlite e credenciais fictícias. Conferência publicada permite login de teste com gravações bloqueadas; nenhum segredo ou dado pessoal será registrado aqui.

Os avisos de ARV-1273/1274/1276/1277 e W0001/W0006/W0007/W0008 são históricos conhecidos: investigar causas, preservar os dados. V01–V41 continuam cobertos pelos testes anteriores; IDs novos começam em V42.

## Linha de base — antes × depois

| Medida | Antes (`3ce7b4a`) | Depois |
| --- | --- | --- |
| `npm test` completo | **109 unidade, 165 banco, 24 e2e**, tipos e build verdes | **137 unidade, 180 banco, 58 e2e** (375 testes), tipos e build verdes | |
| Lint | **8 avisos / 0 erros** (6 Fast Refresh, 1 hook mobile, 1 catch) | **0 avisos / 0 erros**, sem desligar regras | |
| Bundle por chunk | Entrada 303,08 kB / gzip 97,32; Pedido 149,51 / 41,88; Supabase 216,72 / 55,95; demais abaixo | Entrada **301,32 / 96,67**; Pedido **149,50 / 41,86**; Supabase **216,72 / 55,95** kB/gzip | |
| Inconsistências remotas | **12** (4 composição, 5 etapa, 1 pagamento, 1 venda sem composição, 1 troca inativa) | **Os mesmos 12**, mesmos pedidos e regras; dados preservados | |
| Advisors segurança/desempenho | **32**: 18 avisos, 14 informações, 0 erros; 5 FKs sem índice | **32**: 18 avisos, 14 informações, 0 erros; **0 FKs sem índice**; índices sem uso **8 → 13** (inclui os 5 novos) | |
| Planos SQL mais usados | Execução: expedição **53,959 ms**, detalhe **8,176 ms**, v_pedidos **19,182 ms**, alterações **22,368 ms** | Medianas: expedição **16,593 ms**, detalhe **6,324 ms**, v_pedidos **17,946 ms**, alterações **5,924 ms**; painel/sugestão agora permitidos | |
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
| V47 | Alta | Na venda, digitar CNPJ, trocar para CPF e só então receber a resposta antiga preenchia empresa/endereço da cliente anterior. | Versão única para buscas CEP/CNPJ e seleção de cliente; respostas/erros antigos não alteram o formulário nem o indicador de carregamento. | `cc438cf` | E2E reproduziu empresa/endereço antigos; passou em 390 e 1280 após a correção. |
| V48 | Média | Advisor e catálogo confirmaram 5 FKs sem índice cobrindo a ordem de suas colunas. | Cinco índices de apoio, preservando todos os existentes. | `e4f026e` | Verificação genérica de cobertura de todas as FKs falhou com os mesmos 5 casos e passou após. Considera os índices parciais `IS NOT NULL` que já cobriam as outras relações. |
| V49 | Média | Abas de Vendas/Feedbacks apontavam para painéis inexistentes; barra de peças sem nome e sem valor ARIA. | Painéis TabsContent ligados às abas; progresso com título e percentual repassado à raiz Radix. | `108341f` | Axe/teclado falharam antes e passaram depois em 390/768/1280, dois temas. Capturas inspecionadas antes do commit. |
| V50 | Média | Avisos, selos de sucesso e textos secundários no claro tinham contraste de 3,24–4,42:1. | Ajustar quatro tokens claros, preservando funções semânticas e tema escuro. | `15239f1` | Axe sem violações WCAG A/AA nas 9 telas × 3 larguras × 2 temas (54 situações). Capturas de celular/PC claro/escuro inspecionadas. |
| V51 | Média | Cliente HTTP Shopify não repetia HTTP 429 e seis tentativas podiam ultrapassar o teto da Edge, mesmo com tempo por chamada. | Prazo compartilhado entre token, requests e espera; cada Edge repassa seu prazo absoluto; 429 recuperável; erro claro ao esgotar o tempo. | `b6eb0af` | 2 contratos falharam antes (429 e prazo de 5 s); 22 contratos de HTTP/Edges verdes após. Erro permanente não é repetido. |
| V52 | Média | ViaCEP/CNPJá/BrasilAPI sem limite: serviço sem resposta deixava a busca e o formulário esperando indefinidamente. | AbortSignal de 10 s por serviço; CNPJ ainda tenta a reserva e termina em até 20 s de rede. | `ea54493` | 2 reproduções de rede parada falharam antes e passaram após; contrato de CEP inválido/inexistente/válido mantido. |
| V53 | Média | Falha temporária no RPC do romaneio virava `null` e dizia “não encontrado”. | Distinguir falha de rede de link inexistente; erro claro e botão Tentar novamente. Token malformado continua como inexistente. | `dbd7182` | Regressão falhou antes e passou em celular/PC, claro/escuro; recuperação real com RPC fictícia, sem recarregar a página. Capturas inspecionadas. |
| V54 | Média | Foto sem `width` nos cartões, repetidas, miniaturas e bipagem baixava o original inteiro da Shopify. | Limitar miniaturas a 600 px, preservar tamanhos menores explícitos e manter ampliação em 1200 px; outras origens intactas. | `7819cb8` | HTML realmente renderizado falhou sem width antes; passa com limite e preservação de tamanho/host. Layout preservado. |
| V55 | Média | Falha na leitura de Expedição, Vendas, Arquivo, Clube, Repetidas ou Feedbacks aparecia como lista vazia (ou sem conteúdo). | Aviso comum com Tentar novamente; na falha de atualização mantém os dados anteriores com aviso. Sem lista vazia falsa na falha inicial. | `b20a113` | Reprodução HTTP 500 falhou no código anterior; recuperação e axe passaram em 24 situações (6 listas × 2 temas × celular/PC). Capturas nas quatro combinações inspecionadas. |
| V56 | Média | Axe nas listas preenchidas de Vendas/Repetidas encontrou links diretamente sob `role=list`, sem listitem. | Grupo como `ul` e cada linha como `li`, mantendo navegação e aparência. | `be5212a` | 6 verificações axe falharam antes; matriz ampliada de 12 rotas × 3 larguras × 2 temas passou (72 situações). Capturas de ambas as listas em 390/1280, claro/escuro, inspecionadas. |
| V57 | Alta | Ao perder a resposta após salvar “Achei”, a etapa dependia de outra requisição: peça encontrada e pedido ainda Novo; falta parcial também podia ficar sem desvio. | RPC `alterar_item` com bloqueio do pedido grava peça/etapa juntas; `marcar_falta` conclui o desvio na própria transação, preservando origem. Remove segunda gravação do navegador. Sem alteração retroativa de dados. | `f9d3d17` | Browser reproduziu peça encontrada com pedido Novo e 3 casos SQL falharam antes. Agora 6 regressões SQL e 6 casos e2e de duplo clique, resposta perdida e entradas longas/HTML passam em celular/PC. Rede nega RPC real nos testes. |
| V58 | Média | Nome da cliente preenchido como e-mail era devolvido integralmente por `romaneio_publico`, embora o campo separado de e-mail já fosse omitido. | Omitir nome com `@` no romaneio, como já faz `troca_publica`; preservar primeiro nome nos demais casos. Migration nova, sem editar dados. | `067309a` + `6b86f0c` | Teste novo recebeu `privado@ficticio.test` antes e passou com `null` após; 6 testes de segurança verdes. |

## Decisões tomadas sem o Gustavo

- Preservar comportamentos e decisões de produto documentados; nenhuma limpeza de dados antigos e nenhuma sincronização real durante testes.
- Medidas de laboratório serão identificadas como tal: INP real exige uso e amostragem, não será inventado a partir do tempo de carregamento.
- Não instalar plugins de contas externas para a vistoria: usar ferramentas locais e CLI já disponíveis.

## Pendências e limitações

- INP de campo exige tráfego real e amostragem; medimos LCP/CLS de laboratório e duração do menu pelo Event Timing. Nenhum INP real inventado.
- PGlite executa SQL real, mas serializa o acesso: dois navegadores provam disputa/cache/idempotência na interface, sem simular todos os bloqueios MVCC de um PostgreSQL com várias conexões.
- Sem impressão física, sincronização real Shopify nem escrita nas páginas públicas do ambiente publicado: foram usados contratos e banco descartável, preservando todos os pedidos.
- Advisor V35 de senha vazada permanece: Authentication/segredos estão fora da autorização. Os definers intencionais, feriados interna e índices ainda sem uso têm justificativa; não se remove proteção para zerar um contador.
- `npm audit`: 6 avisos transitivos da CLI shadcn (2 baixos, 4 moderados; nenhum alto/crítico). Dry-run sem `--force` não encontra mudança compatível; minimatch 10 está preso por `@ts-morph/common` e a sugestão global rebaixa shadcn para 1.0.0. Mantidos e documentados; JS da CLI não entra no app (só CSS é importado). Atualizado apenas o patch seguro Vite 8.3.7 → 8.3.8.
- Os 12 avisos históricos de pedidos são preservados; esta vistoria não faz correção retroativa de dados.

## Inventário por área

O catálogo SQL, com assinaturas, GRANTs, RLS, hashes dos corpos e gatilhos efetivos está em [VISTORIA-2-INVENTARIO.md](VISTORIA-2-INVENTARIO.md). Critério e alcance da revisão descritos nesse arquivo; marcar revisão não significa esgotar todas as entradas possíveis.

| Revisado | Rota / tela | Componentes de fluxo |
| --- | --- | --- |
| [x] | `/login` | Login, Protegido |
| [x] | `/` | Expedição, CardPedido, LinhaPedido, Etapas, MenuAcoes, SeloAcerto, AvisoVistoria |
| [x] | `/vendas` | Vendas, LinhaPedido |
| [x] | `/vendas/nova` | NovaVenda, AdicionarPecas, BuscaPecas, ColarCarrinho |
| [x] | `/vendas/:id` | Venda, ClienteCard, PecasVenda, ResumoVenda, PagoDialog, SomarPedido |
| [x] | `/pedidos/:id` | Pedido, Cabecalho, PainelEtapa, Separacao, Conferencia, Etiquetagem, Bipagem, NotaFrete, Fechamento |
| [x] | fluxos auxiliares do pedido | TrocaDialog, ConfirmarTroca, AcertoTroca, Problemas, AvisoPendentes, AvisoConferencia, DialogEtapa, useAcoesPedido |
| [x] | consulta do pedido | AlteracoesDialog, HistoricoDialog, DadosCliente, CampoSalvo, LinhaPeca, TilePeca, Prazo |
| [x] | `/arquivo` | Arquivo, LinhaPedido, busca e carregar mais |
| [x] | `/repetidas` | Repetidas, miniaturas e pedidos |
| [x] | `/clube` | Clube, PecaClubeForm, CartaoCatalogo |
| [x] | `/feedbacks` | Feedbacks, FeedbackDialog |
| [x] | `/r/:token` | Romaneio, PaginaPublica, LinhaValor |
| [x] | `/t/:token` | Troca, carrinho, confirmação pública |
| [x] | estrutura transversal | Layout, AppSidebar, RespDialog, ErrorBoundary, Foto, Miniaturas, TempoReal, componentes ui |

| Revisado | Integração | Entrada e fronteira |
| --- | --- | --- |
| [x] | Shopify pedidos | Edge `shopify-sync`, `_shared/shopify.ts`, importação SQL; paginação, descontos, pagamentos, cancelamento, edições |
| [x] | Shopify catálogo | Edge `catalogo-sync`, cache `catalogo_site`, marcador completo/incremental, variantes avulsas |
| [x] | Shopify clientes | Edge `shopify-clientes`, `_shared/cliente.ts`, busca local/remota |
| [x] | Carrinhos | parser local `/cart/ID:QTD`, Edge `carrinho-ler` para checkout; `/cart/c/` explicitamente recusado |
| [x] | Endereço e empresa | ViaCEP; CNPJá e BrasilAPI (também existem no código) |
| [x] | Zebra | `zebra.ts`, `etiquetas.ts`, useImprimirEtiquetas, FolhaEtiquetas, Browser Print/fallback do navegador |
| [x] | WhatsApp | links `wa.me` de troca, romaneio e rastreio; nenhum envio automático |
| [x] | Supabase | Auth, PostgREST/RPC, Realtime e Storage de fotos (leituras/gravações separadas nos testes) |
| [x] | Frenet | Sem integração HTTP ativa: preenchimento manual de dados; API só no roadmap |
| [x] | Cloudflare | build automático por push, SPA e arquivos estáticos |

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

Complemento de privacidade V58: teste vermelho e verde confirmado; a suíte iniciada antes desse achado tem 137 unidades/179 banco e 58 e2e em andamento. Repetir a suíte após esta migration antes de aplicar. Conferência publicada ampliada ANTES: 36 situações, nenhuma gravação bloqueada tentada, nenhum erro de console/JS/HTTP nem overflow. Dados de laboratório variam com a rede; não usar uma única amostra para alegar ganho causal.

V58: ao gerar a migration a partir de `pg_get_functiondef`, faltou o `;` externo antes do GRANT. Os testes recusaram a preparação; corrigido em `6b86f0c`, 6 testes de segurança verdes. A execução em andamento foi interrompida e reiniciada do começo com todos os arquivos finais; nenhuma falha foi marcada esperada ou afrouxada.

Revisão de código: nenhum `any` explícito nem `dangerouslySetInnerHTML` em `src`/Edges. Divisão por rota já usa `React.lazy`; consultas de catálogo mantêm cache de 5/30 min, listas agrupam eventos Realtime e têm polling de reserva (60 s desconectado, 300 s conectado). Preservado sem reescrita especulativa; V39 já agrupava a leitura da troca e V57 passa a agrupar peça/etapa na escrita. Sem novo serviço Frenet ou envio automático de WhatsApp.

Compatibilidade V37/V57: a asserção de negócio antiga confirmou o retorno à Conferência, mas uma asserção de transporte ainda exigia a segunda RPC `sair_do_desvio` que V57 removeu. Substituída por exigência de **uma** RPC atômica e **zero** RPCs de segunda etapa, mantendo todas as expectativas de estado, tela e barreira. Não há relaxamento da regra de origem do desvio.

Preparação de publicação: `git ls-remote` confirmou `origin/main` ainda em `3ce7b4a` (sem concorrência remota). Dry-run das **5** migrations aprovado; Deno check das **4** Edges verde. A nova suíte integral usa 137 unidades e 180 testes SQL (ambos verdes); aguarda as 58 telas e o build. Os dois valores privados conhecidos do `.env.local` não apareceram no bundle examinado, e a chave de frontend tem papel anon/publishable; repetir o scanner no build final.

Aplicação confirmada: 5 migrations (`20261120100000` a `20261120140000`), sem seeds ou alteração de pedidos; quatro Edges publicadas (`shopify-sync`, `catalogo-sync`, `carrinho-ler`, `shopify-clientes`). Tipos remotos/complemento regenerados com base `20261120140000`; tipos, lint, 137 unidades e build novamente verdes, mesmos hashes de assets.

Comparação remota: os corpos/permissões das 72 funções coincidem por assinatura. A comparação inicial marcou falso por ordem de collation diferente, e `pg_policies.roles` chegou do CLI como `{authenticated}` em vez de array: a ferramenta agora pede `to_jsonb(roles)` e compara conjuntos de linhas canônicas. Nenhuma diferença de função ou policy foi ignorada. As 29 relações, 27 gatilhos e 59 migrations já coincidiram.

## Evidências finais do banco e da publicação

Push `f709894` na `main`; Cloudflare serviu `index-CrVpaqnx.js` com conteúdo byte a byte igual ao build validado. Nenhuma função Edge foi invocada para testar o deploy; as quatro respostas do CLI confirmaram publicação por bundling remoto (Docker local não é necessário).

Comparação pós-aplicação **inteiramente igual**: 72 funções (corpos, search_path, definer e EXECUTE anon/equipe), 29 relações (definição de view, RLS e privilégios), 32 policies, 27 gatilhos e 59 migrations. Diferenças de ordem da collation e representação de `name[]` normalizadas sem omitir campos. [Resultado do banco](VISTORIA-2-BANCO-DEPOIS.json), [resumo dos advisors](VISTORIA-2-ADVISORS-DEPOIS.json).

Hashes agregados de **23 pedidos, 456 itens e 21 trocas** iguais antes/depois: nenhuma linha dessas tabelas mudou. O vigia manteve os 12 avisos históricos e não encontrou um novo. `Auth`/segredos intactos; só login de teste autorizado na conferência.

| Consulta | Antes (uma amostra, ms) | Depois (mediana de 3, ms) |
| --- | --- | --- |
| Expedição | 53,959 | 16,593 |
| Detalhe | 8,176 | 6,324 |
| v_pedidos | 19,182 | 17,946 |
| troca_painel | Permissão recusada | 43,371 |
| sugerir_troca | Permissão recusada | 12,712 |
| Alterações | 22,368 | 5,924 |

Planos somente leitura com `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Cache/latência/pequeno volume variam: estes números não provam que os índices causaram toda a diferença. A amostra de sugestões retornou **0 candidatos**, portanto mede também a busca sem correspondência; não representa catálogo grande. Não remover índices com zero uso em uma base pequena.

Bundle completo depois: [VISTORIA-2-BUNDLE-DEPOIS.json](VISTORIA-2-BUNDLE-DEPOIS.json). Total de 77 assets; verificação dos dois valores privados conhecidos do ambiente sem ocorrência em JS/CSS e chave pública com papel anon/publishable. Isso não é uma prova de ausência de qualquer segredo desconhecido, mas nenhum valor privado foi impresso ou gravado nos relatórios.
