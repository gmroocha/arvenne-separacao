# Estado atual (atualizado em 19/11/2026)

## Fase 4: Indicadores (19/11/2026) — **migration NÃO aplicada** (`20261126140000_indicadores.sql`; falta o "sim" do Gustavo para o `db push`)

- Página `/indicadores`, só gestor (`SoGestor`, item "Indicadores" no menu). Segue o livro *Gestão de Alta Performance*: resultado e não atividade,
  quantidade ao lado de qualidade, o que antecipa problema (fila e pedido mais antigo), gargalo, defeito pego na etapa mais barata, no máximo 6 números
  no topo. Seletor Hoje / 7 dias / Mês (fuso São Paulo; Mês = mês corrente). Tudo vem do banco; a tela só exibe (sem cor fora de estados: verde,
  amarelo e vermelho só na fila, pelo termômetro).
- Funções `security definer` que começam por `exigir_gestor()` (GRANT só a `authenticated`, anon nada): `indicadores_resumo(de, ate)` (jsonb: % no
  prazo de 48 h úteis, pedidos e peças enviados, erros a cada 100 peças, problemas na cliente, % de erros pegos antes da cliente, tempo médio por etapa
  e gargalo), `indicadores_fila()` (por etapa: total, cores do termômetro, pedido mais antigo), `indicadores_pessoas(de, ate)` e `pontuacao_mes(mes)`.
  `indicadores_passagens` é interna (ninguém logado chama). Definições: **enviado** = `postado_em` no período; **no prazo** = `postado_em <=
  prazo_envio(pago_em)`; **peças separadas** = peças dos pedidos que saíram da Separação no período; **erro** = `erro_bipagem` + `falta_indevida`
  não anuladas; **gargalo** = etapa de maior tempo médio (horas úteis) entre as passagens concluídas no período.
- **Quem fez** = a regra da Fase 3 (autor gravado na peça; senão responsável da etapa; senão quem saiu da etapa, pelo e-mail), em lote, sem chamada por
  pedido. A tela avisa: "Enquanto as colaboradoras não têm login, quem fez = responsável da etapa."
- **Pontuação do mês (0 a 100)**, fórmula numa função só, `pontuacao_componentes` (ajustar os pesos e a penalidade lá): 50% qualidade (100 menos 10
  pontos por ocorrência a cada 100 peças, piso 0), 30% produção (peças por hora sobre a média do time, máx. 100), 20% prazo (% das passagens dentro da
  meta de `metas_etapa`). Bônus: 85 ou mais e zero problema na cliente. Peças por hora = peças das passagens da pessoa / horas úteis das passagens
  (inclui a espera na etapa, é o mesmo tempo do termômetro; serve para comparar o time, não para cronometrar uma pessoa).
- Limites: etapa pulada à mão conta para o responsável; sem gráficos de biblioteca (o `chart` do shadcn pede `recharts`, não instalado): só barras
  simples em CSS. Antes do `db push` a tela mostra "Atualize o banco para ver esta tela".
- Testes: `tests/banco/indicadores.test.mjs` (contas à mão, funcionária e anon recusados), `tests/e2e/indicadores.spec.mjs`; o simulador
  (`scripts/simulacao/rede.mjs`) passou a aceitar as 4 funções como leitura.

## Fase 3: quem fez cada peça e ocorrências (19/11/2026) — **aplicada em 19/11 com o "sim" do Gustavo** (migration `20261126130000_fase3_ocorrencias.sql`)

- **Regra de "quem fez" (decisão do Gustavo):** quem fez o passo = o **responsável da etapa no pedido** (`pedidos.responsaveis ->> etapa`); sem
  responsável, quem clicou (`membro_atual()`). Está numa função só, `autor_da_etapa(pedido, etapa)`. As colaboradoras ainda não têm login, então
  quase tudo sai no nome do Gustavo/da responsável designada; **as métricas de hoje serão zeradas depois** (`scripts/zerar-testes.sql` agora também
  esvazia `ocorrencias`). Com todas logadas, a funcionária só vê o pedido em que é responsável e os dois valores coincidem.
- `pedido_itens` ganhou `separado_por`, `conferido_por`, `bipado_por`, `falta_por` (só o **último** autor, nada clique a clique). `marcar_pecas`
  (lote) grava no mesmo update e limpa ao desfazer; `alterar_item` e `marcar_falta` preenchem `falta_por`. O gatilho mínimo `itens_limpa_por`
  limpa o autor sempre que o passo some (mover etapa, reiniciar, falta na linha inteira).
- Tabela `ocorrencias` (tipos `erro_bipagem`, `falta_indevida`, `problema_entrega`, CHECK dos motivos por tipo; "outro" exige texto). RLS: lê quem vê o
  pedido; gravar só pelas funções; sem DELETE; anon nada. View `v_ocorrencias` (security_invoker, com nomes). Funções: `registrar_erro_bipagem`
  (peça volta a pendente, zera conferência/bipagem/autores e o pedido volta sozinho para a Separação; só com o pedido em separação/conferência/bipagem),
  `registrar_problema_entrega` (só pedido `enviado`; etapa sugerida pelo motivo, editável), `responsavel_sugerido`, `anular_ocorrencia` (só gestor),
  `etapa_da_ocorrencia`, `quem_fez_etapas(pedido)` (pessoa e data de cada etapa, mesma regra de `responsavel_sugerido`; a tela só exibe).
  **Falta indevida** sai de dentro de `alterar_item` (vale também para `encontrar_peca`): peça em falta/defeito achada por **outra pessoa que
  não quem marcou a falta** (quem encontrou = quem clicou, `membro_atual()`) gera a ocorrência em nome de quem marcou, sem gatilho novo. Atenção:
  enquanto o Gustavo clicar tudo, uma falta marcada em nome de uma responsável e achada por ele gera ocorrência (a métrica será zerada depois).
  `autor_da_etapa` e `registrar_falta_indevida` conferem `exigir_pedido`. `v_ocorrencias` não expõe `registrado_por` bruto (só o nome) e traz
  `ativas_no_pedido`; a tela não conta nada.
- Cópias das funções vigentes: `marcar_pecas` (20261126100000), `alterar_item` e `marcar_falta` (20261125153000, V114 mantido).
- **Tela:** menu "⋯" da peça na Bipagem ganhou "Erro na peça" (Dialog com motivos, texto para "Outro", "Separada por" sugerido e editável,
  botão Continuar). Concluídos: tocar na linha (ou "Ver detalhes" no menu) abre um Sheet (de baixo no celular, lateral no PC) com peças, "Quem fez",
  ocorrências (Anular para gestor) e "Registrar problema na entrega". Página do pedido mostra um cartão discreto "Ocorrências" se houver. Novo
  componente `src/components/ui/radio-group.tsx`. Sem dinheiro em nenhuma dessas telas.
- Antes do `db push` o app tolera o banco antigo (listas de ocorrências vazias; o Sheet lê as peças sem as colunas novas), mas "Erro na peça" e
  "Registrar problema" recusam com "Atualize o banco para usar esta função".
- Testes: `tests/banco/ocorrencias.test.mjs`, `tests/e2e/fase3-ocorrencias.spec.mjs`; `zerar.test.mjs` e o `rede.mjs` do simulador (leitura de
  `v_ocorrencias`, `v_tempo_etapas` e `responsavel_sugerido`) atualizados.

## Termômetro: ajustes, 19/11/2026 — **aplicada em 19/11 com o "sim" do Gustavo**

Falta o "sim" do Gustavo para `db push` (rotina: `--dry-run` e depois `--yes`). O app novo já tolera o banco antigo: a Fila nunca mostra
cor (guarda `termometroDaEtapa` em `src/lib/termometro.ts`), e "Avisar cliente" só ganha cor depois da migration.

- Pedido do Gustavo: (1) a **Fila** não tem termômetro (sem contorno e sem pontinho; o texto "Na fila há X" fica); o termômetro começa na
  Separação. (2) O **contorno** do cartão só aparece em amarelo e vermelho; verde = cartão normal, só o pontinho verde ao lado do tempo.
  (3) **"Avisar cliente"** passa a ter termômetro, com meta própria (padrão 2 h úteis, editável); "Aguardando cliente" continua sem.
  (4) Atalho **"Metas"** (ícone de termômetro) na Expedição, ao lado do filtro por pessoa, leva a `/time#metas`.
- Migration `20261126110000_termometro_ajustes.sql`: CHECK de `metas_etapa.etapa` ganha `avisar_cliente` (constraint recriada com nome
  explícito), meta de 2 h para ela, `termometro_etapa` devolve nulo para `novo` e usa a própria meta de `avisar_cliente`, e
  `v_pedidos_operacao` (cópia de `20261125160000_cliente_decidiu.sql`, mesmas colunas) calcula `horas_na_etapa` também em `avisar_cliente`.
- Tela: `tracoDoTermometro` só em amarelo/vermelho; `TempoNaEtapa` sem ponto quando não há termômetro; Time lista "Avisar cliente" logo
  depois de "Separação" e tem `id="metas"` (rola até lá com `#metas`) e um botão "Metas de tempo" no topo. O atalho da Expedição só
  aparece para gestor (`useSouGestor`, Fase 2), como o próprio Time.
- Testes: `tests/banco/termometro.test.mjs`, `tests/unidade/termometro.test.ts`, `tests/e2e/termometro.spec.mjs`, `embalagem-frete.spec.mjs` (metas).
- A Fase 2 (já aplicada) não mexeu em `v_pedidos_operacao` nem em `termometro_etapa`; a migration parte da versão de `20261125160000`.
## Reabrir pedido concluído (19/11/2026) — **aplicada em 19/11 com o "sim" do Gustavo**

- Pedido do Gustavo: "Em um pedido concluído tem que ter como mudar ele de etapa... Pode acontecer de marcar como concluído sem querer."
- Só o **gestor** reabre. Menu "Mover para outra etapa" no "⋯" da tela do pedido concluído e no menu de cada linha de Concluídos
  (abas A caminho e Entregues): lista só as etapas anteriores da origem do pedido (Shopify sem "Enviar rastreio") e o diálogo avisa
  "O que foi feito desta etapa em diante será desfeito (...)". Depois de mover, o pedido sai de Concluídos e aparece na Expedição.
