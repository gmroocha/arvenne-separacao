# Vistoria do Arvenne Separação — 12/11/2026

**Fase 1: concluída. Sem correções no app e sem escrita no banco ou na nuvem.**

Base inspecionada: commit `d424a50`. Foram lidos `CLAUDE.md`, `docs/ESTADO-ATUAL.md` e
`docs/ROADMAP.md`. As próximas fases ficam aguardando a revisão do Gustavo, conforme o pedido.
Este relatório não autoriza aplicar migrations, publicar funções, sincronizar ou alterar pedidos reais.

## Resultado em linguagem simples

Foram identificados **36 problemas: 13 de gravidade alta, 21 média e 2 baixa**. Eles estão separados
dos avisos automáticos e das situações que ainda precisam de teste na loja. Gravidade alta significa
risco de mostrar/cobrar/devolver dinheiro errado, liberar envio com peças pendentes ou gravar durante
uma simulação que deveria ser somente leitura. Não foi confirmado vazamento de dados de clientes.

As prioridades são a venda somada, a troca de peças, os acertos e a trava de mudança de etapa.
Os testes de banco existentes passam, mas não cobrem várias combinações entre esses recursos.

**Nenhum dos problemas abaixo foi corrigido nesta fase.** A coluna de correção é uma proposta.

## Como a vistoria foi feita

- As 27 migrations locais foram aplicadas em um PostgreSQL em memória, pelo PGlite já usado pelo projeto.
  Foram inspecionadas as definições efetivas de 42 funções, 8 views, restrições, gatilhos e permissões;
  isso evita confundir uma função antiga com a versão que a substituiu.
- O banco remoto também registra as 27 migrations. As definições das 42 funções públicas remotas
  coincidiram com as obtidas localmente. A definição remota de `v_pedidos` também foi lida; sua saída
  textual tem diferenças de formatação em relação ao PostgreSQL do PGlite.
- Toda consulta de dados reais foi executada por `npx supabase db query --remote --read-only`.
  A amostra encontrada tinha 12 pedidos, 206 linhas de peças e 18 trocas, incluindo dados de testes
  anteriores. Não foram copiados CPF, endereço, telefone, e-mail, tokens de acesso ou links públicos
  para este relatório.
- A conta de leitura do CLI é `supabase_read_only_user`. Consultar diretamente `v_pedidos` falhou por
  falta de permissão para executar `prazo_envio`. Para conferir dinheiro, foi executada uma CTE com a
  definição **remota** da view, substituindo somente as chamadas de prazo/horas úteis por `NULL`.
  Nenhuma view ou permissão foi alterada. Os valores financeiros abaixo vieram dessa consulta; ela
  não validou os prazos reais dos pedidos.
- Foram executadas 22 reproduções exploratórias em memória. Elas investigam comportamentos e não são
  uma nova suíte de proteção: os testes permanentes pertencem à Fase 2. Os roteiros e resultados
  relevantes estão descritos abaixo, sem depender dos arquivos temporários da sessão.
- Foram abertas 19 situações de tela em 390 e 1280 px, no modo escuro, com dados fictícios e sessão
  fictícia. Todas as conexões externas, inclusive funções Edge e WebSocket, foram interceptadas.
  As duas capturas feitas cedo demais foram repetidas esperando o conteúdo carregar. As 38 situações
  renderizaram sem erro de JavaScript ou rolagem horizontal. Isso é uma conferência de carregamento e
  apresentação, não um teste completo de cada ação.
- Foram rodados os advisors de segurança e desempenho do Supabase e lidas as estatísticas de consultas.
  Não foram acionados botões reais de sincronização, pagamento, troca, envio ou impressão.

## Problemas de dinheiro

