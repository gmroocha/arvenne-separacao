# Estado atual (atualizado em 12/11/2026)

## Vistoria e proteções automáticas — referência atual

A vistoria está em [`VISTORIA.md`](VISTORIA.md): 36 problemas (13 altos, 21 médios, 2 baixos).
Após a continuação autorizada, a Fase 2 foi preparada e testada **localmente**; Fase 3 em andamento.
Os registros históricos abaixo não indicam o estado atual de aplicação: a Fase 1 confirmou as 27
migrations até `20261116090000` no Supabase. Não houve push, deploy nem escrita remota nesta etapa.

- `npm test` passa tipos, lint (oito avisos anteriores), 41 testes de unidade, 84 de banco, 10 de tela
  e build. Nove reproduções abertas são falhas esperadas e não contam como correções.
- Tipos oficiais do Supabase já usados pelo cliente e pelos tipos principais do app, com complemento
  gerado para SQL ainda local. Instruções em [`TESTES.md`](TESTES.md).
- Migrations locais: `20261117090000_protecoes_integridade` e `20261117100000_vigia_diario`.
  A primeira impede bipagem excessiva, vínculo adicional incoerente e opção de outra peça; endurece
  funções. A segunda agenda inspeção diária às 03h de São Paulo e guarda os avisos sem mudar pedidos.
- Alerta discreto pronto no app, com capturas escuras em celular e PC. Antes da migration, fica oculto.
- Simulador bloqueia também Edge/Storage e renovação de login; testes usam dados fictícios em memória.
- Workflow GitHub Actions preparado, ainda sem envio ao GitHub. Precisa do “sim” específico para envio.
- Dry-run listou somente essas duas migrations. Consulta remota somente leitura encontrou zero linhas
  violando as três novas restrições. Aplicação continua dependendo de autorização específica.

Correções locais da Fase 3: V01, V02, V05, V06, V07, V09, V15 e V17, com testes. Junto de V31/V32,
são 10 problemas corrigidos no código local (9 altos); faltam os altos V03/V04/V08/V14.
Os commits e limites estão em `VISTORIA.md`. A Edge `shopify-sync` também mudou só localmente.

Próxima ação: concluir os problemas altos com regressões locais, depois repetir a verificação completa
e o dry-run. Corrigir código não autoriza reconstruir pagamentos ou pedidos reais já incoerentes.

## Onde as coisas estão

| O quê | Valor |
| --- | --- |
| Supabase | projeto **Arvenne Orders**, ref `fdcjpqnwkdzqipkikocl`, região East US, plano grátis |
| Loja Shopify | `brtarc-be.myshopify.com` (site arvennepratas.com.br) |
| App na Shopify | "Arvenne Separação", criado no Dev Dashboard e **instalado** na loja; escopos `read_orders`, `read_products`, `read_customers`; login por client credentials |
| Segredos das funções (só os nomes) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_IMPORTAR_DESDE` (feitos pelo Gustavo no painel) |
| Funções Edge publicadas | `shopify-sync`, `catalogo-sync`, `shopify-clientes` (`shopify-produtos` removida do código; nunca esteve publicada). Republicadas em 11/11/2026: `shopify-sync` v5, `catalogo-sync` v3, `shopify-clientes` v5 |
| Repositório | `gmroocha/arvenne-separacao`, branch `main`, tudo enviado |
| Cloudflare Pages | **ainda não publicado**; o app roda só com `npm run dev` |

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
- **Antes de começar de verdade:** `scripts/zerar-testes.sql` apaga pedidos, trocas e clientes de teste
  (não rodado). Antes, ajustar o segredo `SHOPIFY_IMPORTAR_DESDE`.

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