- Migration `20261126120000_reabrir_concluido.sql`: `mover_etapa` aceita sair de `enviado` só para trás e só para gestor ("Só gestor
  pode reabrir um pedido concluído."); zera o trabalho do destino em diante como em qualquer volta e também `entregue_em`; grava o
  evento `reiniciado` ("reaberto: voltou para X") além do `status`. Cópias de `regras_etapas`, `tg_pedidos_antes` e
  `tg_trabalho_reaberto` aceitam a saída de `enviado` **só** enquanto `mover_etapa` liga `arvenne.reabrir`; gravar `status` ou peça
  direto num concluído continua recusado.
- **Decisão:** `rastreio` e `rastreio_url` (e `nf_numero`, `nf_chave`, número do fornecedor) **ficam** ao reabrir, para a Postagem
  mostrar o link já preenchido e a equipe só conferir ou trocar. Dinheiro não é tocado. Não volta sozinho para Concluído: os carimbos
  do destino em diante saem e o avanço automático só dispara quando um carimbo passa de vazio para preenchido.
- Antes do `db push` a tela mostra o menu, mas o banco antigo recusa com "já está concluído" (mensagem em toast).
- Testes: `tests/banco/reabrir-concluido.test.mjs`, `tests/e2e/reabrir-concluido.spec.mjs`; `esteira.test.mjs` perdeu a linha que
  esperava a recusa antiga.

## Cliente decidiu (19/11/2026) — **aplicada em 19/11 com o "sim" do Gustavo** (2 pedidos já entraram na coluna)

- Pedido do Gustavo: ver na Expedição os pedidos em que a cliente já escolheu na página da troca, mesmo sem a equipe ter
  concluído. Nova coluna **"Cliente decidiu"** (verde), logo depois de "Aguardando cliente". **Não é status novo**: a máquina de
  estados segue com `avisar_cliente` e `aguardando_cliente`; a coluna é derivada.
- Regra (no banco): pedido em `avisar_cliente`/`aguardando_cliente` cuja troca ativa (`enviada` ou `respondida`) tem peça com
  `escolha_tipo` preenchido e `concluida_em` vazio. Esses pedidos saem das colunas Avisar/Aguardando. O cartão mostra "Decidiu X de Y"
  (X = peças escolhidas e não concluídas, Y = peças da troca ainda não concluídas). Quando a equipe conclui a troca o pedido sai sozinho.
- Migration `20261125160000_cliente_decidiu.sql`: função `decisao_troca(pedido, status)` (invoker; zeros fora de Avisar/Aguardando, sem
  tocar nas tabelas da troca) e `v_pedidos_operacao` com 3 colunas novas no fim (`troca_decididas`, `troca_pecas_abertas`, `cliente_decidiu`).
  `v_pedidos` NÃO ganhou as colunas (como `horas_na_etapa`/`termometro`, só existem na lista da esteira); `operacao-leve.test.mjs` as ignora
  na comparação das duas views.
- Tela: `Expedicao.tsx` (filtro `decidiu` por coluna; a coluna nova não aceita soltar cartão), `CardPedido.tsx`, ícone em `status.ts`.
  Antes do `db push` a tela não quebra, mas a coluna fica vazia e os pedidos continuam em Avisar/Aguardando.
- Testes: `tests/banco/cliente-decidiu.test.mjs`, `tests/e2e/expedicao-cliente-decidiu.spec.mjs`.

## Falta na Separação espera as outras peças (V114, 19/11/2026) — **aplicada em 19/11 com o "sim" do Gustavo**

- Pedido do Gustavo: marcar falta na primeira peça não manda mais o pedido para "Avisar cliente". Ele fica na Separação até
  todas as outras peças serem encontradas, marcadas em falta ou retiradas; aí vai sozinho para "Avisar cliente". Na
  Conferência e na Bipagem (todas as peças já achadas) a falta continua abrindo o aviso na hora.
- `sair_do_desvio` não tira o pedido do aviso com peça ainda em falta e não usa mais a antiga etapa Frete.
- Migration `20261125153000_falta_espera_separacao.sql`, teste `tests/banco/falta-espera-separacao.test.mjs` (V114).

## Fase 2: login por usuário, papéis e "cada uma vê os seus" (19/11/2026) — **aplicada e Edge `equipe-acesso` publicada em 19/11 com o "sim" do Gustavo** (conferido: o único login é gestor ativo e casa com o Time; falta definir o responsável padrão de cada etapa e criar os acessos)

Segunda de quatro fases. Falta o "sim" do Gustavo para `db push` e `supabase functions deploy equipe-acesso`. O código do app
já está preparado para o banco antigo (sem `membro_atual`, sem `usuario`, sem `responsavel_padrao`: a tela cai em "gestor" e
em lista vazia, sem quebrar), então publicar o app antes do `db push` é seguro; a funcionária só passa a ter menu e pedidos
restritos depois das migrations.

- **Login por usuário:** `src/lib/loginInterno.ts` (e a cópia `supabase/functions/_shared/usuario.ts`) monta o e-mail interno
  `usuario` + `@equipe.arvenne.invalid`; `Login.tsx` aceita "Usuário ou e-mail" (sem `@` vira o e-mail interno). Função Edge
  `supabase/functions/equipe-acesso` (só gestor): `criar`, `trocar_senha`, `bloquear`, `desbloquear`. Time: "Criar acesso" /
  "Trocar senha" por pessoa; Desativar/Reativar bloqueia/desbloqueia o login; Excluir bloqueia antes de apagar.
- **Migration `20261126090000_acesso_e_papeis.sql`:** `equipe.usuario` (único, formato) e `equipe.user_id` (único, sem FK para
  auth); `sou_sistema()`, `membro_atual()` (por `user_id`, senão por e-mail), `sou_gestor()` de volta (pessoa ativa com papel
  gestor; sem JWT de pessoa vale como sistema); políticas de `equipe` só do gestor; `excluir_membro` só gestor; gatilho do
  último gestor de volta; tabela `responsavel_padrao`.
- **Migration `20261126100000_visibilidade_pedidos.sql`:** `etapa_da_esteira()`, `pode_ver_pedido()`, `exigir_*()`; RLS de
  `pedidos` (gestor vê tudo; funcionária só `responsaveis ->> etapa atual = membro_atual()`; criar pedido só gestor; edição com
  WITH CHECK livre, porque o pedido pode mudar de etapa na própria edição) e das tabelas filhas (`pedido_itens`,
  `pedido_eventos`, `bipagens`, `creditos_cliente`, `movimentos_financeiros`, `trocas`, `troca_pecas`, `troca_opcoes`,
  `troca_escolhas`); `tg_pedidos_antes` preenche o responsável padrão; `preencher_responsaveis_padrao()`; funções definer com
  conferência no começo (`mover_etapa`, `marcar_pecas` [agora definer], `encontrar_peca`, `substituir_item`, `sair_do_desvio`,
  `marcar_devolvido`, `corrigir_frete_pedido`, crédito, troca, e gestor-only: `designar`, `excluir_pedido`, `somar_venda`).
  As demais funções (`marcar_falta`, `alterar_item`, `avancar_pecas`, `bipar`...) são invoker e obedecem à RLS.
- **Tela:** menu e rotas do gestor atrás de `SoGestor`/`useSouGestor`; funcionária vê só Expedição e `/pedidos/:id`, sem
  filtro por pessoa, sem Sincronizar e sem escolher responsável; Time ganha Papel, usuário, Criar acesso/Trocar senha e
  "Quem cuida de cada etapa" (+ "Aplicar aos pedidos de hoje"); "Comigo" usa `membro_atual`.
- **Testes:** `tests/banco/visibilidade.test.mjs`, `time.test.mjs` (V109 de volta), `tests/unidade/{loginInterno,equipe-acesso}`,
  `tests/e2e/{login-papeis,time-acesso}.spec.mjs`. O simulador aceita `papel: "gestor" | "funcionaria"` (sem `papel` o login é
  "livre", como service_role) e atende `/auth/v1/token` e a Edge `equipe-acesso` de mentira. `esteira-ponta-a-ponta` roda como gestor.
- **Antes de aplicar:** conferir (leitura) que o Gustavo está como `gestor` ativo e com o mesmo e-mail do login. Depois de aplicar,
  definir o responsável padrão de cada etapa no Time e tocar em "Aplicar aos pedidos de hoje"; criar o acesso de cada colaboradora.
  `rodada3-time.spec.mjs` (papéis suspensos) saiu; `time-acesso.spec.mjs` o substitui.

## Fase 1: Embalagem e frete juntas, chave da nota e termômetro de tempo (19/11/2026) — **aplicada em 19/11 com o "sim" do Gustavo**

Primeira de quatro fases (1 Rápidas, 2 Logins, 3 Erros, 4 Indicadores). As três migrations abaixo foram aplicadas no Supabase em
19/11/2026 com o "sim" do Gustavo; conferido: nenhum pedido ficou em `frete`, 7 metas gravadas, `authenticated` lê `termometro`.

- **Embalagem e frete (`20261125130000_embalagem_e_frete.sql`):** etapa única, status `embalagem`, nome "Embalagem e frete". Dois
  passos com botão próprio, "Embalado" e "Frete gerado", em qualquer ordem; o pedido só vai para a Postagem com `embalado_em` E
  `frete_gerado_em` (gatilho `tg_pedidos_antes`). `avancar_pecas` pula direto de embalagem a Postagem quando os dois já estavam
  feitos; `mover_etapa`, `regras_etapas`, `reavaliar_etapa`, `reiniciar_pedido` e `designar` perderam o `frete`. Os pedidos que
  estavam em `frete` voltam para `embalagem` (a embalagem já feita fica marcada, só falta o frete) e o responsável do Frete passa
  para a Embalagem e frete se esta estava vazia; `status_desde` e histórico não mudam. `frete` continua aceito no CHECK de status
  só por causa dos eventos antigos. `v_producao_pessoa` não mudou (a lista de etapas com `frete` conta o histórico antigo e o salto
  embalagem → Postagem). Teste: `tests/banco/embalagem-frete.test.mjs` (inclui a migração dos pedidos em Frete).
- **Chave de acesso da nota (`20261125140000_nf_chave.sql`):** `pedidos.nf_chave`, só 44 dígitos, opcional; `v_pedidos` e
  `v_pedidos_operacao` ganham a coluna no fim. Na Nota fiscal o campo aceita colar com espaços e pontos, mostra em grupos de 4 e
  avisa "Faltam/Sobram N números" (não grava com tamanho errado). No bloco Frete, linha "Chave da nota" com Copiar (só os números)
  e dentro do "Copiar tudo". Testes: `tests/unidade/chaveNota.test.ts`, `tests/banco/nf-chave.test.mjs`.
- **Tempo na etapa e termômetro (`20261125150000_metas_etapa.sql`):** tabela `metas_etapa` (horas úteis; padrões separação 2,
  conferência 1, bipagem 1, nota 2, embalagem e frete 2, postagem 4, enviar rastreio 2; todos leem, edita quem passa em
  `sou_gestor()`, sem DELETE). `v_pedidos_operacao` ganha `horas_na_etapa` e `termometro` (verde até a meta, amarelo até o
  dobro, vermelho acima; nulo fora da esteira e em Avisar/Aguardando cliente); a conta está em `termometro_etapa(status, horas)`.
  O cartão da Expedição mostra "Nesta etapa há X" em todas as etapas, com ponto e traço de 1,5 px na cor; a lista da Expedição
  relê a cada 60 s. Time ganhou "Metas de tempo por etapa". Teste: `tests/banco/termometro.test.mjs`.
- **Compatibilidade enquanto o banco não tem a migration:** a tela trata o status antigo `frete` como Embalagem e frete (passo e
  coluna da Expedição), então publicar o app antes do `db push` não deixa pedido sem painel. As cores do termômetro, a chave e as
  metas só aparecem depois da migration (a tela esconde as metas e ignora a cor se o banco ainda não tem as colunas).
- Falha que já existia antes desta fase: `acessibilidade.spec.mjs` (tema claro, tela `troca`, contraste 4,08 num Badge vermelho;
  falha também no HEAD anterior). Não mexida aqui.
- Telas testadas: `tests/e2e/embalagem-frete.spec.mjs` (chave, ordem livre, termômetro, metas); `esteira-ponta-a-ponta`, `fluxos`,
  `celular-largura`, `rodada3-pedido` e os de banco foram ajustados à etapa única.

## Troca fantasma e devolução na Conferência (18/11/2026)

- **Troca fantasma (V112):** concluir a troca com a janela aberta criava uma troca nova vazia, invisível, que travava o
  "Concluir etapa" ("Há uma troca em andamento"). Corrigido na tela e no banco (`garantir_troca` só aceita peça em falta);
  as fantasmas (W0023, W0014, ARV-1281, ARV-1280) são canceladas pela migration.
- **Acerto na hora certa (V113):** "A devolver"/acerto pendente só segura o pedido antes da **Embalagem** (como o avanço
  automático). O botão **Devolvido** fica no cartão "A devolver" do pedido, a partir da Nota fiscal.
- Migration `20261124120000_troca_fantasma.sql`, teste `tests/banco/troca-fantasma.test.mjs`. **Aplicada em 18/11 com o "sim" do
  Gustavo.**

## Troca para a cliente 40+, "Pago pela cliente" e mensagem sem link estruturada (18/11/2026)

- **Página da troca (`/t/...`):** opção do **mesmo modelo** sai sem código e sem preço quando o valor é igual: frase grande
  "Mesmo modelo, outro tamanho", foto maior, "Toque no tamanho que você quer:" e tamanhos em botões grandes. Valor só
  quando muda ("Custa R$ 20,00 a mais" / "Custa menos: sobram R$ 10,00 de crédito"). Mesmo modelo e mesmo valor vem
  primeiro. A peça que faltou mostra o tamanho ("Tamanho N°18") e o nome, sem código. Teste `troca-tamanhos.spec.mjs`;
  imagens de `visual.spec.mjs` atualizadas.
- **Dados do pedido:** "Pago após acertos" virou **"Pago pela cliente"**; quando peças saem depois do pagamento aparece
  **"A devolver à cliente"** (valor de `v_pedidos.a_devolver`) com o porquê. Caso real: W0023 (pagou R$ 905,98, total
  atual R$ 801,57, a devolver R$ 104,41). Teste `dados-devolver.spec.mjs`.
- **"Copiar mensagem" sem troca montada:** agora segue a estrutura da mensagem aprovada (saudação do time da expedição,
  peças em falta em lista e três saídas numeradas). Teste em `tests/unidade/trocaTexto.test.ts`.

## Romaneio em qualquer etapa (18/11/2026)

No "⋯" do pedido (logo abaixo de "Concluir pedido"): **Copiar link do romaneio** e **Enviar romaneio no WhatsApp** (abre o
WhatsApp da cliente com a mensagem pronta, `mensagemRomaneio` em `src/lib/agente.ts`). Vale na esteira, nos concluídos e
no arquivo; a página `/r/:token` já funcionava em qualquer etapa. Só interface. Teste `tests/e2e/romaneio-etapas.spec.mjs`.

## Reembolso ou crédito direto no "Avise a cliente" (18/11/2026)

Cada peça em falta ganhou o botão **"Reembolso ou crédito"** no próprio cartão (celular: linha de baixo; PC: ao lado de
Trocar), sem precisar montar nem enviar a troca. Por trás usa o caminho que já existia: `garantir_troca` (rascunho com todas
as faltas) e `troca_aprovar` com crédito; o destino (reembolsar ou guardar) é registrado na hora quando a troca toda fica
resolvida, senão vai para o "Acerto do pedido". Some quando a peça já tem escolha. Só interface, sem migration.
Testes em `tests/e2e/troca-reembolso.spec.mjs`.

## Pedido LR com check e peças com nota separadas; fotos da falta na frente (18/11/2026)

- **Pedido de venda LR** (etapa Nota fiscal): cada linha tem um check; copiar o código, a quantidade ou "Copiar SKUs" marca
  sozinho, tocar desmarca. Fica guardado no aparelho, por pedido (não vai para o banco). Peças **com nota** ficam num bloco
  separado (foto, código, variante, recado, copiar e check próprios) e **não entram** na lista nem no "Copiar SKUs".
  Teste `tests/e2e/nota-peca.spec.mjs`. Publicado (não depende do banco).
- **Cartão da Expedição:** as fotos das peças em falta vêm primeiro (útil no Avisar cliente). Migration
  `20261124110000_fotos_falta_primeiro.sql` (só muda a ordem das fotos em `v_pedidos_operacao`), teste
  `tests/banco/fotos-falta.test.mjs`. **Aplicada em 18/11 com o "sim" do Gustavo.**

## Papéis suspensos (18/11/2026) — **aplicado em 18/11 com o "sim" do Gustavo**

Pedido do Gustavo: por enquanto todos podem fazer tudo. `20261124100000_papeis_suspensos.sql` faz `sou_gestor()` valer para
qualquer login e tira o gatilho do "último gestor"; a tela do Time mostra Adicionar, Editar, Desativar e Excluir para todo
mundo, sem seletor nem selo de Papel. A coluna `equipe.papel` fica guardada para quando os papéis voltarem. Testes:
`tests/banco/time.test.mjs` (papéis suspensos) e `tests/e2e/rodada3-time.spec.mjs`. Aplicado e publicado.

## Peças repetidas em etapas avançadas (18/11/2026) — **aplicado em 18/11 com o "sim" do Gustavo**

Caixa **"Incluir pedidos em etapas avançadas"** em Peças repetidas: soma os pedidos que já passaram da separação
(Conferência até Enviar rastreio, mais Avisar/Aguardando cliente), contando peça pendente ou já encontrada; **concluídos,
cancelados, perdidos e somados nunca entram**; peça em falta ou removida não conta. Cada pedido mostra a etapa em que está.
A escolha fica guardada no aparelho. Migration `20261124090000_repetidas_avancadas.sql` (função `pecas_repetidas` ganha
`p_avancadas`, padrão desligado; a view do selo continua igual). **A tela de sempre funciona sem a migration; só a caixa
depende dela.** Testes: `tests/banco/repetidas.test.mjs` e a tela "opção inclui pedidos em etapas avançadas" em `fluxos.spec.mjs`.

## Rodada 3 (18/11/2026): página do pedido, troca, rastreio, permissões e Clube — **migration aplicada em 18/11 e app publicado**

16 pedidos do Gustavo ao usar o app. Tudo o que mexe no banco está em **uma migration só**,
`supabase/migrations/20261123090000_rodada3.sql`, escrita e testada em banco descartável, **sem dry-run nem aplicação remota**.
IDs V100–V111 em [`VISTORIA.md`](VISTORIA.md). **O app desta rodada depende da migration (função `encontrar_peca`, status
`enviar_rastreio`, `equipe.papel`, `clube_modelos`): só publicar (`git push`) depois de aplicar.** Os commits estão só locais.

- **Página do pedido:** seta do "Voltar" alinhada; nome, número, linha de etapas, busca e **responsável ao lado da busca** ficam
  presos no topo ao rolar (o menu "⋯" e o voltar rolam); aviso "A próxima etapa é de Fulana. Avise Fulana."; **Encontrada** no
  menu "Resolver" da peça em falta (tira a peça da troca aberta); quantidade pode ser **digitada**; o link de rastreio saiu do
  Frete e foi para a **Postagem**.
- **Vendas e troca:** venda marcada como paga **continua em Vendas** (aviso com "Abrir pedido"); copiar a mensagem/link da troca
  **não** muda mais o pedido, só "Cliente avisada" leva a "Aguardando cliente".
- **Enviar rastreio (WhatsApp):** nova etapa laranja entre Postagem e Concluído (coluna na Expedição, selo e aviso na barra
  lateral). Pedido da Shopify não tem a etapa. **Concluídos** ficou só com A caminho e Entregues, com cartão novo.
  Pedido do WhatsApp já concluído **sem** mensagem e sem entrega volta para Enviar rastreio quando a migration for aplicada.
- **Permissões (Time):** `gestor` e `funcionaria`. Só o gestor adiciona, edita, desativa, exclui e muda papel; a funcionária só
  vê a lista. O time não fica sem gestor. Dois gestores previstos: o Gustavo e mais uma pessoa (ele promove pela tela).
- **Clube:** produto "pai" com variantes (código sugerido BASE-SUFIXO, preço opcional), cartão agrupado no Clube e na busca da
  venda, edição do produto inteiro e **Adicionar em massa** (várias fotos, até 3 subindo juntas, uma linha por foto, salva tudo
  numa chamada só).
- **Testes:** `tests/banco/rodada3.test.mjs`, `clube-modelos.test.mjs`, `time.test.mjs` (V109), unidade (`quemAvisar`, `quantidade`,
  `clubeModelos`, etapas por origem) e telas `rodada3-pedido`, `rodada3-rastreio`, `rodada3-time`, `rodada3-clube`. O simulador
  agora manda o e-mail do login nas claims (como o PostgREST). Capturas em `capturas/` (claro e escuro, 390 e 1280).
- **Aplicado em 18/11 com o "sim" do Gustavo:** dry-run e `db push --yes` da `20261123090000_rodada3.sql`; o Gustavo
  entrou no Time como **Gustavo (gestor)**, ligado ao único login existente (Sabrina, Larissa, Ari, Mel e Levatti seguem
  funcionárias, ainda sem e-mail de login); nenhum pedido do WhatsApp estava concluído sem mensagem. Tipos regenerados,
  `baseAplicada = 20261123090000`; app publicado pelo `git push`.
- **Próxima ação (Gustavo):** promover a segunda pessoa a gestora em Time; criar os logins das funcionárias e pôr o e-mail
  de cada uma no Time; passar um pedido do WhatsApp de teste até Enviar rastreio.
- **Limites honestos:** o disparo no relógio (`pg_cron`) e o Storage real não são exercidos nos testes (o envio de fotos usa uma
  resposta fictícia); o ajuste dos pedidos antigos para Enviar rastreio foi testado em banco descartável, não nos dados reais.
  Se houver muitos pedidos antigos do WhatsApp sem mensagem registrada, todos aparecerão na coluna nova: conferir depois de aplicar.

## Rodada 2: celular de verdade, nota no LR, barra de etapa, fila, detalhe da peça, etiquetas e Shopify automática (17/11/2026)

Relato do Gustavo no celular: ao marcar "Achei" a faixa das peças feitas alargava a página (zoom para fora, arrastar para o
lado, janelas e menus fora do lugar); o mesmo em "Peças do pedido" da Nota fiscal; botão do LR cortado; Nota e Feedback
quebravam ao tocar no campo. IDs V90–V99 em [`VISTORIA.md`](VISTORIA.md).

- **Celular 100%:** o teste antigo não via o problema (projeto sem `isMobile`/`hasTouch`). Novo projeto Playwright
  **`celular-toque`** e teste `celular-largura.spec.mjs` (falhou antes: scrollWidth 747 > 390, culpado = linha da faixa das peças
  feitas, `grid` sem coluna definida; Nota fiscal 610; seta do LR cortada). Corrigido na origem (colunas `minmax(0,1fr)` e
  `min-w-0`), mais `overflow-x: clip` no conteúdo. Janelas com campo de texto (Nota, Feedback) viram janela presa no topo no
  celular (sem gaveta que o teclado cobre).
- **Pedido LR:** bloco "Peças com nota". **Arrastar a esteira** com o mouse. **Barra inferior** (‹ anterior, **Concluir etapa**
  com confirmação, próxima ›) e aviso "Etapa X concluída → agora Y" em todo avanço (também para quem está com outra tela aberta).
- **Fila × separando:** "Começar separação"; "Na fila há…" / "Separando há…" no pedido e nos cartões; as métricas já separavam.
- **Detalhe da peça:** tocar na foto mostra código, nome, variante, quantidade, **preço (só ali)**, nota e quantas faltam.
- **Etiquetas:** uma por código e variante (não por unidade) e "Imprimir etiqueta" no "⋯" da peça.
- **Shopify de hora em hora:** migration `20261122190000_shopify_automatica.sql` **aplicada em 18/11** com o "sim" do Gustavo
  (dry-run antes; `baseAplicada = 20261122190000`). Remoto conferido: `pg_net` instalado, job `shopify-sync` ativo em
  `0 * * * *`, função sem permissão para os papéis do app. **Falta:** o Gustavo gravar `cron_secret` no Vault pelo painel
  (`PASSO-A-PASSO.md`, Parte 5, passo 6); até lá cada hora só deixa um aviso no log, sem chamar nada.
- **Limite honesto:** o banco de teste (PGlite) não tem `pg_cron`, `pg_net` nem Vault (simulados); a chamada real à Edge e o
  disparo no relógio só se confirmam depois de aplicar e gravar o segredo.
- **Próxima ação:** revisar, aplicar a migration da Shopify (com o "sim"), regenerar tipos (`baseAplicada`), o Gustavo grava o
  segredo no Vault e confere uma hora cheia nos logs; ele passa um pedido de teste no celular de verdade.

## Esteira leve, peça a peça, Concluídos e teste de ponta a ponta (17/11/2026) — migration aplicada e app publicado em 17/11

Resposta ao incidente em que o Gustavo não conseguia levar um pedido do começo ao fim (erro de banco e pedido
voltando de etapa). O banco é pequeno; o peso era o trabalho por clique. Migration
**`20261122180000_esteira_leve.sql`** (**aplicada em 17/11** com o "aplica" do Gustavo, após dry-run; `baseAplicada = 20261122180000`; `20261122170000_operacao_leve.sql`,
que já estava aplicada, ficou como está; a view `v_pedidos_operacao` foi recriada na nova). Detalhes e IDs
V81–V89 em [`VISTORIA.md`](VISTORIA.md).

- **Nova esteira:** Separação (com **Imprimir todas as etiquetas** no topo) → Conferência (confira e cole a etiqueta)
  → Bipagem → Nota fiscal → Embalagem → Frete → Postagem → **Concluído**. A etapa Etiquetagem não existe mais
  (os 2 pedidos que estavam nela vão para a Bipagem; conferida vale como etiquetada).
- **Cada peça anda sozinha:** "Achei" leva a peça para a Conferência, "Conferida" para a Bipagem. O pedido fica na
  etapa da peça mais atrasada e **avança sozinho** quando todas terminam (também Nota+LR → Embalagem, Embalado →
  Frete, Frete gerado → Postagem, Postado → Concluído). A linha de etapas mostra quantas peças há em cada uma.
- **Gravação em lote** (`marcar_pecas`): o clique muda a tela na hora; as marcas vão juntas a cada ~400 ms, uma
  requisição em voo por pedido, valores absolutos (repetir é seguro), resposta direto para o cache, eco do
  Broadcast da própria aba ignorado. Nada de histórico clique a clique.
- **Mover de etapa / Concluir pedido:** menu do pedido e clique direito, com diálogo explicando o que será marcado
  como feito (para frente) ou zerado (para trás). O banco recusa com troca em andamento, acerto pendente ou falta.
- **Concluídos** (`/concluidos`): abas Enviar rastreio (WhatsApp), A caminho, Entregues; "Marcar entregue".
  O Arquivo fica com cancelados e perdidas (somadas continuam só dentro do pedido principal, como em V72).
- **Frete sem peso** (coluna `frete_peso_g` fica, sem uso); um botão por etapa; link de rastreio só no Frete.
  Pedido concluído à mão (sem passar pelo Frete) mostra o campo do link no próprio pedido concluído.
- **LR:** botão copiar por peça (código e quantidade). **Faltas:** cartão maior, foto maior, código, variante,
  quantidade, nota e "em falta há…", com as ações à vista. **Time:** "Excluir" de verdade (sai da lista e dos pedidos).
- **Métricas decididas (guardadas):** prazo/atraso, produção por pessoa (`v_producao_pessoa`: pedidos e peças por dia
  e etapa, quem concluiu), mudanças depois de pago (retirada, falta, quantidade, preço) e tempo por etapa do pedido
  (`v_tempo_etapas`). Não guardamos mais achei/conferida/bipada (eventos antigos apagados pela migration).
- **Celular:** nenhuma rolagem lateral a 390 px nas telas; campos com 16 px (sem zoom ao tocar). Aba aberta com
  versão antiga recarrega sozinha quando volta a aparecer, sem nada sendo salvo.
- **Testes:** `tests/e2e/esteira-ponta-a-ponta.spec.mjs` (principal: esteira inteira com cliques em rajada, dinheiro
  igual ao do pagamento em cada etapa, status nunca volta, nenhum aviso de erro, uma requisição em voo, sem rolagem
  lateral; variantes Shopify, tempo limite no meio, duas telas com Broadcast, Concluir pedido e voltar etapa),
  `tests/banco/esteira.test.mjs`, `tests/unidade/lotePecas.test.ts`, `time-celular.spec.mjs`.
  A conservação do dinheiro ganhou marcas em lote e `mover_etapa`.
- **Limite honesto:** o simulador atende uma requisição por vez. Mede correção e quantidade de requisições, não a
  capacidade do Supabase. A prova real é o Gustavo passar um pedido de teste no app publicado.
- **Próxima ação:** Gustavo passa um pedido de teste completo no app publicado (de Separação a Concluído);
  depois, leitura remota dos logs (só leitura) para confirmar que não há mais `57014`.

## Cliques rápidos e bipagem (17/11/2026) — banco aplicado, app preparado para publicação

Investigação do relato na bipagem do ARV-1287 e de “Achei”/“Conferida” em sequência: CLI conectado;
777 ocorrências de timeout nos logs coletados de hoje, com 4 em `bipar` e 565 em leituras da `v_pedidos`.
Detalhes, limites da evidência e plano de validação em
[`DIAGNOSTICO-PECAS-2026-11-17.md`](DIAGNOSTICO-PECAS-2026-11-17.md).

Correções V75–V78: reconciliação só depois da fila, proteção contra refoco trazendo peças antigas,
releituras agrupadas após 600 ms, retry único de timeout confirmado (nunca de resposta de bipagem
perdida), contagem de vendas abertas pela tabela e gatilho que evita reavaliar retorno a cada avanço.
Mudança de etapa não prossegue se o limite de espera acabar com peças ainda na fila.

Migration **`20261122160000_progresso_pecas_leve.sql` aplicada em 17/11**, após dry-run e autorização
“aplica” do Gustavo para banco e publicação. Consulta remota confirmou a otimização e as permissões
preservadas. Tipos regenerados; `baseAplicada = 20261122160000`. Publicação automática pelo push desta
entrega na main; conferir a versão servida após o build do Cloudflare. Nenhum pedido ou plano alterado.

**Validação concluída:** 174 testes de unidade, 232 de banco e 152 de tela passaram (558); tipos,
conferência de migrations locais, build e diff limpo. Nenhuma falha nova; permanece um aviso de lint
preexistente em `ErrorBoundary.tsx`.

**Banco zerado em 16/11/2026** (com o "sim" do Gustavo, `scripts/zerar-testes.sql`): 0 pedidos, peças, trocas,
eventos e movimentos; numeração do WhatsApp volta a W0001. Mantidos: catálogo (2051), Clube (2), feriados (195).
Próximo passo (Gustavo): Sincronizar com a Shopify; entra a partir da data gravada em `SHOPIFY_IMPORTAR_DESDE`.

## Pagamento imediato, Arquivo sem somadas e correção do frete (17/11/2026) — local, aguarda autorização

Retomada dos quatro pontos deixados pelo Claude. Migration **aplicada em 17/11 com o "sim" do Gustavo** (dry-run antes; `baseAplicada = 20261122150000`):
`20261122150000_venda_completa_frete.sql`. Nenhuma escrita remota, publicação ou alteração na W0006 nesta retomada.

- **Marcar como pago:** a janela abre sem aguardar a fila de gravações. Mostra “Recalculando…” e só libera
  a confirmação depois de salvar os dados pendentes e ler o total do banco. Falha na leitura bloqueia a
  confirmação e oferece “Tentar recalcular”; nunca usa o total antigo como reserva. A mudança da forma de
  pagamento não faz mais uma leitura redundante do total. Respostas antigas de outra forma não sobrescrevem
  a janela nem o resumo da venda.
- **Arquivo:** a consulta exclui `status = somada` antes de limitar/paginar, inclusive na busca. A venda
  continua guardada e visível no pedido principal e no romaneio público.
- **Dados obrigatórios:** WhatsApp exige nome, telefone com DDD, CPF/CNPJ, tipo de frete, quem paga e valor
  positivo quando a cliente paga pelo envio; endereço completo, exceto Retirada. A tela lista as faltas e
  destaca campos. SQL `faltas_para_pagar` valida a saída de venda para a esteira; Shopify e `somar_venda`
  permanecem fora. `src/lib/faltasPagar.ts` é conferido contra o SQL nos testes.
- **Editar frete:** pedidos pagos do WhatsApp na expedição ganham “Quem paga o frete” e “Frete que a cliente
  pagou”. RPC `corrigir_frete_pedido` ajusta `valor_pago` pela diferença e preserva saldo, devolução e acerto.
  Cliente/endereço/tipo/custo acompanham a correção na mesma transação; falha desfaz tudo. O histórico é
  gravado no banco. Custo da Frenet continua separado. Shopify, Arquivo, somadas, excluídas e pagamentos
  desconhecidos recusam a correção financeira. Repetir a mesma correção não duplica o pagamento.
- **Testes:** V71–V74 em `VISTORIA.md`; casos de banco para cadastro, permissões, saldo, Pix, descontos,
  somadas e rollback; conservação aleatória agora inclui correção do frete. Capturas fictícias por
  `npm run capturas -- --simulado`, sem login real.

**Verificação:** `npm test` passou com 166 testes de unidade, 231 de banco e 142 de tela (539), tipos e build.
Após reforçar o bloqueio de respostas antigas também no resumo, foram reconferidos os fluxos de venda,
pagamento e edição do frete, além de tipos, unidade e build. O teste com resultado antigo de Cartão chegando
depois do Pix passou em celular/PC. Capturas revisadas nos dois tamanhos; `git diff --check` limpo. Permanece
um aviso de lint preexistente em `ErrorBoundary.tsx` (`no-did-update-set-state`), sem avisos novos.

**Próxima ação:** com o “sim” do Gustavo, conferir `npx supabase db push --remote --dry-run`, aplicar somente
a migration nova com `--yes`, regenerar os tipos remotos/locais e então publicar por `git push`. A W0006 pode
ser corrigida pelo novo “Editar” após a publicação, com o frete efetivamente pago informado pelo Gustavo.

## Nova esteira com etapa Frete e Time Arvenne (17/11/2026) — migration aplicada em 17/11 com o "sim" do Gustavo

Migration `20261122140000_frete_e_time.sql` já aplicada; tipos remotos regenerados e `baseAplicada` atualizada
no commit `078946a`. A autorização pendente agora é a de venda completa e correção do frete, descrita acima.

- **Esteira nova:** Separação → Conferência → Etiquetagem → Bipagem → **Nota fiscal** → Embalagem → **Frete** →
  Postagem → Enviado (9 etapas). A etapa antes chamada "Nota e frete" (status `faturamento`) agora é só
  **Nota fiscal** (nota + pedido LR do fornecedor). A **Embalagem** não pede mais a etiqueta de envio (lista:
  caixa do tamanho certo, nota impressa dentro, caixa fechada).
- **Frete (status `frete`):** vem depois da Embalagem, porque o frete só pode ser gerado com a caixa fechada
  e pesada. Guarda o **peso da caixa em gramas** (`pedidos.frete_peso_g`, 1 a 30000); "Frete gerado" fica
  desabilitado sem peso, "Concluir frete" exige frete gerado. Regras no banco: embalagem/frete/postagem exigem
  nota e LR; frete exige embalado; postagem exige frete gerado. Reabrir trabalho volta uma etapa de cada vez
  (`reavaliar_etapa`); reiniciar o Frete limpa frete gerado e peso; reiniciar a Nota fiscal limpa só nota e LR.
  Shopify "despachado" só move para Enviado a partir do Frete já gerado ou da Postagem (antes disso, só alerta).
  Endereço: nada novo (continua o "Editar" do cartão Cliente e valores).
- **Time Arvenne:** página **Time** (`/time`): nome + e-mail opcional do login, desativar/reativar (nada é
  apagado; `equipe` sem DELETE). Em cada pedido, a linha "Etapa: [avatar] Nome" abaixo do número abre
  "Quem faz cada etapa" (8 etapas de trabalho); grava na hora pela função `designar` (evento `designado`).
  Na Expedição: avatar do responsável da etapa atual no cartão/linha e filtro por pessoa (Todos, Comigo, cada
  pessoa, Sem responsável; `?pessoa=` na URL, filtrado no navegador). `pedidos.responsaveis` (jsonb) e
  `frete_peso_g` saem pela `v_pedidos` (colunas no fim, nenhum join novo); o tempo real avisa `equipe`.
- **Migration `20261122140000_frete_e_time.sql`** (recria as funções da esteira a partir da última versão de
  cada uma, com `frete` entre `embalagem` e `pronto_envio`): `pedidos_status_check`, `etapa_antes_desvio`,
  `regras_etapas`, `reavaliar_etapa`, `tg_pedidos_antes`, `alterar_item`, `marcar_falta`, `substituir_item`,
  `somar_venda`, `listar_inconsistencias`, `tg_etapa_antes_desvio`, `sair_do_desvio`, `reiniciar_pedido`,
  `importar_pedido_shopify`, `tg_pedidos_depois` (peso no evento) e `v_pedidos`; mais `equipe`, `designar`,
  evento `designado`. Nenhum pedido está em embalagem/pronto_envio no banco hoje: nada a converter.
- **Testes:** `tests/banco/time.test.mjs` (novo), `etapas`, `maquina-estados`, `shopify`, `permissoes`,
  `tests/unidade/etapas.test.ts`, `tempoReal.test.ts`, e2e `fluxos` (etapa Frete com peso; time) e
  `editar-dados`.
- **Depois da migration aplicada:** cadastrar o time em **Time** com o mesmo e-mail do login de cada pessoa
  (`PASSO-A-PASSO.md`).

## Histórico só do essencial e "Editar" nos dados do pedido (17/11/2026)

- **Histórico:** venda em aberto/aguardando pagamento não registra eventos de peça (quantidade, preço, retirada);
  depois de marcada como paga, registra tudo. Etapas, status e pagamento sempre. "Peças trocadas e removidas"
  só conta quantidade reduzida depois de **marcar** como paga, na venda onde a mudança aconteceu (antes, ajustes
  da montagem de uma venda somada apareciam no pedido principal, como no ARV-1284/W0004). A migration
  `20261122130000_historico_essencial.sql` (aplicada em 17/11, "sim" do Gustavo; `baseAplicada = 20261122130000`) apagou esse ruído antigo (38 eventos: W0001 e W0004).
- **Editar dados do pedido:** botão "Editar" no cartão "Cliente e valores": cliente, endereço e frete (tipo e
  custo real). O que a cliente pagou não muda; com custo maior, aparece "Arvenne paga a diferença do frete"
  (`v_pedidos.frete_diferenca`) e a troca do frete vai para o histórico como nota.

## Continuar no Free: tempo real leve, contagem leve e cópia semanal (17/11/2026)

Decisão do Gustavo: ficar no plano Free (Nano). Para aliviar o banco:
- **Tempo real por Broadcast:** gatilhos por comando em `pedidos`, `pedido_itens`, `trocas`, `troca_pecas` e
  `troca_opcoes` mandam `{t: tabela, p: [pedidos]}` no canal privado `pedidos` (`realtime.send`); política
  `equipe_recebe_pedidos` em `realtime.messages` (só `authenticated`). As tabelas saíram da publicação
  `supabase_realtime` (fim do `postgres_changes`). App: `src/lib/tempoReal.ts`.
- **Selo de Repetidas:** função `contagem_repetidas()` (só conta, sem prazo de cada peça).
- Migration `20261122120000_tempo_real_leve.sql` **aplicada** em 17/11 (dry-run antes; "sim" do Gustavo); `baseAplicada = 20261122120000`. Testes: `tests/banco/tempo-real.test.mjs` (o banco de teste
  simula só a infraestrutura `realtime.send`/`realtime.messages`).
- **Cópia semanal:** `.github/workflows/backup.yml` (pg_dump do schema public, cifrado, 90 dias como artefato).
  Falta o Gustavo gravar `SUPABASE_DB_URL` e `BACKUP_SENHA` no GitHub (roteiro em `PASSO-A-PASSO.md`).

## Banco sobrecarregado em 17/11 (10:40–10:52) e alívio no app

Logs do Postgres (Management API, só leitura): 37 `57014` (tempo limite de 8 s) em leituras da `v_pedidos` e
58 `25P02` ("current transaction is aborted") logo depois, todos do PostgREST. Fora do pico as mesmas consultas
levam 5–60 ms. Maior consumo acumulado: Realtime `postgres_changes` (202 mil leituras do WAL, 1.481 s),
`v_pecas_em_varios_pedidos` (selo da barra, 1.883 chamadas × 208 ms), `alterar_item` e `troca_painel`. Projeto
**sem compute add-on (Nano)**. ARV-1280 não voltou de etapa: a Expedição mostrava a lista antiga porque a leitura
falhou. No app: aba escondida não recarrega pelo tempo real (recarrega ao voltar), espera 1,2 s para juntar
eventos, selo de Repetidas a cada 2 min, busca de "Somar a um pedido" só com as colunas usadas (~4× mais leve) e
"Pago" lê só os valores. Próximos passos sugeridos: subir para **Micro** (painel, ~US$ 10/mês) e trocar o tempo
real de `postgres_changes` por Broadcast.

## Venda mais rápida ao mudar quantidade e preço (17/11/2026, só app)

V70: o preço digitado não vai mais para o fim do valor antigo ("40" virava "5040"); cliques seguidos no "+" gravam
só a última quantidade; depois de gravar, só os valores (`v_pedidos`) voltam do banco, e o Total mostra um
indicador enquanto recalcula. O preço da linha já era só desta venda (não muda o catálogo nem o Clube).

## Busca de peça nas etapas e "Reembolso ou crédito" na troca (17/11/2026, só app)

- **Busca de peça:** campo "Buscar peça" em Separação, Conferência e Etiquetagem (e no cartão de falta): filtra
  cartões, peças feitas e removidas por código (com ou sem hífen), nome, variante ou nota, sem acento. Só esconde:
  progresso e "concluir etapa" continuam contando o pedido inteiro (`src/lib/buscaPeca.ts`, contexto em
  `PainelEtapa`).
- **Troca:** botão "Reembolso ou crédito" logo abaixo da peça na janela da troca (antes "Dar crédito" só no painel
  de opções, recolhido no celular). A confirmação já pergunta o destino: **Reembolsar** ou **Guardar para o próximo
  pedido**. Com a troca toda resolvida, o app registra o destino na hora (`registrar_credito`, valor do banco); com
  outras peças ainda abertas, o destino fica para o cartão "Acerto do pedido". Mesmo botão nas faltas (Problemas).

## Nota na peça (17/11/2026)

Menu "…" das peças (separação, conferência, etiquetagem, faltas) ganhou **Nota** ("Editar nota" quando já tem):
recado sobre a peça (ex.: "peça de montagem: temos, falta montar") que aparece no cartão em todas as etapas.
`pedido_itens.nota` + função `anotar_item` (vazio apaga; cada mudança fica em `pedido_eventos`). Migration
`20261122110000_nota_peca.sql` **aplicada** em 17/11 com o "sim" do Gustavo (dry-run antes); tipos regenerados,
`baseAplicada = 20261122110000`.

## Excluir e duplicar pedidos (17/11/2026)

- **Clique direito (ou toque longo)** no cartão em Vendas e no Arquivo: "Duplicar venda" (WhatsApp: nova venda em
  aberto com a mesma cliente, endereço, frete, desconto e peças vivas) e "Excluir venda/pedido".
- **Excluir não apaga** (decisão do Gustavo: "some de tudo"): marca `pedidos.excluido_em`; a RLS restritiva
  `nao_excluido` esconde de todas as telas, buscas e views, e `romaneio_publico` não abre mais o link. Pode: venda
  do WhatsApp não paga ou pedido do Arquivo (enviado, cancelado, perdida). Não pode: somada (vai junto com o
  principal), pedido na esteira, com troca, movimento financeiro ou crédito da cliente.
- **V69:** a separação não mostra mais em "Removidas" as peças tiradas durante a montagem da venda.
- Migration `20261122100000_excluir_duplicar.sql` (`excluir_pedido`, `duplicar_venda`) **aplicada** em 17/11 com o "sim"
  do Gustavo, após dry-run; tipos regenerados, `baseAplicada = 20261122100000`.

## CPF do cadastro da Shopify na venda (17/11/2026)

V68: a busca de cliente na venda passa a trazer o CPF/CNPJ do metacampo do cadastro da Shopify (antes só do último
pedido). Função Edge `shopify-clientes` **publicada** em 17/11 com o "sim" do Gustavo.

## Venda reorganizada, página da cliente com carrossel e Clube editável (16/11/2026)

- **Contorno:** 1,5 px (`--traco`) só nos contornos coloridos (verde, amarelo, vermelho); cinza volta ao 1 px do shadcn.
- **Venda:** situação no topo numa lista (Em aberto, Aguardando pagamento, Pago…, Perdida…, com ícones lucide), no lugar
  dos botões do resumo. Cliente no topo (nome e telefone à vista; documento, e-mail e endereço recolhidos com
  resumo), depois o cartão Peças com "Adicionar peça" e "Colar carrinho" em cima e as peças numa caixa com
  rolagem própria.
- **Clube:** "Editar" nos cartões do Clube (em Adicionar peça e na página Clube). Variante em linhas (17/11):
  "Adicionar variante" soma quantas quiser (tamanho, cor, outra); grava no formato do site, em maiúsculas e tamanho por
  último ("VERDE / N°20"). Só texto, sem mudança no banco.
- **Página da cliente (`/r/...`):** cabeçalho Arvenne fixo; peças em cartões com foto grande; tocar no cartão abre
  o carrossel (foto, código, variante, quantidade, valor unitário e total da peça; arrasta para o lado ou setas no
  PC); resumo preso no rodapé (total sempre, detalhes ao tocar ou no fim da página).
- **Foto ampliada:** abre no tamanho final com a miniatura na hora; não aparece mais o quadro vazio com o X.
- Migration `20261121130000_romaneio_total_peca.sql` (total de cada peça no romaneio, calculado no banco)
  **aplicada** em 17/11 com o "sim" do Gustavo; tipos regenerados, `baseAplicada = 20261121130000`.

## Feedback da peça, venda por origem e ajustes visuais (16/11/2026)

- **Feedback da peça:** menu "…" das peças (separação, conferência, etiquetagem, faltas) tem "Feedback": campo
  de texto sobre aquela peça (foto diferente, código que não bate). Aparece na página Feedbacks com foto e código.
- **Venda:** peças do carrinho colado ("Do carrinho da cliente") separadas das adicionadas à mão; variante ao lado
  do código; no PC, preço e quantidade à direita (linha mais baixa, foto alinhada). Mesma peça no carrinho e à mão
  fica em duas linhas, uma em cada grupo (valores iguais).
- **V66:** sem animação dos blocos ao marcar peça (engasgava). **V67:** seletor − 1 + com um traço só nas junções.
- Migrations `20261121110000_feedback_peca.sql` e `20261121120000_entrada_pecas_venda.sql` **aplicadas** (16/11, com o "sim"
  do Gustavo, após dry-run); tipos regenerados, `baseAplicada = 20261121120000`.

## Esteira sem "voltar" de etapa (16/11/2026, só app)

V60 a V63 em [`VISTORIA.md`](VISTORIA.md): confirmar a próxima etapa com peça ainda gravando não volta mais
para a etapa anterior; o diálogo da próxima etapa abre sempre que a etapa atual está toda feita (inclusive ao
abrir o pedido); toques rápidos em "Etiquetada"/"Conferida" não se perdem na animação. "Pedidos para separar"
com filtros e "Pronto" fixos. ARV-1273 está na Conferência com tudo conferido e etiquetado: ao abrir, o app
oferece "Ir para Etiquetagem".

Na mesma data: V64 (bipagem com toques rápidos conta na hora); "Concluir etapa" preso no rodapé da tela;
Peças repetidas com busca (peça, código, cliente), categoria pelo nome da peça, ordenação e caixa "destacar"
por pedido (marca as peças daquela cliente em todos os cartões, guardado neste aparelho); venda sem "Enviar à
cliente": "Copiar link", "Pago" e a situação "Em aberto / Aguardando pagamento". Testes de tela em paralelo
(4 ao mesmo tempo): `npm test` caiu de ~15 para ~8 min.

**Catálogo (16/11):** página `/catalogo` com as peças ativas copiadas da Shopify (`catalogo_site`, lidas uma vez
em blocos de 1000): busca, categoria pelo nome, ordem, seleção com quantidade de etiquetas e impressão numa fila
só (Zebra ou navegador). "Atualizar da Shopify" chama a `catalogo-sync` pelo app. Teste `tests/e2e/catalogo.spec.mjs`.
A barra "Concluir etapa" ganhou nome próprio na transição das peças (não pisca a cada toque).

**Lentidão do banco (análise só leitura, 16/11):** picos de 4 a 10 s em consultas que levam 50 a 250 ms em
média (inclusive um simples "mudar etapa"), e `troca_painel` com 0,5 s de média. O tempo limite do app é 8 s:
acima disso aparece "O banco demorou para responder". Sinais de máquina pequena e compartilhada; o tempo real
(Realtime) é a consulta mais chamada. Próximo passo sugerido: conferir o plano/compute no painel e, com o "sim"
do Gustavo, otimizar `troca_painel`/`garantir_troca`.

## Vistoria 2 — aplicada e publicada

Relatório e evidências em [`VISTORIA-2.md`](VISTORIA-2.md), com **18 correções V42–V59** e inventário efetivo. Esta seção é o estado atual; as seções seguintes preservam o histórico de novembro.

- Importação Shopify e carrinhos recusam composição incompleta, paginam todas as linhas e tratam limite de chamadas/tempo. Catálogo não avança marcador após falha parcial.
- Peça e etapa são gravadas juntas: queda de conexão após “Achei” não deixa o pedido na fila. Falta parcial preserva a etapa de origem do desvio. Menos uma requisição nas ações que mudam a etapa.
- Buscas CEP/CNPJ têm prazo e respostas antigas não sobrescrevem outra cliente. Listas e romaneio distinguem erro de rede de conteúdo inexistente, com nova tentativa.
- Acessibilidade: contraste claro, abas, progresso, listas e região principal do login corrigidos; Inter Tight, temas e ausência de valores nas etapas de peças preservados. Miniaturas Shopify limitadas a 600 px; ampliação continua em 1200 px.
- Cinco migrations `20261120100000` até `20261120140000` aplicadas após dry-run; quatro Edges publicadas (`shopify-sync`, `catalogo-sync`, `carrinho-ler`, `shopify-clientes`). Tipos regenerados; `baseAplicada = 20261120140000`.
- Banco remoto coincide com o local: 72 funções, 29 relações, 32 policies, 27 gatilhos e 59 migrations. **23 pedidos, 456 itens e 21 trocas preservados**, inclusive o conteúdo; os mesmos 12 avisos históricos do vigia continuam.
- Verificação final: **137 unidade, 180 banco, 64 e2e (381 testes)**, tipos e build verdes. Lint: **8 → 0 avisos**. Cinco FKs sem índice: **5 → 0**. Advisors mantêm avisos intencionais/limitações descritos no relatório, sem erros.

**Conferência publicada:** 36 situações de nove telas em celular/PC e dois temas sem erros de console/HTTP/JavaScript ou overflow; Lighthouse do login: **98 desempenho, 100 acessibilidade, 100 boas práticas**. O asset publicado foi comparado ao build local.

**No navegador:** recarregar a página para usar a versão nova; se uma aba antiga persistir, usar Ctrl+Shift+R. Não precisa limpar dados nem recriar pedidos.

**Pendência de painel já existente (V35):** proteção contra senhas vazadas e confirmação de cadastro público desativado dependem do Authentication; não foram alterados nesta autorização. Seis avisos da cadeia da CLI shadcn permanecem, sem atualização compatível segura (nenhum alto/crítico); não foi aplicado downgrade forçado.

Sem impressão física, sincronização Shopify real ou gravações de negócio durante a conferência publicada. Os contratos e fluxos foram executados com respostas fictícias e PostgreSQL descartável. INP de campo permanece sem amostragem; medidas de laboratório estão identificadas no relatório.

## Histórico anterior à Vistoria 2

## Troca, histórico e descontos (12/11/2026, APLICADO no Supabase)

**Aplicado com o "sim" do Gustavo:** migration `20261120090000_trocas_visiveis.sql`, Edge `shopify-sync`
(busca `discountApplications`), tipos regenerados (`baseAplicada` = `20261120090000`).
Conferido no banco (só leitura), ARV-1273: desvio lembra a Conferência (`etapa_antes_desvio`), desconto
25% = R$ 430,38 + "Arvenne cobriu" R$ 0,68 à parte, alterações BRI-ESP-1 → BRI-ASC-1 (cliente paga 0) e
GA1803-N removida.

- **V37:** falta na Conferência (ou depois) não joga mais o pedido para a Separação; a esteira mostra a etapa
  de origem com o selo do desvio. Ao resolver, `sair_do_desvio` volta para a origem (peça nova de troca → Separação).
- **V38:** rótulos da troca mostram "Arvenne cobre R$ X" / "Cliente paga R$ Y" (`coberto_previsto`,
  `cliente_paga_previsto`). "Cobrir tudo" grava `cobrir_ate = 99999999.99` (`COBRIR_TUDO`).
- **V39:** `troca_painel` lê a troca numa viagem só; a tela abre na hora com troca existente.

**Conferido no app real (12/11/2026, logado, Sincronizar clicado 2x):** 11 pedidos novos importados com o motivo
do desconto (BLACK 15%, 10% OFF PIX, FRETE GRÁTIS); troca abre em ~160 ms; abas sem pulo no PC e no celular;
ARV-1273 fica na Conferência com "Avisar cliente". Achados e corrigidos na conferência: V40b (gaveta do
celular) e V41 (valor exato das linhas com dois descontos; `shopify-sync` republicada). O vigia ainda acusa
composição em ARV-1273/1274/1276/1277: pedidos de teste antigos, mexidos antes do valor exato por linha
(somem com o reset); todos os pedidos importados agora fecham no centavo.

**Próxima ação (Gustavo):** conferir uma troca com "Cobrir tudo" e uma falta marcada na Conferência.

- **Dados do pedido:** desconto com percentual e motivo ("Desconto · 25% · cupom PIX25", vindo de `descontos`), linha "Arvenne cobriu na troca" e linhas "Peças trocadas (N)" / "Peças removidas (N)" que abrem o diálogo das alterações.
- **AlteracoesDialog** (`v_pedido_alteracoes`): cada alteração como "sai ↓ entra", valores do banco e quem/quando. Abre pelo selo "Peças trocadas" no cabeçalho, pelos dados do pedido e pelo texto "troca de X" da peça (focado nessa troca, sem valores nas etapas de peças).
- **Histórico** virou diálogo grande (`HistoricoDialog`): nota no topo, filtros, linha do tempo por dia. Rótulos em `src/lib/historico.ts`.
- **Traço médio** (`--traco`, 1,5 px) só nos contornos coloridos (verde, amarelo, vermelho); cinza volta ao padrão do shadcn (16/11). Barra de progresso h-1.5, ligações das etapas h-0.5.
- **Troca:** abas sem tranco (V40) e "Cobrir diferença" com "Tudo" | "Até R$ X". **Página da cliente concluída:** cartão com foto e código de cada lado e a diferença dentro dele; logo maior.

## Vistoria e proteções automáticas — referência atual

A vistoria está em [`VISTORIA.md`](VISTORIA.md): 36 problemas (13 altos, 21 médios, 2 baixos).
Após a continuação autorizada, a Fase 2 foi preparada e testada **localmente**; Fase 3 em andamento.
Os registros históricos abaixo não indicam o estado atual de aplicação: a Fase 1 confirmou as 27
migrations até `20261116090000` no Supabase. Não houve push, deploy nem escrita remota nesta etapa.

- `npm test` passa tudo: tipos, lint (oito avisos antigos), 82 de unidade, 146 de banco, 18 de tela e build.
- **35 dos 36 problemas da vistoria corrigidos e aplicados**, mais um furo achado pelo teste de conservação.
  Lista e commits em `VISTORIA.md`. Falta só configuração do painel (V35, abaixo).
- Teste de conservação do dinheiro (`tests/banco/conservacao.test.mjs`): sequências aleatórias de venda
  somada, troca, crédito, cobertura, Pix, retirada, falta, recebimento, estorno e devolução, em pedidos do
  WhatsApp e da Shopify; confere que nada fica negativo e que, acertado tudo, pago = total do pacote.
- Conferência pelo CLI em modo somente leitura agora lê a `v_pedidos` e roda o vigia
  (`select * from listar_inconsistencias()`), sem poder gravar.

**Aplicado em 12/11/2026 (com o "sim" do Gustavo):** migrations `20261117090000` até `20261119180000`;
Edges `shopify-sync` e `catalogo-sync`; vigia diário agendado (`arvenne-vistoria-diaria`, 06h UTC);
tipos regenerados (`baseAplicada` = `20261119180000`); commits no GitHub.
Conferido com dados reais (sem gravar): W0007 abre com venda somada, desconto Pix na nota e frete com o
valor do pacote inteiro (R$ 732,62).

**Publicado em 16/11/2026 (com o "sim" do Gustavo):** migrations `20261121090000_repetidas_selecao`
(Peças repetidas por seleção de pedidos, com prazo em cada pedido) e `20261121100000_creditos_cliente`
(crédito da troca com destino: reembolso pendente → Reembolsado, ou crédito guardado que aparece no próximo
pedido da mesma cliente até ser usado). Também: clique direito no cartão da venda, foto ampliada com moldura,
barra de avisos só na Expedição, mensagem da troca no texto aprovado (com asteriscos), botões Oferecer
alinhados, histórico na margem do título, sem "Reenviar", junção única nos botões agrupados.
Pendente: decidir "excluir venda de teste" (opção 1: só venda do WhatsApp não paga; opção 2: só "perdida").

**Reset feito em 16/11/2026 (com o "sim" do Gustavo):** `SHOPIFY_IMPORTAR_DESDE` = `2026-11-06` e
`scripts/zerar-testes.sql` (reescrito com TRUNCATE, testado em `tests/banco/zerar.test.mjs`) rodado no remoto:
0 pedidos, catálogo e feriados mantidos. A partir daqui os pedidos são reais.

Próxima ação (Gustavo, no painel do Supabase): Authentication → ligar a proteção contra senhas vazadas
(se o plano permitir) e confirmar que o cadastro público está desligado. Depois do reset, clicar em
"Atualizar catálogo" uma vez (cria o marcador novo do catálogo) e "Sincronizar".

## Onde as coisas estão

| O quê | Valor |
| --- | --- |
| Supabase | projeto **Arvenne Orders**, ref `fdcjpqnwkdzqipkikocl`, região East US, plano grátis |
| Loja Shopify | `brtarc-be.myshopify.com` (site arvennepratas.com.br) |
| App na Shopify | "Arvenne Separação", criado no Dev Dashboard e **instalado** na loja; escopos `read_orders`, `read_products`, `read_customers`; login por client credentials |
| Segredos das funções (só os nomes) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_IMPORTAR_DESDE` (feitos pelo Gustavo no painel) |
| Funções Edge publicadas | `shopify-sync`, `catalogo-sync`, `shopify-clientes` (`shopify-produtos` removida do código; nunca esteve publicada). Republicadas em 11/11/2026: `shopify-sync` v5, `catalogo-sync` v3, `shopify-clientes` v5 |
| Repositório | `gmroocha/arvenne-separacao`, branch `main`, tudo enviado |
| Cloudflare | **publicado** em https://arvenne-separacao.gmroocha.workers.dev (Workers com arquivos estáticos, `wrangler.jsonc`); cada push na `main` publica; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` nas variáveis de Build. Conferido em 12/11/2026: login, expedição, pedido e página pública da troca no celular e no PC |

## Venda somada a um pedido (12/11/2026, migration APLICADA no Supabase)
- **12/11/2026, migration `20261116090000_total_pago_somada.sql` (aplicada):** `v_pedidos` ganhou `total_pago`
  (pagamento do pedido + das vendas somadas, somado no banco) e `somada_a_numero`. Detalhe do pedido e Nota
  e frete mostram "Total pago"; lista, Arquivo e Venda mostram o selo "Somada a ARV-1274".

- **Fluxo:** a cliente quer mais peças num pedido que ainda não saiu. Cria-se uma **venda** e toca em
  "Somar a um pedido" (busca por número ou cliente entre os pedidos da expedição). A venda copia cliente e
  endereço do pedido, fica sem frete (mesmo pacote) e mostra a faixa "Vai somar ao pedido X" com "Desfazer".
  Ao "Marcar como pago", o app chama a função `somar_venda`: a venda vira `somada` (Arquivo; abrir leva ao
  pedido principal), as peças vivas entram no principal como **adicionais** (com `preco_pago` já com o
  desconto da venda) e, se o principal já passou da Separação, volta para ela. O dinheiro do principal não
  muda; `v_pedidos` ganhou `valor_somado`, `valor_pago_somado`, `total_geral`, `partes`, `qtd_adicionais`.
- **Separação:** depois de "A encontrar" aparece um divisor "Peças adicionais (N)" com um botão (i) que
  mostra cada venda somada (número, quando foi paga, forma, valor, peças). Valores só ali. Conferência,
  Etiquetagem e Bipagem listam tudo junto.
- **Detalhe e Nota e frete:** pagamento em duas partes (pedido e venda) e "Total geral"; a nota sai em
  "Parte 1 – pedido", "Parte 2 – venda X" e "Total da nota" (tudo vem da view). A página pública da cliente
  lista as adicionais à parte e a venda somada diz "somada ao pedido X".
- **Saiu:** botão "Adicionar peça" na Separação (o diálogo continua só para "Trocar"), "Mudar quantidade"
  (`mudar_qtd`, `QtdDialog`), "a cobrar/Recebido" das adicionais (`AdicionaisACobrar`,
  `adicionais_recebido_em`) e a regra de `adicionar_itens` marcar adicional. A migration antiga
  `pecas_adicionais` nunca foi aplicada e foi reescrita como `20261115110000_venda_somada.sql`.
- **Banco:** colunas `pedido_itens.adicional/venda_origem_id`, `pedidos.somar_em/somada_em/somada_valor`,
  status `somada`, evento `venda_somada`, `importar_pedido_shopify` e `romaneio_publico` ajustados.
  `somar_venda` é security definer (só `authenticated` executa) para gravar o evento. Testes: 74.
- **Função Edge `carrinho-ler`** foi publicada em 11/11/2026 (leitura do link de carrinho).
- **Falta o teste real** (Gustavo logado): criar venda, somar a um pedido e marcar como paga.

## Link de carrinho e ajustes da troca (11/11/2026; a parte de peças adicionais/mudar quantidade foi substituída pela venda somada acima)

- **Migrations pendentes de push:** `20261115090000_pecas_adicionais.sql` e `20261115100000_troca_pecas_ativas.sql` (conferidas com
  `npx supabase db push --remote --dry-run`; só entra com o "sim" do Gustavo). Cria `pedido_itens.adicional`,
  `pedidos.adicionais_recebido_em`, a função `mudar_qtd`, nova `adicionar_itens` e novos campos em
  `v_pedidos` (`qtd_adicionais`, `valor_adicionais`, `adicionais_a_cobrar`). A segunda faz a troca contar só
  as peças ainda em falta (peça que voltou a "pendente" saía como "Peça 4 de 4 · sem estoque" na página da
  cliente, caso ARV-1274) e manda `valor_pago_unit`. Testes: `npm run test:banco` (73).
- **Página da troca (cliente):** peça com várias unidades mostra "3×" e "3 unidades de R$ X · você pagou
  R$ Y" (depois do push); opções mostram o valor de uma unidade ("R$ 42,24 cada"); selo "Mesmo modelo,
  outro tamanho" quando a opção é a mesma peça; código do modelo corrigido (AN3243-20/24 virava "AN3243-2").
- **Verde só para sucesso:** escolha/seleção (faixa de preço, tamanhos, cartão escolhido, bolinha de
  quantidade) agora é cinza/neutra. Verde continua em peça feita, troca concluída e crédito.
- **Falta na Conferência/Etiquetagem:** a tela fica na etapa, com o cartão "Avise a cliente" em cima.
- **Peça nova sempre vai para a Separação:** adicionar peça (ou aumentar quantidade de peça já achada) cria
  peça pendente; se o pedido já passou da Separação, ele volta para lá (o que já foi conferido/etiquetado
  continua feito). Conferência/Etiquetagem/Bipagem avisam quando há peça pendente, com "Voltar para a Separação".
- **Desfazer tudo** ao lado de Encontradas/Conferidas/Etiquetadas/Bipadas (pede confirmação).
- **Link de checkout** (`/checkouts/.../recover?key=...`): função Edge `carrinho-ler` escrita
  (procura o checkout abandonado na Admin API, escopo read_orders); **falta publicar** (pede o "sim").
  O link `/cart/ID:QTD` que as clientes mandam é lido no próprio app.
- **Peças adicionais:** peça que entra depois do pedido pago nasce "adicional". Aparece numa seção própria
  ("Peças adicionais") na Separação, Conferência, Etiquetagem e Bipagem, com o selo "Adicional". Em Nota e
  frete (e na Venda) aparece "Peças adicionais · a cobrar R$ X", com o botão "Recebido" (dá para desfazer).
- **Mudar quantidade:** item "Mudar quantidade" no menu da peça. Aumentar depois de pago manda a
  diferença para uma peça adicional; diminuir deixa a diferença como removida ("quantidade reduzida"),
  nada é apagado.
- **Colar carrinho:** campo no "Adicionar peça" do pedido e na Venda. O link do site (`/cart/ID:QTD`)
  já funciona. O link compartilhado (`/cart/c/...`) chama a função Edge `carrinho-ler`, que **ainda não
  existe**: falta um link de exemplo real do Gustavo (veja o plano em
  `~/.claude/plans/snappy-finding-twilight.md`). Até lá o app mostra "Não consegui ler esse carrinho
  compartilhado".

**Próximas ações:** Gustavo dar o "sim" para o push das duas migrations; mandar um link `/cart/c/` de exemplo
(sem dados da cliente); publicar `carrinho-ler` (também pede o "sim").

## Vistoria e melhorias de 11/11/2026 (aplicadas no Supabase)

Migrations aplicadas em 11/11/2026: `20261114090000_vistoria`, `20261114100000_troca_cobertura`,
`20261114120000_vende_sem_estoque`, `20261114130000_carrinho_falta_parcial`. Funções republicadas:
`shopify-sync`, `shopify-clientes`, `catalogo-sync`. Testes: `npm run test:banco` (68) e
`npm run test:trocas:ui`.

- **Sincronização Shopify:** consulta dentro do limite de custo (50 linhas + paginação), mais novos
  primeiro, reembolso cancela o pedido, desconto por linha, valor atual da Shopify, despachado antes da
  embalagem só avisa (`shopify_alerta`).
- **Dinheiro:** peça removida depois de pago (cliente desistiu) vira **A devolver** + botão "Devolvido";
  na Shopify, subtotal − desconto + frete = total; reiniciar bloqueado com troca concluída; opção sem
  preço recusada; prazo pago em fim de semana/feriado conta do 1º dia útil 00h; feriados 2028.
- **Troca:** "Cobrir diferença até R$ X" (troca inteira), página da cliente com SKU, tamanhos agrupados,
  peças numeradas, resumo no fim; **carrinho** (várias peças/quantidades por peça em falta, "Você
  escolheu R$ X de R$ Y") e "Aprovar escolha da cliente"; filtro "vender sem estoque" (precisa clicar
  **Atualizar catálogo** uma vez).
- **Separação:** falta parcial ("Quantas faltam?" divide a linha); Bipagem com "Tirar 1 / Contar 1";
  Etiquetagem sem "Já tinha etiqueta" e sem marcar ao imprimir.
- **Nota e frete:** PAC/SEDEX ("Enviado por"), "Cliente pagou de frete" × "Frenet cobrou" e
  "A Arvenne cobre R$ X".
- **Testar sem pedido na etapa:** `npm run simular -- <rota> '<json>' <nome> ["botão > outro"]`
  (dados reais, nenhuma gravação).

**Próxima ação:** Gustavo clicar "Atualizar catálogo" (marca "vender sem estoque") e "Sincronizar";
conferir uma troca com carrinho e uma falta parcial de ponta a ponta.

## Design system (11/11/2026)

- Cores com significado viram tokens em `src/index.css`: `success` (feito), `warning` (aviso), `destructive`
  (erro/avisar), `pac`/`sedex` (só no seletor de frete). Nada de `emerald-*`/`amber-*` fora do tema.
- Selecionado = `primary` em todo lugar: Toggle/ToggleGroup (sólido), cartões com `ring-2 ring-primary` +
  `BolhaCheck`. Feito = verde suave (`bg-success/10`).
- Variantes novas: Badge `success|warning` e `size="lg"`, Alert `warning|success`, Card `tom`, Checkbox
  `variant="success"`, Button `xl|toque|icon-toque|bloco|icon-bloco`, Toggle `xl`.
- Componentes comuns em `src/components/comum/`: `LinhaPeca`, `Bolha`, `Vazio`, `TituloSecao`,
  `Quantidade`, `CampoBusca`, `FormaPagamento`, `PaginaPublica`, `LinhaValor`, `ConcluirEtapa`.

## O que já funciona

- **Vendas (romaneio):** a vendedora monta o pedido do WhatsApp antes do pagamento, com peças (do catálogo
  da Shopify, do Clube ou do carrinho colado), cliente (busca, CEP pelo ViaCEP), desconto, cupom e frete.
  Envia ao cliente um link `/r/:token` (sem CPF, e-mail, endereço; mostra o SKU). "Marcar como pago" leva
  o pedido para a Expedição.
- **Carrinho colado:** o campo "Colar carrinho da cliente" lê `.../cart/ID:QTD,...` e adiciona tudo.
  As variantes são pedidas à Shopify na hora (função `catalogo-sync`, com cópia em `catalogo_site`).
- **Sincronização de pedidos da Shopify** (botão Sincronizar em Expedição): traz pedidos pagos e ainda não
  enviados, com CPF, endereço, frete, desconto e o pedido bruto (`shopify_bruto`). 6 pedidos reais já
  entraram (ARV-1272 a ARV-1277).
- **Expedição:** esteira em colunas no PC (arrastar muda de etapa, com Desfazer) e faixa de etapas no
  celular. Etapas: Fila → Separação (ícone de olho) → Conferência → Etiquetagem → Bipagem → Nota e frete →
  Embalagem → Postagem → Enviado. Desvio: peça em falta ou com defeito leva o pedido para **Avisar cliente**; depois do botão "Cliente avisada" vai para **Aguardando cliente**; resolvidos os problemas, volta para Separação.
- **Bipagem** com leitor USB (funciona como teclado): "A bipar" e "Bipadas" em verde, "Última leitura",
  som, tabela `bipagens`. Peça com 2 ou mais unidades: bipa uma vez por unidade.
- **Nota e frete:** 3 passos (Nota fiscal, Frete, Pedido LR) com copiar por campo, comparação do frete
  cobrado pela Frenet com o pago pela cliente.
- **Peças repetidas**, **Clube** (catálogo manual com foto), **Arquivo**.

## Aberto agora

1. **Feito em 10/11/2026:** migrations de bairro, feedbacks e eventos aplicadas; `shopify-sync` e `shopify-clientes` republicadas. Falta o Gustavo clicar em Sincronizar para conferir o bairro nos próximos pedidos.
2. **Trocas verificadas localmente:** 10 testes de banco e fluxo público em 390 e 1280 px, com dados
   fictícios (detalhes abaixo). A esteira completa com pedidos reais ainda precisa do roteiro em
   `docs/PASSO-A-PASSO.md` e abaixo.
3. **ARV-1275:** a rua veio sem número claro (`rua fn 27 qd 22 lote 17, casa 1`); a tela Nota e frete pede
   para completar.
4. **Decisões pendentes do Gustavo:** Carnaval e Corpus Christi não contam como dia útil (está em
   `feriados` como ponto facultativo): manter? Pagamento no sábado vence na terça no mesmo horário: certo?
5. **Agendamento (pg_cron):** não existe. Sincronização de pedidos e do catálogo só pelos botões. Plano:
   `CRON_SECRET` guardado no Vault do Supabase, job a cada 5 minutos (pedidos) e um completo por dia
   (catálogo). Criar o segredo sem imprimir e sem chamar função por fora do login.
6. **Publicar no Cloudflare Pages** (Parte C de `docs/PASSO-A-PASSO.md`): build `npm run build`, saída
   `dist`, variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Publishable key, nunca a Secret),
   `NODE_VERSION=22`, opcional `VITE_LINK_AGENTE_FOTO`. Depois, colocar o endereço em Supabase →
   Authentication → URL Configuration → Site URL.
