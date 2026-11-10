# Arvenne Separação — próximos passos

Anotações do Gustavo, 10/11/2026. A primeira versão (pedidos, separação com foto, peça em falta,
peças repetidas, catálogo do Clube) já está pronta. Nada abaixo foi construído ainda.

Ordem sugerida: **1 → 2 → 3**. O pedido manual completo vem primeiro porque alimenta a nota fiscal, o
prazo e a visualização da cliente.

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
