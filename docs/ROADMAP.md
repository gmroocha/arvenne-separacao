# Arvenne Separação — próximos passos

Anotações do Gustavo, 10/11/2026. A primeira versão (pedidos, separação com foto, peça em falta,
peças repetidas, catálogo do Clube) já está pronta. Nada abaixo foi construído ainda.

Ordem sugerida: **1 → 2 → 3**. O pedido manual completo vem primeiro porque alimenta a nota fiscal, o
prazo e a visualização da cliente.

## 0. Pedidos antigos (guardar todos e poder consultar)

Decisão do Gustavo: **nenhum pedido é apagado**, mesmo depois de enviado.

- O banco já recusa a exclusão de pedidos e itens vinda do app (só o painel do Supabase apaga).
- **Falta a tela:** hoje a lista mostra pedidos abertos e os dos últimos 30 dias. Os mais antigos
  continuam no banco, mas não aparecem em lugar nenhum. Criar uma tela "Histórico" com busca por
  número, nome da cliente, telefone e SKU, paginada, sem limite de data.
- Foto de peça da Shopify é só o link da própria Shopify. Se o produto sair da loja, a foto de pedidos
  antigos pode sumir. Avaliar copiar a foto para o nosso armazenamento quando o pedido for enviado.
- Espaço: cada pedido ocupa algo em torno de 10 KB (estimativa, não medida). Medir com o uso real e
  acompanhar em Supabase → Reports → Database. Plano grátis tem 500 MB de banco e 1 GB de fotos.

## 1. Pedido manual completo (WhatsApp)

Objetivo: lançar um pedido fora da Shopify com tudo que a nota fiscal e o controle precisam, sem digitar
o que já se sabe.

**Cliente**
- Nome, CPF, e-mail, telefone.
- Endereço de entrega completo: CEP, rua, número, complemento, bairro, cidade, UF. Preencher a partir do
  CEP quando possível.
- **Cliente que já existe:** ao digitar telefone ou e-mail, o app procura primeiro nos clientes já
  cadastrados nele e depois na Shopify, e preenche nome, CPF e endereço. Cliente nova: preenche à mão e
  fica salva para a próxima vez.

**Pagamento**
- Quanto foi pago e a forma (Pix, cartão, link de pagamento, outro).
- Descontos e cupom (valor ou porcentagem, com o motivo).

**Frete**
- Quem pagou (cliente ou Arvenne), quanto foi cobrado da cliente e quanto custou para a Arvenne.
- Tipo: PAC, SEDEX ou outro.

**Data da compra**
- Data e hora da compra, editável (padrão: agora). Pedido da Shopify usa a data do próprio pedido.

## 2. Prazo de envio (48 h úteis)

- Prazo = data da compra + 48 h úteis, sem contar sábado, domingo e feriados nacionais.
- A lista de pedidos mostra "vence em X h" ou "atrasado" e pode ser ordenada por prazo.
- Pedido atrasado ganha destaque (`destructive`), sem cor nova.

## 3. Visualização para a cliente

Uma tela do pedido para mandar à cliente, com fotos, nomes, variantes, quantidades, valores, desconto,
cupom, frete e total.

- Antes de enviar, a vendedora pode **adicionar desconto (valor ou %) e cupom**; o total recalcula.
- O que ela vê é um link público, com código longo e aleatório. Esse link **nunca** mostra CPF,
  e-mail ou endereço completo.
- Enviar pelo botão de WhatsApp (link `wa.me`), do mesmo jeito do rastreio.

## 4. Catálogo do Clube, ligado ao app de precificação

Hoje o Clube vive em outro app (feito no Lovable): o Gustavo sobe de 15 a 50 fotos do fornecedor, a IA
lê a etiqueta (código e custo), calcula o preço de venda, desenha a tag na foto e exporta (ZIP, link de
24 h ou pasta no Google Drive "Clube Arvenne"). Cadastrar peça nova à mão aqui leva tempo e há peças
novas todos os dias.

**Ideia:** cada lote precificado já vira peça no catálogo, sem digitar nada, e o catálogo guarda tudo:
- Código, custo, preço de venda, tipo (joia comum, corrente ou pulseira), lote, data de entrada.
- Categoria (anel, brinco, pingente, corrente...). O prefixo do código do fornecedor (BRP, ANF...) já
  indica o tipo, então dá para sugerir a categoria sozinho.
