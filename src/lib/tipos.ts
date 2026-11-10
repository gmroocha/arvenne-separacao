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
  pedido_em: string
  created_at: string
  // Calculados pela view v_pedidos
  subtotal: number
  desconto: number
  frete_na_conta: number
  total: number
  qtd_pecas: number
  qtd_linhas: number
  qtd_encontradas: number
  qtd_problemas: number
  qtd_conferidas: number
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
  status: StatusItem
  observacao: string | null
  ordem: number
  conferido_em: string | null
}

export type Evento = {
  id: number
  tipo: "criado" | "status" | "item" | "nota"
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
  nome: string
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
  cupom: string | null
  frete_tipo: FreteTipo | null
  frete_cobrado: number
  total: number
}