7. **Equipe:** criar os usuários da equipe no painel do Supabase (e manter o cadastro público desligado).
8. **Zebra (etiquetas):** faltam modelo da impressora, tamanho da etiqueta e foto de uma etiqueta atual.
   Plano: Zebra Browser Print + ZPL, botão "imprimir as não etiquetadas".
9. **Frenet:** API de rastreio (`POST /tracking/trackinginfo`, evento tipo 9 = entregue) precisa do token
   da conta, em segredo `FRENET_TOKEN`. Ver `docs/ROADMAP.md`, item 5.
10. Outros itens do `docs/ROADMAP.md`: tela de Histórico, backup semanal, catálogo do Clube com o app
    Price Tag do Lovable (projeto `c61acc05-2068-46c1-87aa-a6f84c99a247`), melhoria de foto por IA.

## Roteiro de teste (uma vez que o item 1 estiver feito)

`npm run dev`, entrar, clicar Sincronizar; abrir um pedido ARV-12xx e percorrer: Separação ("Achei", Dialog
de etapa), Conferência (aviso amarelo, "Separe N"), Etiquetagem, Bipagem (SKU do pedido, de fora e
excedente), Nota e frete (CPF, endereço e bairro vindos da Shopify), Postagem, Enviado. Pedido de WhatsApp:
Vendas → Nova venda, colar o carrinho, desconto e frete, "Enviar à cliente", abrir `/r/...` em aba anônima.
Também no celular (390 px). Sem rolagem horizontal da página.