| ID | Onde | O que acontece | Como reproduzir / evidência | Gravidade | Correção proposta |
| --- | --- | --- | --- | --- | --- |
| V01 | `somar_venda`, `v_pedidos`, `romaneio_publico` — migrations `20261115110000` e `20261116090000` | A venda de origem fica sem peças e com total zero após ser somada. O link que a cliente já recebeu perde o conteúdo da compra. | Somar uma venda de R$ 100: o principal passa a R$ 200, mas a origem apresenta `itens=[]`, `total=0`, embora tenha R$ 100 pagos. No banco real, W0008 tem R$ 31,08 pagos e total zero. | Alta | Preservar a composição e os valores da venda de origem; separar a propriedade financeira da peça da sua localização na expedição. Evitar duplicar o valor no principal. |
| V02 | `marcar_falta` — migration `20261114130000`, inserção da linha dividida | Dividir uma adicional não copia `adicional` nem `venda_origem_id`. A parte em falta passa a entrar novamente no dinheiro do pedido original. | Principal R$ 100 + adicional 2 × R$ 50. Marcar falta de 1: o total geral sobe de R$ 200 para R$ 250, sem compra nova; a nova linha nasce como peça comum. | Alta | Copiar os vínculos financeiros ao dividir linhas; impor coerência entre adicional, venda de origem e pedido de destino. |
| V03 | `troca_concluir_peca` + `v_pedidos` | A substituta de uma adicional nasce como peça comum, enquanto o valor somado fica inteiro. Dar crédito da adicional também não reduz o total geral. | Principal R$ 100 + adicional R$ 100. Trocar a adicional por R$ 120 resulta em total geral R$ 320 e saldo da troca R$ 20; deveria resultar em R$ 220. Dar crédito resulta em R$ 200, quando deveria ficar R$ 100. | Alta | Propagar a origem financeira à substituta e lançar a diferença/crédito na parte correta, uma única vez. Cobrir WhatsApp e Shopify. |
| V04 | `v_pedidos`, blocos `rem`, `sm` e `dev` | Remover adicional depois de paga mantém o total da parte e não avisa o dinheiro a devolver. | Principal R$ 100 + adicional R$ 100; remover a adicional com “cliente desistiu”: total geral continua R$ 200 e `a_devolver=0`. | Alta | Incluir adicionais no controle de retirada e devolução, com vínculo ao pagamento de origem e sem mexer no histórico da venda. |
| V05 | `troca_concluir_peca`, reajuste do desconto fixo | O reajuste soma adicionais no subtotal usado para calcular o desconto, mas a view as exclui desse subtotal. O desconto do principal fica grande demais. | Principal R$ 100 − R$ 20 + venda somada R$ 100 = R$ 180. Trocar a peça original por R$ 150 anuncia +R$ 40, mas o total geral termina em R$ 120, em vez de R$ 220. | Alta | Usar a mesma base financeira na conclusão e na view; testar desconto fixo, percentual, Pix e várias partes combinados. |
| V06 | `src/pages/Pedido.tsx`, `aoAdicionar`; `adicionar_itens` | O atalho “Trocar” da peça adiciona substitutas e remove a antiga em chamadas distintas, sem passar pelo cálculo e pelo acerto da troca. Uma falha entre chamadas também deixa a operação incompleta. | Em pedido Shopify de R$ 80, substituir a linha por uma peça de R$ 150 pelo mesmo caminho SQL usado pela tela: total continua R$ 80, peças mostram R$ 150 e não nasce acerto. No WhatsApp o total muda, mas não nasce a cobrança/crédito correspondente. | Alta | Fazer toda substituição por uma única função de banco, com regra financeira e registro de diferença, inclusive quando a equipe combina pelo WhatsApp. |
| V07 | `troca_concluir_peca`, `troca_acerto`, `tg_trocas_depois` | O acerto usa a diferença antes da cobertura da loja. Cobertura total deixa um acerto pendente de saldo zero, sem botão na tela; cobertura parcial registra valor recebido errado no histórico. | Diferença R$ 50 e cobertura R$ 50: troca concluída, saldo zero e `acerto_status=pendente`. Cobertura R$ 10 e “Recebido”: tela pede R$ 40, histórico grava R$ 50. | Alta | Definir situação, validação e evento do acerto pelo saldo líquido da mesma troca. Saldo zero deve encerrar sem pendência. |
| V08 | `v_pedidos.total_pago`, `a_devolver`, `troca_acerto` | Receber diferença de troca muda um marcador, mas não entra no total pago nem na base de uma devolução posterior. | Pedido pago R$ 100; troca +R$ 50 marcada como recebida: `total_pago=100`. Retirar a substituta depois disso gera R$ 100 a devolver, embora tenham sido recebidos R$ 150. | Alta | Guardar recebimentos, créditos e devoluções como movimentos identificáveis; derivar os saldos no banco sem contar duas vezes os pagamentos iniciais. |
| V09 | `supabase/functions/shopify-sync/index.ts`, montagem de `valor_pago` | O total atual do pedido Shopify é gravado também como valor pago. Edição de pedido e dinheiro efetivamente recebido não são necessariamente iguais. | Pedido já importado, pago R$ 100, editado na Shopify para R$ 150 com R$ 50 em aberto: o código envia `valor_pago=150`, pois usa `currentTotalPriceSet` para ambos. Confirmado pelo caminho do código e pela definição oficial dos campos; não foi editado pedido real. | Alta | Importar o recebido/reembolsado e o saldo em aberto pelos campos financeiros apropriados da Shopify. Guardar separadamente total atual e pagamentos. |
| V10 | Importação de `preco_pago numeric(10,2)` e `v_pedidos` | Arredondar o preço pago por unidade perde centavos do rateio. O total preservado da Shopify deixa de fechar com a composição exibida. | Banco real: ARV-1273 difere −R$ 0,04; ARV-1276 +R$ 0,05; ARV-1277 +R$ 0,03. O sinal compara total com subtotal − desconto − Pix + frete. | Média | Preservar o valor líquido exato por linha e distribuir resíduos de centavos de forma explícita. Não “corrigir” o total recebido da Shopify usando uma soma arredondada. |
| V11 | `v_troca_valores`, `v_troca_carrinho`, `sugerir_troca` | A opção anuncia um arredondamento do total; o carrinho multiplica um preço unitário já arredondado. Os anúncios podem divergir. | Quantidade 3, fator 0,9 e opção R$ 0,05: opção total R$ 0,14; carrinho R$ 0,15. Diferenças anunciadas: −R$ 2,56 e −R$ 2,55. O exemplo pequeno torna visível a diferença de um centavo. | Média | Escolher uma única regra de arredondamento/rateio e usá-la em sugestão, opção, carrinho, conclusão e link público. |
| V12 | `src/components/pedido/NotaFrete.tsx`, `valoresNota` | O resumo da nota omite o desconto Pix tanto com partes quanto sem partes. O detalhe e o romaneio exibem esse desconto. | Venda de R$ 100 no Pix: nota lista peças R$ 100 e total R$ 90, sem explicar os R$ 10 de desconto Pix. “Copiar tudo” repete a omissão. | Média | Exibir o campo `desconto_pix` vindo do banco também nos dados da nota, discriminado por parte quando necessário. |
| V13 | `NotaFrete.tsx`, `dadosFrete`; `v_pedidos.valor_pecas_com_desconto` | O valor das peças fornecido para o frete exclui as vendas somadas, apesar de elas irem no pacote. | Principal R$ 100 + adicional R$ 100: total geral R$ 200, mas “Valor das peças (com desconto)” no frete continua R$ 100. | Média | Disponibilizar no banco o valor das mercadorias do pacote inteiro e usá-lo nos dados do frete, considerando trocas e devoluções. |

## Problemas de etapas, peças e histórico

