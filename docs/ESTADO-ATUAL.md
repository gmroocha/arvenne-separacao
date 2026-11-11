# Estado atual (atualizado em 10/11/2026)

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