## Banco: migrations aplicadas

`20261110120000_inicio`, `20261110180000_permissoes`, `20261111090000_vendas`,
`20261111120000_catalogo_site`, `20261111150000_catalogo_status`, `20261111180000_esteira`,
`20261111210000_bairro_complemento`, `20261112090000_feedbacks`, `20261112091000_eventos_analise`,
`20261112120000_avisar_cliente`, `20261112150000_trocas`, `20261112160000_cnpj`,
`20261112170000_pix`. Lista confirmada por consulta ao Supabase em 10/11/2026.

Aplicadas em 11/11/2026 (auditoria de 10/11): `20261112180000_sugestoes_preco`,
`20261112190000_conclusao_troca`, `20261113090000_valores`, `20261113100000_importacao`,
`20261113110000_acoes`, `20261113120000_fotos_limite`, `20261113130000_troca_v2`. Nenhuma pendente.

## Etiquetas na Zebra ZD220 (11/11/2026)

- Etiqueta 50×30 mm igual à atual ("SKU: X" + Code 128 do SKU), uma por unidade. Etapa Etiquetagem:
  "Imprimir etiquetas (N)", por peça, reimprimir e etiqueta de teste. Expedição: "Imprimir todas (N)" dos
  pedidos em Etiquetagem, com etiqueta separadora por pedido. Depois: "Saiu tudo certo?" marca como etiquetadas.