| ID | Onde | O que acontece | Como reproduzir / evidência | Gravidade | Correção proposta |
| --- | --- | --- | --- | --- | --- |
| V14 | `tg_pedidos_antes`, `useMudarStatus`, `useAcoesPedido`, arrastar em `Expedicao.tsx` | Falta uma trava central para transições e pré-requisitos. O menu oferece qualquer etapa; arrastar verifica o destino, mas não se as peças estão prontas. | Como `authenticated`, atualizar Separação → Enviado com peça pendente é aceito, com nota, embalagem e postagem vazias. Há incoerências reais na tabela abaixo. | Alta | Validar o caminho e os pré-requisitos no banco, incluindo exceções explícitas de retorno e sincronização. A tela deve refletir essa regra. |
| V15 | `troca_escolher`, `troca_carrinho`, `troca_concluir_peca` versus `v_troca_resumo` | A página e o resumo ignoram peças que deixaram de faltar, mas a conclusão continua esperando todas as linhas antigas da troca. O acerto pode nunca ser liberado. | Criar troca com 2 peças; devolver a segunda para pendente; escolher e concluir a primeira. Página conta 1/1, mas a troca fica `enviada`, com `acerto_status=null`. | Alta | Aplicar o mesmo conceito de peça ativa ao responder e concluir, preservando as linhas inativas como histórico. |
| V16 | `useAcoesItem`, `Separacao.tsx`, `AvisoPendentes.tsx` | Restaurar uma peça ou desfazer uma etapa anterior não retorna o pedido para a etapa necessária. Há aviso em Conferência/Etiquetagem/Bipagem, mas não em Nota e frete e depois. | Em Conferência, restaurar uma removida para pendente: pedido permanece em Conferência. Também é possível abrir Separação de um pedido no faturamento e desfazer “Achei”, sem retorno ou aviso equivalente no faturamento. | Média | Decidir o retorno pelo estado das peças no banco; reaproveitar tarefas já feitas, mas impedir fechar etapas posteriores com trabalho reaberto. |
| V17 | `reiniciar_pedido`, `tg_itens_antes` | Reiniciar o pedido inteiro restaura uma peça cujo valor já foi devolvido e limpa as datas de retirada/devolução da linha. O pagamento não é restaurado. | Remover depois de pago, registrar devolução e reiniciar do zero: peça volta pendente e `devolvido_em` fica nulo. O evento antigo continua no histórico, mas a linha perde a situação financeira atual. | Alta | Bloquear ou tratar explicitamente reinício após devolução/acerto; preservar os movimentos financeiros e não recolocar mercadoria já restituída como se estivesse paga. |
| V18 | `troca_concluir_peca`, `etapaCompleta`, Separação | Dar crédito de todas as peças deixa o pedido na Separação, vazio e sem caminho normal de conclusão. | Pedido com uma única linha em falta; concluir como crédito. Total zero e nenhuma peça viva; `etapaCompleta` exige pelo menos uma peça e sempre retorna falso. | Média | Definir um encerramento explícito para pedido integralmente convertido em crédito, preservando o acerto e o histórico. |
| V19 | `src/pages/Romaneio.tsx` | Pedido cancelado aparece com “Pagamento confirmado”, pois o selo depende de estar fora da fase de venda e de não ser perdido. | Abrir o romaneio de uma venda cancelada que nunca foi paga: a condição do selo é verdadeira. | Média | Separar situação do pagamento de situação do pedido e enviar a informação correta pela função pública. |
| V20 | `bipar`, `bipar_ajustar`, restrição de `qtd_bipada` | A função aceita código diferente do SKU e conta peça removida; atualização direta permite mais bipagens que unidades. A proteção está só em parte na tela. | `bipar` com item removido e código `OUTRO-SKU` devolve `ok`. Atualizar `qtd_bipada=99` em uma peça de quantidade 1 também é aceito. | Média | Validar código, peça viva e estado apropriado na função; impor `0 <= qtd_bipada <= qtd` e coerência das marcações ao alterar estado/quantidade. |
| V21 | `src/lib/carrinho.ts`, `variantesDoCarrinho` em `api.ts` | Variante repetida no link perde quantidade: a consulta retorna a variante uma vez e a montagem usa somente a primeira ocorrência. Zero vira 1 silenciosamente. | `/cart/123:1,123:2` termina com 1 unidade em vez de 3; `/cart/123:0` é interpretado como 1. | Média | Validar quantidades e juntar ocorrências por variante antes de buscar o catálogo. |
| V22 | `lerLinkCarrinho` versus `supabase/functions/carrinho-ler/index.ts` | O navegador reconhece `/cart/c/...` como compartilhado, mas a função Edge só extrai token de `/checkouts/...`. O formato encaminhado é recusado. | Colar `https://loja.test/cart/c/abcdefghijk`: vai à função, onde `tokenDoLink` retorna nulo e gera 400. Não depende de credencial para demonstrar a incompatibilidade. | Média | Implementar resolução própria desse formato ou explicar o formato aceito antes de encaminhar. Validar com exemplo real antes de declarar suporte. |
| V23 | `sincronizarCatalogo`, `lerCatalogoInfo`, `catalogo-sync` | O instante da gravação de uma variante isolada é usado como se fosse o último ponto de sincronização do catálogo inteiro. Alterações de outros produtos podem ser puladas. | Catálogo completo às 10h; produto B muda às 11h; carrinho atualiza só A às 12h. O próximo incremental começa às 11h50 e não busca a mudança de B. A checagem de “catálogo recente” também fica enganada. | Média | Guardar marcadores separados para sincronização completa/incremental e leitura avulsa; avançar o marcador global só após concluir todas as páginas. |
| V24 | `catalogo-sync`, modo `variantIds`; `buscarVariantes` | Variante apagada não é retirada/desativada no cache quando a Shopify retorna `null`; a busca seguinte usa o registro velho como se estivesse atual. Carrinho também não filtra produto arquivado. | Cache contém A; busca avulsa de A recebe `nodes:[null]`; nenhuma linha é alterada e `.in(variant_id)` encontra A no cache. | Média | Distinguir indisponibilidade da API de confirmação de exclusão/arquivamento; invalidar o registro confirmado como indisponível e avisar a equipe. |
| V25 | `useSincronizarShopify` versus resposta de `shopify-sync` | O servidor informa `incompleto=true` ao atingir o teto de tempo, mas o app ignora esse campo e anuncia resultado sem avisar que faltaram páginas. | Simular resposta `{importados:0, erros:[], incompleto:true}`: a interface mostra “Nenhum pedido novo”. Repetições podem continuar lendo as mesmas primeiras páginas. | Média | Exibir resultado parcial e permitir continuação por cursor/ponto de retomada, sem perder o acompanhamento de pedidos antigos. |
| V26 | `catalogo-sync`, consulta de produtos alterados | O incremental lê só as primeiras 100 variantes de cada produto e não pagina essa conexão. Mudanças no produto, como foto/status, não atualizam as demais variantes por esse caminho. | Produto com mais de 100 variantes muda foto ou status, sem alterar cada variante. O ramo `products` grava só `variants(first:100)`. | Média | Paginar variantes dos produtos afetados ou usar uma estratégia que leia todas elas com custo medido. É um limite condicional; não foi encontrado produto real nesse cenário. |
| V27 | `troca_carrinho_definir`, permissões e chaves de `troca_escolhas` | Uma função auxiliar acessível à equipe aceita opção pertencente a outra peça e não verifica se a troca já terminou. A chave estrangeira só verifica existência dos IDs. | Com duas peças na troca, chamar o auxiliar com a primeira peça e a opção da segunda: a escolha incoerente entra no banco. As funções públicas de escolha fazem essa validação; o auxiliar não. | Média | Retirar a exposição desnecessária do auxiliar ou validar pertencimento/estado em todos os caminhos; impor o vínculo também na estrutura do banco. |
| V28 | `v_troca_resumo`, `troca_publica`, permissões de atualização de opções | O resumo de uma troca concluída é recalculado com os preços atuais das opções, enquanto o resultado financeiro confirmado fica congelado em outro campo. | Concluir troca que anuncia R$ 40; atualizar preço da opção de R$ 75 para R$ 100 como equipe: o público passa a anunciar R$ 80, mas `resultado_diferenca` continua R$ 40. | Média | Congelar composição e valores confirmados; impedir alterações que reescrevam o resultado histórico ou fazer as views lerem o resultado definitivo. |
| V29 | `tg_troca_pecas_depois`, `troca_escolhas`, eventos de troca | Alterações de quantidade ou de outras opções do carrinho podem sobrescrever a escolha sem guardar a composição anterior no histórico. Os eventos descrevem só a primeira opção e não suas quantidades. | Escolher A e depois mudar sua quantidade, ou acrescentar B mantendo A como primeira opção. O gatilho registra mudança de tipo/primeira opção, mas não essas alterações; atualizar/remover `troca_escolhas` não guarda sua versão anterior. | Média | Guardar eventos/versionamento com a composição e as quantidades, incluindo a composição final confirmada. As atualizações de `troca_pecas` já notificam o Realtime no caminho normal; a ausência de assinatura direta em `troca_escolhas` não foi considerada, sozinha, um bug de atualização da tela. |
| V30 | `src/lib/formato.ts`, `lerNumero`; `CampoReais` | Texto malformado pode virar um valor muito maior em vez de ser recusado. | `lerNumero('10,,50')` retorna 1050; `lerNumero('1.2.3')` retorna 123. O campo formata e pode salvar esse número como válido. | Média | Validar agrupamentos de milhar e separador decimal antes de converter; testar entradas coladas, incompletas e malformadas. |
| V31 | `scripts/simular.mjs`; atualização automática de catálogo | O simulador bloqueia gravações apenas em `/rest/v1/`. Chamadas a `/functions/v1/` e upload no Storage passam fora dessa barreira. Abrir uma busca/troca pode sincronizar o catálogo automaticamente. | Em navegador com dados e sessão fictícios, abrir “Montar troca” disparou uma tentativa de `catalogo-sync`. A barreira externa da vistoria interceptou a tentativa; a barreira do simulador original só cobre `**/rest/v1/**` e não a bloquearia. Nenhuma chamada foi enviada à função real. | Alta | Bloquear por padrão toda saída de rede que possa gravar, com lista explícita de leituras; incluir Edge, Storage e efeitos automáticos. Só então reutilizar o simulador em testes permanentes. |
| V32 | `tests/trocas-ui.mjs` | O teste de tela existente não acompanha os nomes e a apresentação atuais. Ele falha antes de completar o fluxo. | `npm run test:trocas:ui` para na linha 92 procurando “Tirar uma: NOVO-0”; o botão atual é “Diminuir NOVO-0”. Outra expectativa ainda procura preço total isolado, agora apresentado como preço por unidade. | Média | Atualizar as expectativas ao contrato de comportamento atual e executar o fluxo na integração contínua. A cópia temporária ajustada passou; o arquivo original não foi modificado. |
| V33 | `usePecasClube`, `src/pages/Clube.tsx` | O Clube limita o retorno a 30 peças, sem carregar mais nem indicar que existem outras. | Cadastrar mais de 30 peças ativas; sem busca aparecem só as 30 mais recentes. A busca ajuda a achar por termo, mas não permite percorrer o catálogo inteiro. | Média | Paginar a listagem e informar quantidade/continuação; manter busca e filtro de inativas. |
| V34 | `usePedidosFase`, `Vendas.tsx`, `Expedicao.tsx` | A busca de vendas/expedição filtra somente os 300 pedidos já baixados. O aviso manda usar a busca para achar os outros, mas ela não consulta os outros. | Ter 301 pedidos na fase e buscar o número daquele que ficou fora do lote: ele não aparece. | Média | Fazer busca e paginação no servidor; manter contagens globais independentes da página carregada. |
| V35 | Permissões/configuração apontadas pelos advisors | Quatro funções não fixam `search_path`; dois gatilhos antigos continuam executáveis por `anon`; proteção contra senhas vazadas está desligada. São itens de endurecimento, sem exploração demonstrada. | Advisors remotos identificaram `tg_clientes_antes`, `usuario_atual_email`, `tg_pedidos_antes`, `criar_venda` e os gatilhos `tg_itens_depois`/`tg_pedidos_depois`. Função de gatilho não deve ser tratada como RPC de negócio. | Baixa | Migration nova com caminhos e permissões explícitos; rever a configuração de senha e a disponibilidade no plano. Não retirar o acesso das funções públicas necessárias ao romaneio e à troca. |
| V36 | `feriados`, `prazo_envio` | O calendário termina em 2028. Depois disso a função continua calculando, tratando feriados ainda não cadastrados como dias comuns. | Pagamento em 29/12/2028 às 15h resulta em prazo 02/01/2029 às 15h, pois 01/01/2029 não está cadastrado. | Baixa | Guardar calendário com antecedência e alertar quando faltar cobertura; testar a virada do ano sem alterar a regra de 48 horas úteis. |