- Cliente nova que entra no grupo consegue ver as peças antigas, que hoje ela "perde".
- Pedido do WhatsApp escolhe a peça no catálogo pela foto, em vez de cadastrar.

**Onde guardar as fotos** (a decidir; números são estimativas):
- Volume: 15 a 50 fotos por dia. Uma cópia de 1200 px em webp pesa cerca de 150 KB, então 50 por dia dão
  cerca de 2,7 GB por ano. O 1 GB de fotos do Supabase grátis acaba em ~5 meses.
- **Google Drive** serve bem como arquivo das fotos originais em alta resolução (o app atual já envia para
  lá). Não serve para mostrar o catálogo: link do Drive como imagem de site é instável, tem limite de
  acesso e carrega devagar com muitas miniaturas.
- **Cloudflare R2** (mesma conta do Cloudflare Pages): armazenamento compatível com S3, 10 GB grátis e sem
  cobrança de tráfego, pelo que sei. Conferir os valores atuais antes de decidir. É a opção mais provável
  para as cópias leves do catálogo.
- **Proposta:** Drive guarda os originais; R2 guarda a cópia leve que o catálogo mostra; o Supabase
  guarda só os dados (texto), que ocupam quase nada.

**IA que lê as etiquetas (resposta do app atual, 10/11/2026):**
- Hoje usa `openai/gpt-6-astra` pelo gateway do Lovable (`src/lib/analyze.functions.ts`). Recebe a foto
  reduzida a 1400 px e devolve JSON com código, custo, lote, peso e medidas. Quem paga é a conta do
  Lovable, com créditos de IA do plano; acabando os créditos, a leitura para.
- Fora do Lovable, o caminho mais barato é o **Gemini Flash** do Google AI Studio, com chave própria
  guardada numa função do Supabase (nunca no navegador). O app atual diz que há uma faixa grátis de
  15 requisições por minuto, e que passando disso custaria frações de centavo por lote.
  **Conferir antes de construir:** limite grátis atual, nome do modelo vigente e se, na faixa grátis, o
  Google usa as fotos enviadas. O app atual citou o Gemini 1.5, que pode já não existir.
- OCR no navegador (Tesseract) é grátis, mas erra ao separar peso, comprimento e custo na caixinha. Só
  como plano B.
- Plano para o primeiro teste: 10 fotos reais do fornecedor no modelo candidato, comparando com a leitura
  atual, antes de decidir.

**Ainda falta decidir:** como trazer a lógica de leitura e de preço (acréscimo do lote, tabela de
correntaria por grama) para este projeto. O catálogo e o app de precificação podem acabar no mesmo projeto.

**Segurança:** se o catálogo for aberto às clientes, a página pública mostra só foto, nome e preço de
venda. Custo e código do fornecedor nunca saem da equipe.

## Cuidados técnicos (para quem for implementar)

- Migration nova em arquivo novo. Tabela `clientes` (CPF, endereço) e colunas novas em `pedidos`
  (pagamento, desconto, cupom, frete, `data_compra`, `prazo_envio`).
- CPF e endereço são dado pessoal (LGPD): acesso só da equipe logada, nunca na view pública.
- Busca de cliente na Shopify é uma função nova, com escopo `read_customers` no app da Shopify.
- Feriados: tabela própria, com os nacionais de cada ano.
- Interface só com componentes de `src/components/ui/` e tokens do preset, como no resto do app.

## Perguntas ainda abertas

1. **CPF na Shopify:** em qual campo ele fica hoje (campo do checkout, metacampo, nota)? Define como a
   busca de cliente o encontra.
2. **48 h úteis:** conta a partir da compra ou da confirmação do pagamento? Sábado conta?
3. **Link de pagamento do WhatsApp:** gerado onde (Shopify, Mercado Pago, InfinitePay)? Se o app
   puder gerar, a visualização da cliente já leva o botão de pagar.
4. **Visualização da cliente:** link, imagem ou PDF? Link é o mais simples.

## Já combinado antes

- **Etiqueta Zebra** com 1 clique: falta modelo da impressora, tamanho da etiqueta e se o código de
  barras é SKU ou EAN.
- **Checagem com leitor de código** na tela do pedido.
- **Automação Olist, Bling e Frenet**, só onde o plano de cada um liberar API.
- **Cópia de segurança:** o Supabase grátis não guarda backup diário. Pedidos do WhatsApp e fotos do
  Clube não voltam da Shopify. Fazer exportação semanal.