- Dois caminhos: Zebra Browser Print (ZPL direto, sem diálogo) quando o programa responde; senão, diálogo
  do Chrome com página 50×30 mm. Guia em `docs/PASSO-A-PASSO.md` ("Impressora Zebra").
- **Falta testar na impressora real** (acentos e "·" do separador com `^CI28`).
- Troca: mensagem genérica com o link no fim; "Copiar link" sempre em "Falar com a cliente"; logo
  Arvenne Pratas (do `c0e8de1`) menor nas páginas da cliente.

## Troca v2 (11/11/2026)

- Preço pago exato da Shopify por peça (`pedido_itens.preco_pago`, de `discountedUnitPriceAfterAllDiscountsSet`).
  O "total de descontos" da Shopify somava o frete grátis; agora `desconto_valor` é só das peças,
  `desconto_frete` e `frete_original` à parte e `frete_cobrado` é o que a cliente pagou.
- Tela de troca: categoria com maiúscula, chips com "N opções", caixa "Incluir peças que já estão no
  pedido" (desmarcada), **Aprovar** e **Dar crédito** com confirmação (já troca), resumo a pagar/crédito,
  "Link para a cliente" (Copiar link / Abrir página).
- Página `/t/` no estilo do romaneio. Card **Acerto da troca** no pedido (Diferença recebida / Crédito
  registrado) e selo "Acerto pendente" na Expedição.