## Conferência dos pedidos reais

Fotografia do banco durante a vistoria; pode mudar com o trabalho da equipe. Dados de testes anteriores
podem estar presentes. Incoerência no sistema **não comprova** cobrança ou envio físico incorreto.

| Pedido | O que foi observado | Interpretação |
| --- | --- | --- |
| ARV-1272 | Bipagem; 14 linhas pendentes, 4 encontradas e nenhuma conferida/etiquetada. Composição financeira fecha em R$ 677,09. | Dinheiro conferido nessa fotografia; etapa não corresponde ao trabalho das peças (V14/V16). |
| ARV-1273 | Peças R$ 1.806,25 − desconto R$ 451,51 = R$ 1.354,74; total R$ 1.354,70. | Diferença de R$ 0,04 (V10). |
| ARV-1274 | Peças R$ 1.235,22 − desconto R$ 185,24 + frete R$ 22,08 = R$ 1.072,06; total R$ 649,66. | Diferença de **R$ 422,40**. Há peças acrescentadas posteriormente, fora de uma venda somada, e trocas antigas no histórico. Não atribuir toda a diferença a uma ação específica sem reconstruir os eventos; V06 demonstra um caminho atual que permite a divergência. |
| ARV-1275 | Nota e frete; a única linha viva ainda está pendente. Financeiro fecha em R$ 661,20. | Etapa adiantada em relação às peças (V14/V16). |
| ARV-1276 | Etiquetagem; 25 linhas pendentes e 2 em falta; R$ 72,60 a devolver por peça retirada. Composição difere R$ 0,05 do total R$ 932,44. | A devolução da peça original aparece; há problemas de etapa e centavos. O atalho de troca deixou uma linha antiga removida e outra substituta no pedido. |
| ARV-1277 | Enviado; 10 linhas pendentes e 2 em falta. Composição R$ 820,79, total R$ 820,82. | Etapa incoerente e diferença de R$ 0,03. Não foi verificado envio físico. |
| W0006 | Conferência; 11 linhas pendentes. Total R$ 1.745,40, valor pago R$ 343,29. | Há grande diferença entre composição atual e pagamento registrado. Precisa reconstrução do histórico, sem assumir que o restante foi recebido. |
| W0007 | Total original atual R$ 701,54 + W0008 R$ 31,08 = geral R$ 732,62; pagamentos iniciais somados R$ 448,72. | A soma das partes fecha; a diferença para o que foi pago continua precisando de explicação financeira. Há trocas e peças acrescentadas anteriormente. |
| W0008 | Status Somada; R$ 31,08 pagos; zero peças, subtotal e total zero. | Confirma V01 na venda de origem. O valor continua registrado na parte do principal. |

