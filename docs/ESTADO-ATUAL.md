# Estado atual (atualizado em 10/11/2026)

## Onde as coisas estão

| O quê | Valor |
| --- | --- |
| Supabase | projeto **Arvenne Orders**, ref `fdcjpqnwkdzqipkikocl`, região East US, plano grátis |
| Loja Shopify | `brtarc-be.myshopify.com` (site arvennepratas.com.br) |
| App na Shopify | "Arvenne Separação", criado no Dev Dashboard e **instalado** na loja; escopos `read_orders`, `read_products`, `read_customers`; login por client credentials |
| Segredos das funções (só os nomes) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_IMPORTAR_DESDE` (feitos pelo Gustavo no painel) |
| Funções Edge publicadas | `shopify-sync`, `catalogo-sync`, `shopify-clientes` (`shopify-produtos` ficou sem uso) |
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
  Embalagem → Postagem → Enviado. Desvio: Aguardando cliente (peça em falta ou com defeito).
- **Bipagem** com leitor USB (funciona como teclado): "A bipar" e "Bipadas" em verde, "Última leitura",
  som, tabela `bipagens`. Peça com 2 ou mais unidades: bipa uma vez por unidade.
- **Nota e frete:** 3 passos (Nota fiscal, Frete, Pedido LR) com copiar por campo, comparação do frete
  cobrado pela Frenet com o pago pela cliente.
- **Peças repetidas**, **Clube** (catálogo manual com foto), **Arquivo**.

## Aberto agora

1. **Aguardando o "sim" do Gustavo** para: aplicar a migration `20261111210000_bairro_complemento.sql`
   (separa bairro e complemento dos pedidos da Shopify já importados) e **republicar `shopify-sync`**
   (`npx supabase functions deploy shopify-sync --use-api --yes`) para os próximos pedidos. Depois do
   deploy, o Gustavo clica em Sincronizar e confere-se no banco.
2. **Ninguém testou as telas novas ponta a ponta.** Roteiro em `docs/PASSO-A-PASSO.md` e abaixo.
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
`20261111120000_catalogo_site`, `20261111150000_catalogo_status`, `20261111180000_esteira`.
Pendentes de aplicar (aguardam o "sim" do Gustavo): `20261111210000_bairro_complemento`,
`20261112090000_feedbacks` (tabela de feedbacks) e `20261112091000_eventos_analise` (novos eventos em
`pedido_eventos` e views `v_tempo_etapas` e `v_tempo_sku`).
