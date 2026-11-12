import type { Fase, StatusItem, StatusPedido } from "./status"

export type Origem = "shopify" | "whatsapp"
export type OrigemItem = "shopify" | "clube" | "avulso"

export type DescontoTipo = "valor" | "percentual"
export type FreteTipo = "PAC" | "SEDEX" | "retirada" | "outro"
export type FretePagoPor = "cliente" | "arvenne"

// Uma linha de v_pedidos: colunas de pedidos + o que o banco calcula (a tela só formata).
export type Pedido = {
  id: string
  numero: string
  origem: Origem
  status: StatusPedido
  status_desde: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_telefone: string | null
  cliente_email: string | null
  cliente_cpf: string | null
  cliente_razao_social: string | null
  cliente_ie: string | null
  entrega_cep: string | null
  entrega_logradouro: string | null
  entrega_numero: string | null
  entrega_complemento: string | null
  entrega_bairro: string | null
  entrega_cidade: string | null
  entrega_uf: string | null
  valor_total: number | null
  desconto_tipo: DescontoTipo | null
  desconto_valor: number | null
  cupom: string | null
  frete_tipo: FreteTipo | null
  frete_pago_por: FretePagoPor | null
  frete_cobrado: number | null
  frete_custo: number | null
  forma_pagamento: string | null
  valor_pago: number | null
  pago_em: string | null
  data_compra: string | null
  token_publico: string
  shopify_order_id: number | null
  shopify_url: string | null
  rastreio: string | null
  observacoes: string | null
  desconto_codigos: string[] | null
  nf_numero: string | null
  nf_emitida_em: string | null
  frete_gerado_em: string | null
  frete_servico: string | null
  rastreio_url: string | null
  pedido_fornecedor_numero: string | null
  pedido_fornecedor_em: string | null
  embalado_em: string | null
  postado_em: string | null
  rastreio_enviado_em: string | null
  pedido_em: string
  created_at: string
  // Calculados pela view v_pedidos
  subtotal: number
  desconto: number
  desconto_pix: number
  frete_na_conta: number
  total: number
  qtd_pecas: number
  qtd_linhas: number
  qtd_encontradas: number
  qtd_problemas: number
  qtd_conferidas: number
  qtd_etiquetadas: number
  qtd_bipadas: number
  valor_pecas_com_desconto: number
  frete_diferenca: number | null
  // Shopify: frete antes do desconto de frete grátis e o desconto de frete (fora do desconto das peças).
  frete_original: number | null
  desconto_frete: number | null
  // Há troca concluída com diferença ainda não acertada (cobrar ou registrar crédito).
  acerto_pendente: boolean
  troca_coberto?: number
  // Peças adicionais (entraram depois do pagamento): quantidade, valor e quando a cobrança foi recebida.
  // Ausentes em bancos sem a migration de peças adicionais.
  qtd_adicionais?: number
  valor_adicionais?: number
  adicionais_recebido_em?: string | null
  adicionais_a_cobrar?: number
  // Reembolso pendente de peças tiradas ("cliente desistiu") depois do pagamento. Ausente em bancos sem a coluna.
  a_devolver?: number | null
  pendente_rastreio: boolean
  fotos: string[]
  fase: Fase
  prazo: string | null
  prazo_horas_uteis: number | null
}

export type Item = {
  id: string
  pedido_id: string
  origem: OrigemItem
  shopify_variant_id: number | null
  peca_clube_id: string | null
  sku: string | null
  nome: string
  variante: string | null
  foto_url: string | null
  qtd: number
  preco: number | null
  // Preço unitário que a cliente pagou depois de todos os descontos (Shopify); nulo = preço x fator.
  preco_pago: number | null
  status: StatusItem
  observacao: string | null
  ordem: number
  conferido_em: string | null
  etiquetado_em: string | null
  etiqueta_previa: boolean
  qtd_bipada: number
  bipado_em: string | null
  removido_em?: string | null
  devolvido_em?: string | null
  shopify_line_id?: number | string | null
  // Entrou depois do pagamento do pedido: separada à parte e cobrada à parte.
  adicional?: boolean
}

export type ResultadoBipagem = "ok" | "fora_do_pedido" | "excedente"

export type Evento = {
  id: number
  tipo: string // criado, status, item, nota, conferida, etiquetada, bipada, reiniciado...
  de: string | null
  para: string | null
  texto: string | null
  usuario_email: string | null
  created_at: string
}

export type PecaClube = {
  id: string
  codigo: string
  nome: string
  variante: string | null
  foto_url: string | null
  preco: number | null
}

// Peça escolhida na tela, antes de gravar no pedido.
export type NovoItem = {
  chave: string
  origem: OrigemItem
  shopify_variant_id: number | null
  peca_clube_id: string | null
  sku: string | null
  nome: string
  variante: string | null
  foto_url: string | null
  qtd: number
  preco: number | null
}