W0001, W0003 e W0005 também foram consultados: estão em Cancelado/Perdida. Não foram apagados nem
reclassificados. Nenhum valor dos pedidos acima foi “acertado” automaticamente.

## O que foi conferido e está certo nos cenários existentes

O alcance desta lista é o dos cenários executados; ela não anula as combinações defeituosas da tabela.

| Assunto | Evidência positiva |
| --- | --- |
| Migrations e banco | As 27 migrations aplicam em sequência no PGlite. Os 74 testes existentes passam. |
| Acesso aos dados | As 13 tabelas públicas têm RLS habilitada; `anon` não tem SELECT direto nelas. Pedidos e itens não têm DELETE para `authenticated`. |
| Páginas públicas | As funções retornam uma seleção de campos, com primeiro nome, sem incluir os campos dedicados a CPF, telefone, e-mail ou endereço. Acesso interno e conclusão pública de troca são recusados nos testes existentes. |
| Troca comum, sem venda somada | Opção do Site/Clube, crédito, descontos fixo/percentual/Pix, quantidade e repetição de conclusão passam nos casos atuais. Falha no meio da transação desfaz a conclusão. |
| Resposta concorrente da cliente | A confirmação com versão antiga é recusada no cenário coberto. Remover opção escolhida pede outra resposta; apagar opção já concluída é recusado. Isso não equivale a impedir toda alteração histórica (V27/V28). |
| Cobertura | Os cálculos de diferença bruta/líquida e o limite da cobertura passam; cobertura não aumenta crédito e não muda depois de troca concluída/cancelada. A situação e o evento do acerto ainda falham (V07). |
| Retirada de peça original | “A devolver”, marcar devolvido/desfazer e evitar descontar duas vezes uma retirada reembolsada pela Shopify passam nos testes atuais. Adicionais e recebimentos posteriores precisam das correções indicadas. |
| Falta parcial comum | Preserva quantidade total, preço pago e ID de linha Shopify, limita a bipagem restante e gera histórico. A perda de vínculo financeiro ocorre nas adicionais (V02). |
| Bipagem pelo caminho normal | Chamadas sucessivas somam sem ultrapassar a quantidade, registram leitura e excedente; ajustar soma/tira mantém 0..qtd. Há caminhos sem a mesma trava (V20). |
| Etiquetas | A montagem gera uma etiqueta por unidade, separa lotes e identifica SKU ausente/não imprimível. Imprimir não marca a peça como etiquetada. Impressora física não foi testada. |
| Sincronização por SQL | Testes cobrem reimportação sem duplicar, complemento de endereço, cancelamento/reembolso, alerta de peças alteradas, preço por ID de linha, rastreio e despacho antecipado sem pular diretamente para Enviado. |
| Segurança das funções Edge | As quatro entradas conferem autenticação ou segredo do agendamento no código compartilhado. O código não coloca a chave administrativa da Shopify/Supabase no navegador. Não foram chamados endpoints reais. |
| Prazo | Testes existentes conferem pagamento em dia útil, fim de semana/feriado e datas móveis de 2028. As funções usam São Paulo independentemente do fuso UTC do banco. A decisão de contar Carnaval/Corpus Christi está preservada. |
| Arquivo | A consulta atual já busca enviados/cancelados/perdidos/somados sem limite de data e oferece carregar mais. A anotação do roadmap de que antigos não aparecem está desatualizada. Busca por SKU ainda é uma melhoria pendente, não foi declarada pronta. |
| Interfaces | Expedição, Vendas, Venda, Arquivo, Clube, Repetidas, romaneio, troca e 11 situações do pedido carregaram em celular/PC no escuro, com API simulada. |
| Tipos e organização | Nenhum uso explícito de `any` foi encontrado em `src`. Ainda há tipos manuais e conversões `as`; `strict` não está habilitado. Não foram feitos refactors nesta fase. |

## Segurança e desempenho medidos

### Advisors do Supabase

Comando executado: `npx supabase db advisors --remote --type all --level info --fail-on none`.
Resultado: **33 ocorrências, sendo 22 avisos, 11 informações e nenhum erro**.

| Regra | Quantidade | Leitura para este projeto |
| --- | --- | --- |
| `function_search_path_mutable` | 4 | Corrigir com migration nova (V35). |
| `anon_security_definer_function_executable` | 6 | Quatro funções públicas são necessárias: romaneio, leitura da troca, escolha e carrinho. Duas funções antigas são gatilhos e merecem revogação explícita. O alerta não demonstra, por si só, vazamento. |
| `authenticated_security_definer_function_executable` | 11 | Revisar por função. Prazo/horas, somar venda, devolução e operações públicas têm uso intencional. O auxiliar de carrinho precisa atenção específica (V27). |
| `auth_leaked_password_protection` | 1 | Proteção contra senha conhecida como vazada está desligada; avaliar configuração/plano. |
| `rls_enabled_no_policy` | 1 | `feriados`: intencional, sem acesso direto pelo app; funções autorizadas fazem a leitura. Não liberar a tabela apenas para apagar o aviso. |
| `unindexed_foreign_keys` | 2 | Faltam índices que cubram `bipagens.item_id` e `pedido_itens.peca_clube_id`. Candidatos a medir quando essas relações crescerem. |
| `unused_index` | 8 | Banco pequeno e recente; ausência de uso nesse período não justifica apagar índices. |

O cadastro público desligado no painel de autenticação **não foi confirmado** nesta vistoria. RLS
permite acesso à equipe pelo papel `authenticated`; portanto essa configuração de cadastro continua
sendo uma dependência a verificar, sem criar usuário ou mudar configuração agora.

### Consultas e espaço

- Banco inteiro: **16.971.443 bytes**, aproximadamente 16,19 MiB.
- Catálogo: aproximadamente 1,82 MiB e 2.044 linhas estimadas; histórico: aproximadamente 600 KiB e
  854 linhas estimadas; itens: 192 KiB e 206 linhas. Contagens de estatística são estimativas.
- Entre as consultas relacionadas a `v_pedidos`, os grupos históricos mais usados tinham 1.171 e
  562 chamadas, médias de 8,223 e 10,165 ms, máximos de 1.837,007 e 921,442 ms.
- `troca_publica`: 153 chamadas, média de 24,536 ms e máximo de 139,654 ms no grupo encontrado.
- Essas estatísticas incluem execuções anteriores e possivelmente definições antigas. Não são uma
  medição de p95 atual, de tempo de rede nem um teste de carga. Não atribuir os máximos a uma causa
  específica sem medir a consulta atual.