- `shopify-sync` republicada (v6). Falta conferir na tela: confirmação de Aprovar, card de acerto e faixa
  "Troca confirmada" (nenhuma troca concluída ainda).
- **Reset de testes:** feito em 16/11/2026 (ver Próxima ação).

## Auditoria de 10/11/2026: corrigida em 11/11/2026

Relatório em `docs/AUDITORIA-2026-11-10.md`. Feito: total certo depois de troca; `lerNumero` e telefone
+55; valores nunca negativos; venda sem peça/preço não vira pedido; CPF/CEP/telefone só dígitos;
sincronização completa número/cidade/UF, erros por pedido, repetição e tempo máximo, data do pagamento
pela transação, aviso "peças mudaram na Shopify"; reiniciar, trocas, adicionar peças e bipar em
transação no banco; autosave da venda em fila; esteira só avança 1 etapa; app com pacote inicial de
302 kB (era 1 MB), fonte única, consultas por status, tempo real por pedido, fotos até 2 MB;
ErrorBoundary; ajustes visuais. W0002 e W0004 (testes) apagados. Testes: `npm run test:banco` (25).

Ainda aberto: conferir a tela Nota e frete (sem pedido nessa etapa para fotografar); no painel do
Supabase, conferir que o cadastro público está desligado (Authentication → Sign In / Providers).