export type PecaRepetida = {
  chave: string
  sku: string | null
  nome: string
  variante: string | null
  foto_url: string | null
  qtd_total: number
  qtd_pedidos: number
  pedidos: { pedido_id: string; numero: string; cliente: string | null; qtd: number }[]
}

export type Endereco = {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export type Cliente = {
  id: string
  nome: string
  cpf: string | null
  razao_social: string | null
  ie: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  shopify_customer_id: number | null
}

// Cliente achada na Shopify (função shopify-clientes), ainda sem cadastro aqui.
export type ClienteShopify = {
  shopify_customer_id: number
  nome: string | null
  cpf: string | null // vem do último pedido da cliente (TAX_CREDENTIAL_BR)
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export type Romaneio = {
  numero: string
  cliente: string | null
  fase: Fase
  status: StatusPedido
  itens: { nome: string; variante: string | null; sku: string | null; foto_url: string | null; qtd: number; preco: number | null }[]
  subtotal: number
  desconto: number
  desconto_pix?: number
  cupom: string | null
  frete_tipo: FreteTipo | null
  frete_cobrado: number
  total: number
}

export type Feedback = {
  id: string
  texto: string
  pagina: string | null
  pedido_id: string | null
  usuario_email: string | null
  created_at: string
  resolvido_em: string | null
  pedidos: { numero: string; cliente_nome: string | null; origem: string } | null
}

export type StatusTroca = "rascunho" | "enviada" | "respondida" | "concluida" | "cancelada"
export type EscolhaTroca = "opcao" | "credito" | "whatsapp"
export type SituacaoTroca = "paga_diferenca" | "credito" | "sem_diferenca"

export type TrocaOpcao = {
  id: string
  troca_peca_id: string
  origem: "site" | "clube"
  shopify_variant_id: number | null
  peca_clube_id: string | null
  sku: string | null
  nome: string
  variante: string | null
  foto_url: string | null
  preco: number | null
  motivo: "mesmo_modelo" | "mesmo_valor" | "busca"
  ordem: number
}

// Uma linha de v_troca_valores: por opção (tipo "opcao") ou o crédito da peça (tipo "credito").
export type TrocaValor = {
  troca_peca_id: string
  troca_id: string
  pedido_id: string
  item_id: string
  opcao_id: string | null
  tipo: "opcao" | "credito"
  qtd: number
  valor_pago_item: number
  valor_opcao: number
  // Por unidade (só depois da migration do carrinho).
  valor_unit?: number
  diferenca: number
  situacao: SituacaoTroca
}

// Uma opção no carrinho que a cliente montou (tabela troca_escolhas).
export type TrocaEscolha = { id: string; troca_peca_id: string; opcao_id: string; qtd: number; created_at: string }

// Linha de v_troca_carrinho: o carrinho de uma peça com os totais prontos do banco.
export type TrocaCarrinho = {
  troca_peca_id: string
  troca_id: string
  pedido_id: string
  item_id: string
  unidades: number
  valor_escolhido: number
  valor_pago_item: number
  // positivo = a cliente paga, negativo = crédito
  diferenca: number
  itens: { opcao_id: string; qtd: number; valor_unit: number; valor: number }[]
}

// Uma peça em falta dentro da troca, com as opções montadas e os valores prontos do banco.
export type TrocaPeca = {
  id: string
  troca_id: string
  item_id: string
  escolha_tipo: EscolhaTroca | null
  escolha_opcao_id: string | null
  respondida_em: string | null
  concluida_em: string | null
  resultado_diferenca: number | null
  // null = a cliente escolheu pelo link; 'equipe' = aprovada pela equipe (cliente respondeu no WhatsApp).
  escolhida_por: "cliente" | "equipe" | null
  created_at: string
  opcoes: TrocaOpcao[]
  valores: TrocaValor[]
  // Carrinho da cliente (vazio/ausente até a migration do carrinho).
  escolhas?: TrocaEscolha[]
  carrinho?: TrocaCarrinho | null
}

// Linha de v_troca_resumo: diferenca_total positivo = a cliente paga, negativo = crédito.
export type TrocaResumo = {
  troca_id: string
  pedido_id: string
  pecas_total: number
  pecas_respondidas: number
  total_pago: number
  // Líquida: já descontado o que a loja cobre.
  diferenca_total: number
  diferenca_bruta?: number
  coberto?: number
  cobrir_ate?: number
}

export type Troca = {
  id: string
  pedido_id: string
  token: string
  status: StatusTroca
  enviada_em: string | null
  respondida_em: string | null
  concluida_em: string | null
  acerto_status: StatusAcerto | null
  acerto_em: string | null
  acerto_por: string | null
  // A loja cobre até este valor da diferença positiva da troca (0 = não cobre).
  cobrir_ate?: number
  created_at: string
  pecas: TrocaPeca[]
  resumo: TrocaResumo | null
}

export type StatusAcerto = "pendente" | "recebido" | "credito_registrado" | "sem_diferenca"

// Uma peça trocada dentro de v_pedido_acerto.pecas.
export type AcertoPeca = {
  troca_id: string
  troca_peca_id: string
  qtd: number
  tipo: "opcao" | "credito"
  escolhida_por: "cliente" | "equipe"
  valor_pago: number | null
  // positivo = a cliente paga, negativo = crédito
  diferenca: number
  concluida_em: string
  antes: { sku: string | null; nome: string; variante: string | null; foto_url: string | null }
  depois: { sku: string | null; nome: string; variante: string | null; foto_url: string | null } | null
  // Todas as peças novas (a 1ª também está em `depois`).
  depois_lista?: { sku: string | null; nome: string; variante: string | null; foto_url: string | null; qtd: number }[] | null
}

// Linha de v_pedido_acerto (um pedido com peça trocada). Todo o dinheiro vem pronto do banco.
export type AcertoPedido = {
  pedido_id: string
  valor_pago_original: number
  valor_pago_pecas_trocadas: number
  total_a_cobrar: number
  total_credito: number
  saldo: number
  coberto?: number
  novo_total: number
  troca_id: string | null
  acerto_status: StatusAcerto | null
  acerto_em: string | null
  acerto_por: string | null
  pecas: AcertoPeca[]
}

export type ModoSugestao = "variantes" | "preco"

export type FiltrosSugestao = {
  categoria?: string | null
  // 0.2 = até 20% de diferença do valor pago por unidade; null = qualquer preço.
  faixa?: number | null
}

// Resposta de troca_valor_pago: o que a cliente pagou pela peça (com o desconto do pedido).
export type ValorPago = { valor_pago: number; valor_pago_unit: number; qtd: number }

export type CategoriaCatalogo = { categoria: string; total: number }

// Linha de sugerir_troca.
export type Sugestao = {
  motivo: "mesmo_modelo" | "mesmo_valor"
  variant_id: number
  produto_id: number | null
  sku: string | null
  produto: string
  variante: string | null
  preco: number | null
  foto_url: string | null
  // Valores já com o desconto da cliente, calculados no banco.
  preco_cliente: number
  diferenca: number
  situacao: "paga_diferenca" | "credito" | "sem_diferenca"
  // A variante já é peça viva do pedido (só vem com incluirPedido).
  no_pedido: boolean
  // Marcada como "vender sem estoque" na Shopify (vem do banco; pode faltar até atualizar o catálogo).
  vende_sem_estoque?: boolean | null
}

// Resposta de troca_publica (página da cliente).
export type TrocaPublicaPeca = {
  item_id: string
  foto_url: string | null
  nome: string
  variante: string | null
  sku: string | null
  qtd: number
  valor_pago: number
  // Valor pago por UMA unidade (do banco). Vem da migration 20261115100000; antes dela, ausente.
  valor_pago_unit?: number | null
  escolha_tipo: EscolhaTroca | null
  escolha_opcao_id: string | null
  concluida: boolean
  // Aprovada pela equipe (a cliente respondeu no WhatsApp).
  escolha_equipe: boolean
  // Diferença da peça já trocada (positivo = a cliente paga, negativo = crédito); nulo até concluir.
  resultado: number | null
  // Peça nova escolhida (só quando a escolha foi uma opção).
  nova: { foto_url: string | null; nome: string; variante: string | null; sku: string | null } | null
  // Carrinho da cliente: quantas unidades de cada opção. Valores prontos do banco.
  carrinho?: { opcao_id: string; qtd: number }[]
  valor_escolhido?: number
  unidades?: number
  // Todas as peças novas (quando concluída).
  novas?: { foto_url: string | null; nome: string; variante: string | null; sku: string | null; qtd: number }[]
  opcoes: {
    id: string
    foto_url: string | null
    nome: string
    variante: string | null
    sku: string | null
    valor: number
    valor_unit?: number
    diferenca: number
    situacao: SituacaoTroca
  }[]
}

export type TrocaPublica = {
  numero: string
  cliente: string | null
  status: StatusTroca
  // diferenca é a líquida (depois do que a loja cobre); cada opção traz a diferença cheia.
  resumo: { total_pago: number; diferenca: number; diferenca_bruta?: number; coberto?: number; cobrir_ate?: number; pecas_total: number; pecas_respondidas: number }
  pecas: TrocaPublicaPeca[]
}