- `usePedido` lê pedido, peças e histórico em três consultas paralelas; `useTroca` lê a troca e depois
  três views em paralelo. Componentes que usam a mesma chave do TanStack compartilham a consulta.
  Não foram contabilizados como duplicação só por aparecerem em dois componentes.
- As mutações invalidam várias listas/views e o Realtime repete parte dessas invalidações. Há espaço
  para medir requisições por operação antes de estreitar invalidações. O canal não observa diretamente
  `troca_escolhas`, mas os caminhos normais também atualizam `troca_pecas`, que é observada. Não foi
  demonstrada uma falha de atualização da tela por esse motivo; a perda de histórico é V29.

Prioridade de desempenho: medir as consultas de listagem com a definição atual e volumes maiores;
conferir custo de `prazo_envio` ao ordenar a fila; avaliar índices e invalidações por operação. Não há
base nesta amostra para prometer ganho percentual ou remover índices existentes.

### Tamanho do app

`npm run build` passou: 2.539 módulos transformados; etapa Vite em aproximadamente 0,92 s nesta máquina.
Esse tempo não inclui toda a verificação do TypeScript.

| Artefato | Tamanho bruto | Com gzip |
| --- | --- | --- |
| Entrada `index` JavaScript | 303,06 kB | 97,30 kB |
| Supabase, carregado separadamente | 216,72 kB | 55,95 kB |
| Página Pedido | 136,02 kB | 37,87 kB |
| Página Venda | 31,69 kB | 9,45 kB |
| Página Expedição | 31,96 kB | 10,29 kB |
| Página Troca pública | 14,01 kB | 4,49 kB |
| CSS | 139,21 kB | 21,08 kB |

Soma de todos os arquivos JavaScript: aproximadamente **1.171,52 kB**. Não é o download inicial: as
rotas usam carregamento separado. Não houve aviso de chunk acima de 500 kB neste build. Otimizações
futuras devem considerar o caminho completo da primeira tela e o tamanho de Pedido, não apenas o
arquivo de entrada.

## Verificações e limitações

| Verificação | Resultado |
| --- | --- |
| `npm run test:banco` | **74/74 passaram** com migrations reais em memória. |
| `npm run build` | Passou, sem alteração no código. |
| `npm run lint` | Passou, com 8 avisos: 6 de exportação de componentes UI, 1 de estado em efeito em `use-mobile`, 1 de variável não usada em `shopify-clientes`. |
| `npm run test:trocas:ui` original | **Falhou**, por seletor antigo; V32. Não declarar essa suíte verde. |
| Cópia temporária do teste público | Ajustando somente nomes dos dois botões e expectativa do preço por unidade, passou em **390 e 1280 px**: erro recuperável, escolha, quantidade, crédito, cobertura, resumo e conclusão. Não foi usada para substituir o arquivo original. |
| Carregamento de telas | 38 situações no escuro, rede externa bloqueada, sem erro de JavaScript/rolagem horizontal nos cenários fictícios. Capturas em `capturas/vistoria-*.png`, ignoradas pelo Git. |
| `npm run simular` e `npm run capturas` originais com sessão real | Não executados: o primeiro tem a falha V31; o segundo não bloqueia gravações/efeitos automáticos. Foi usada uma barreira de rede temporária mais abrangente. |
| Chamadas Shopify/Edge reais | Não executadas; poderiam gravar/sincronizar. Foram lidos código, definições de API e dados já importados. Não se confirmou aqui que a versão publicada de cada Edge é idêntica à local. |
| Impressão e emissão externas | Não houve impressão física, emissão de nota, contratação de frete ou postagem. |

Também precisam de validação futura: custo real da consulta de checkout abandonado (ela pede até
100 checkouts × 100 linhas), carrinhos compartilhados reais, pedidos parcialmente enviados, taxas,
gift cards, múltiplos fretes/pagamentos e concorrência de duas pessoas em etapas diferentes. O código
importa apenas linhas físicas a expedir, mas usa o total completo da Shopify; o alinhamento financeiro
nessas combinações merece testes próprios. Essas hipóteses não foram somadas aos 36 bugs confirmados
por código, dados ou reprodução.

## Roteiro reproduzível dos principais erros

O bloco abaixo reproduz V01/V02 em **banco local descartável com as migrations aplicadas**, como o
PGlite da vistoria. As escritas deste exemplo não foram enviadas ao Supabase remoto.

```sql
begin;
set local role authenticated;

insert into public.pedidos (id, origem, status, valor_pago, pago_em)
values ('00000000-0000-0000-0000-000000000101', 'whatsapp', 'separacao',
        100, now() - interval '1 day');
insert into public.pedido_itens (pedido_id, origem, nome, qtd, preco)
values ('00000000-0000-0000-0000-000000000101', 'avulso', 'Original', 1, 100);

insert into public.pedidos (id, origem, status, somar_em)
values ('00000000-0000-0000-0000-000000000102', 'whatsapp', 'em_aberto',
        '00000000-0000-0000-0000-000000000101');
insert into public.pedido_itens (id, pedido_id, origem, nome, qtd, preco)
values ('00000000-0000-0000-0000-000000000103',
        '00000000-0000-0000-0000-000000000102', 'avulso', 'Adicional', 2, 50);

select public.somar_venda('00000000-0000-0000-0000-000000000102', 'Cartão', 100);
-- Principal: total_geral = 200. Origem: total = 0 e nenhuma peça (V01).
select id, total, total_geral, qtd_pecas from public.v_pedidos
where id in ('00000000-0000-0000-0000-000000000101',
             '00000000-0000-0000-0000-000000000102');

select public.marcar_falta('00000000-0000-0000-0000-000000000103', 1);
-- Total geral vira 250, embora não tenha ocorrido nova compra (V02).
select total_geral, qtd_adicionais from public.v_pedidos
where id = '00000000-0000-0000-0000-000000000101';
rollback;
```

V03/V05/V07/V08/V15/V17/V20/V27/V28 foram reproduzidos com os mesmos objetos reais de banco em
transações descartadas. Os passos e os resultados numéricos estão nas respectivas linhas da tabela.
V21/V30 também foram chamados diretamente nas funções TypeScript, sem navegador ou rede.

## Sequência proposta depois da revisão

1. Na Fase 2, guardar primeiro reproduções permanentes dos problemas de dinheiro e de avanço de etapa.
   Preparar Vitest/PGlite, testes de propriedades, tipos gerados, verificações de tipos/lint e execução
   pelo GitHub. Usar o simulador em testes somente depois de fechar V31.