## Retomada: concluir troca de peças (10/11/2026)

Código pronto localmente, **ainda depende de aplicar as duas migrations acima**. O botão de confirmar
agora usa a nova função SQL; aplicar antes de publicar o código. Não houve escrita em pedidos reais,
push ou publicação nesta retomada. A consulta remota encontrou zero peças de troca concluídas.

Validação realizada:
- `npm run test:trocas`: 10 cenários em PostgreSQL local via PGlite, com as migrations reais, gatilhos,
  constraints e permissões. Site, Clube, quantidade, crédito, desconto fixo + Pix, confirmação repetida,
  resposta alterada, falha no meio da transação, acesso público e remoção de opção escolhida.
- `npm run test:trocas:ui` (requer `npm run dev`): página pública em celular e PC, com respostas de API
  simuladas; escolha, erro e nova tentativa, crédito, resumo, estado concluído e ausência de rolagem
  horizontal. Capturas em `capturas/troca-testada-390.png` e `capturas/troca-testada-1280.png`.
- `npm run build`, `npm run lint` e `git diff --check`: sem erros; permanecem os avisos anteriores de
  lint e de tamanho do bundle.

**Próxima ação:** obter o “sim” do Gustavo para aplicar as duas migrations no Supabase, conforme
`CLAUDE.md`. O dry-run já confirmou somente esses dois arquivos. Depois, verificar a lista remota e
o acesso às funções. O teste com pedidos reais e a publicação do app continuam separados.