2. Preparar travas de integridade, saldos por parte e vigilância diária como migrations **novas**, com
   GRANT explícito. Mostrar o dry-run e pedir o “sim” específico antes de qualquer aplicação remota.
3. Na Fase 3, corrigir os 13 problemas de gravidade alta antes dos demais. Cada correção deve ter um
   teste que falhe no código atual. Reconstruir os pedidos já incoerentes separadamente: corrigir código
   não autoriza modificar dados antigos nem presumir recebimentos/devoluções.
4. Otimizar apenas com medição e conferir qualquer efeito visual no celular e PC, incluindo o escuro.
5. Na Fase 4, ligar cada correção ao commit e atualizar `ESTADO-ATUAL.md`, `CLAUDE.md` e `TESTES.md`.
   Hoje `ESTADO-ATUAL.md` contém registros históricos contraditórios sobre migrations/publicações;
   as 27 migrations conferidas remotamente são a referência desta vistoria.

**Ponto de parada da Fase 1 cumprido. O Gustavo pediu para continuar; Fase 2 local entregue abaixo.**

## Continuação — Fase 2 local, sem aplicação remota

| Commit | Entrega |
| --- | --- |
| `d3a569f` | Preserva os 74 testes, organiza por assunto, acrescenta propriedades e nove reproduções abertas. |
| `957791b` | Usa tipos oficiais do Supabase no cliente e nos registros principais; gera complemento para migrations locais. |
| `834d065` | Prepara três restrições, endurecimento de funções e vigia diário com aviso discreto. |
| `f368891` | Fecha a barreira do simulador, substitui teste de tela desatualizado e prepara npm test/GitHub Actions. |

Validação: `npm test` passou tipos, lint (os oito avisos anteriores), 41 testes unitários,
84 SQL aprovados e 10 de tela, além do build. Outros nove SQL são reproduções de bugs abertos com
falha esperada; não estão resolvidos. As propriedades geram 80 pedidos e 40 trocas em cada execução.

V31 (simulador) e V32 (teste de tela desatualizado) corrigidos localmente em `f368891`.
V20 (bipagem), V27 (opção de outra peça) e V35 (segurança) receberam proteções parciais em `834d065`;
isso não encerra seus demais caminhos nem os aplica no Supabase. Os outros problemas seguem abertos.

Migrations pendentes: `20261117090000_protecoes_integridade.sql` e `20261117100000_vigia_diario.sql`.
O dry-run listou exatamente essas duas. Consulta remota somente leitura encontrou **zero violações**
das três restrições propostas; não houve alteração de pedidos. O cron foi simulado nos testes;
seu funcionamento no relógio real depende de aplicação autorizada e conferência do histórico de jobs.
Capturas: `capturas/vigia-celular.png` e `capturas/vigia-pc.png`, escuras, dados fictícios.
Guia de manutenção: [`TESTES.md`](TESTES.md). A Fase 3 começou pelos problemas financeiros altos.

## Fase 3 — correções locais em andamento

Todas as migrations desta seção estão apenas no repositório local. Nenhuma correção de código autoriza
reconstruir pedidos antigos ou presumir recebimentos. A publicação de Edge e a aplicação de SQL seguem
dependendo do “sim” específico. Reproduções foram executadas falhando antes das alterações.

| ID | Commit | Correção e proteção |
| --- | --- | --- |
| V02 | `bb738fa` | Falta parcial mantém adicional, venda de origem e preço pago; regressões com falta/defeito e Cartão/Pix. |
| V01 | `6d3b5a9` | Retrato imutável mantém itens e valores da venda de origem; total aparece sem duplicação no principal; regressão SQL e romaneio em celular/PC. |
| V07 | `1bb798e` | Situação, validação e histórico do acerto usam saldo após cobertura; testes com cobertura parcial/total/excedente e crédito. |
| V15 | `10a2ab0` | Resposta/conclusão ignoram peças que já não faltam e guardam suas linhas históricas; testado por escolha e carrinho. |
| V17 | `87f755b` | Reinício e restauração recusam peça com devolução confirmada; reiniciar só a etapa mantém o registro financeiro. |
| V05 | `6410f01` | Reajuste do desconto fixo exclui adicionais da base original; Cartão/Pix e cobertura conferidos. |
| V06 | `327bd79` | Atalho Trocar usa uma transação com acerto, repetição segura e rollback; acréscimo direto é restrito à venda aberta; testes SQL e celular/PC. |
| V09 | `242de71` | Edge separa total atual de recebido líquido, preservando recebido/reembolsado/saldo no bruto; quatro casos simulados sem chamar a Shopify. |
| V14 | `1191d8c` | Banco exige trabalho anterior, documentos, embalagem/postagem e acerto; menu lê a mesma decisão pronta. Testes incluem inserção direta e passagem por cada etapa. |
| V16 | `665438d` | Restaurar peça ou desfazer trabalho/documento retorna à primeira etapa necessária; preserva trabalho das outras peças, bloqueia reabertura em arquivados e reavalia uma vez por pedido em alterações em lote. |
| V03/V11 | `e4102f5` | Cada parte (pedido e vendas somadas) conserva sua base e recebe só as próprias diferenças de troca; valor exato por linha e rateio por acumulados evitam perder centavos. |
| V08 | `6fc1c51` | Recebimento, crédito e estorno de acerto viram movimentos imutáveis em `movimentos_financeiros`; `total_pago` e devoluções usam esses movimentos sem contar duas vezes. |
| V04 | `0521746` | Retirar adicional paga reduz o pacote e reserva devolução só do que foi recebido; saldo do acerto é reconciliado quando peças ou pagamento mudam. |
| V30 | `abb1d0a` | Valor em reais malformado (`10,,50`, `1.2.3`) é recusado em vez de virar outro número. |
| V21 | `f8449f6` | Variante repetida no link do carrinho soma as quantidades; quantidade zero sai. |

Para V09 foi usado `netPaymentSet`, definido como recebido menos reembolsado na
[referência oficial da versão 2026-01](https://shopify.dev/docs/api/admin-graphql/2026-01/objects/Order#field-Order.fields.netPaymentSet).
Campo ausente gera erro por pedido e não grava um pagamento presumido. É uma correção local da Edge;
a versão publicada ainda não mudou. Totais legados das vendas somadas sem retrato continuam sinalizados
pelo vigia; a migration não inventa uma fotografia antiga.

| V10 | `7a098da` | Edge manda o valor exato de cada linha (resíduo de centavos distribuído); banco grava na importação e completa nas sincronizações, só em peça viva, inteira e sem troca. |
| V12 | `4d17e37` | Nota mostra o desconto Pix (com e sem vendas somadas). |
| V13 | `d72d85a` | `valor_pecas_pacote` na `v_pedidos`: frete declara pedido + vendas somadas. |
| V18 | `944609c` | Pedido todo convertido em crédito explica como encerrar (acerto + cancelar); banco permite. |
| V19 | `357cff7` | Romaneio de pedido cancelado mostra "Pedido cancelado", não "Pagamento confirmado". |
| V20 | `5e29917` | `bipar` confere o SKU e exige peça separada; Contar 1 também. |
| V22 | `560baf6` | `/cart/c/` é recusado na hora com explicação, em vez de erro 400 na função. |
| V23/V24/V26 | `9f59a43` | Marcador `catalogo_sincronizacao`; variante apagada sai do cache; arquivada vai a "faltando"; incremental pagina variantes. |
| V25 | `7baa36e` | Sincronização da Shopify continua de onde parou (até 4 partes) e avisa se faltou. |
| V27 | `97c5f6f` | Auxiliar do carrinho recusa troca encerrada e opção de outra peça. |
| V28 | `89fa5ee` | Opção de peça concluída não muda nem recebe opção nova. |
| V29 | `6da5554` | Cada mudança do carrinho da troca vira evento `troca_carrinho` no histórico. |
| V33 | `50972a8` | Clube com "Carregar mais". |
| V34 | `67c3f18` | Busca de vendas/expedição feita no banco, além dos 300 da lista. |
| V36 | `1f96f9a` | Feriados até 2040 (móveis pela Páscoa) e vigia avisa com um ano de antecedência. |

Teste de conservação (`414d8e8`) achou mais um furo, corrigido em `04cb606`: com duas trocas seguidas,
a diferença ainda não recebida da primeira sumia quando a segunda não tinha diferença.

**Resultado: 35 dos 36 problemas corrigidos, mais o furo achado pelo teste de conservação.** Resta só
parte de V35, que é configuração do painel: ligar a proteção contra senhas vazadas (Authentication →
Passwords; pode exigir plano pago) e confirmar que o cadastro público está desligado. Os avisos
restantes dos advisors são as funções públicas intencionais (romaneio e troca da cliente).

**Aplicado no Supabase em 12/11/2026**, com o "sim" do Gustavo: migrations `20261117090000` até
`20261119180000` e as Edges `shopify-sync` e `catalogo-sync`. Pedidos antigos de teste continuam com
avisos do vigia (o Gustavo vai zerar o app). Os centavos de ARV-1273/1276/1277 se acertam no próximo
"Sincronizar". Conferência somente leitura pelo CLI agora roda a `v_pedidos` e o vigia
(`listar_inconsistencias()`).

## Achados do teste da troca no ARV-1273 (V37 a V39, 12/11/2026)

O Gustavo testou a troca no ARV-1273 e mandou prints. Três problemas novos, corrigidos **localmente** na migration
`20261120090000_trocas_visiveis.sql` (ainda não aplicada no Supabase; só entra com o "sim" dele). Cada um tem
teste que falhava antes e passa depois (`tests/banco/trocas_visiveis.test.mjs`, `tests/unidade/etapas.test.ts`,
`tests/unidade/trocaTexto.test.ts` e o fluxo de tela V37 em `tests/e2e/fluxos.spec.mjs`).

| ID | Gravidade | O que acontecia | Correção e proteção |
| --- | --- | --- | --- |
| V37 | Alta | Falta marcada na Conferência (ou Etiquetagem, Bipagem...) mandava o pedido para "avisar cliente", que a esteira contava como Separação: o pedido "voltava" para a Separação e a Conferência ficava bloqueada. Ao resolver, ia sempre para a Separação, sem lembrar de onde veio. | Coluna `pedidos.etapa_antes_desvio` gravada por gatilho ao entrar no desvio (mantida entre avisar e aguardar, limpa ao sair; desvios já existentes são preenchidos pelo histórico). Função `sair_do_desvio` leva o pedido à etapa de origem quando não sobra peça pendente/em falta e a etapa ainda vale; senão à Separação. `troca_concluir_peca` usa a função (crédito volta à origem; peça nova entra pendente e vai à Separação). O app mostra a etapa de origem como atual, com o selo do desvio, e o cartão "Avise a cliente" aparece nela. Mover por "Mover para…" continua indo para onde a pessoa escolheu. |
| V38 | Média | O dinheiro no banco estava certo (a cobertura da loja não mudava o total), mas a tela dizia "Cliente paga +R$ 0,68" no painel de opções, na escolha da cliente, na confirmação e na peça resolvida, porque usava a diferença bruta. Nos dados do pedido a cobertura ficava escondida dentro do "Desconto". | `v_troca_valores`, `v_troca_carrinho` e `sugerir_troca` ganharam `coberto_previsto` e `cliente_paga_previsto`; `troca_painel` traz `coberto` e `cliente_paga` das peças resolvidas; `v_pedidos` ganhou `desconto_sem_cobertura` (o desconto sem a cobertura) e `desconto_percentual`. Os rótulos viram "Arvenne cobre R$ X" e/ou "Cliente paga R$ Y". "Cobrir tudo" grava `cobrir_ate = 99999999.99` e os textos dizem "A loja cobre a diferença". Invariante testada: subtotal − desconto sem cobertura − cobertura − Pix + frete = total (WhatsApp e Shopify). |
| V39 | Média | Abrir a troca era lento: ler a troca, depois três views, depois `garantir_troca` e ler tudo de novo (várias viagens em série até os EUA), e a tela inteira ficava em "Montando a troca…". | Função `troca_painel` devolve tudo numa viagem (`useTroca` a usa, com o caminho antigo como reserva). Com a troca já lida, o diálogo abre na hora; só a peça que ainda não tem `troca_peca` mostra "preparando" enquanto o `garantir_troca` roda. |

Também ficaram prontos, para as telas do próximo bloco: a view `v_pedido_alteracoes` (trocas, créditos, peças tiradas
pela cliente e quantidades reduzidas depois do pagamento, com quem fez, coberto, a devolver e devolvido) e o hook
`useAlteracoes`; e `pedidos.descontos` (motivo dos descontos da Shopify: cupom, automático, manual, script; percentual
ou valor), preenchido por gatilho a partir de `discountApplications`, que a função `shopify-sync` passou a buscar numa
consulta à parte e tolerante (se falhar, o pedido entra sem o motivo).

## Referências técnicas consultadas

- A distinção entre total atual, recebido, reembolsado e saldo em aberto de V09 foi conferida na
  [referência oficial de Order da Shopify](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order).
- A necessidade de medir o custo das conexões GraphQL segue os
  [limites oficiais da Shopify](https://shopify.dev/docs/api/usage/limits).
- O significado e as formas de executar os advisors foram conferidos na
  [documentação oficial do Supabase](https://supabase.com/docs/guides/observability/advisors).
