import type { StatusItem, StatusPedido } from "./status"

export type Origem = "shopify" | "whatsapp"
export type OrigemItem = "shopify" | "clube" | "avulso"

export type Pedido = {
  id: string
  numero: string
  origem: Origem
  status: StatusPedido
  status_desde: string
  cliente_nome: string | null
  cliente_telefone: string | null
  cliente_email: string | null
  valor_total: number | null
  shopify_order_id: number | null
  shopify_url: string | null
  carrinho_url: string | null
  rastreio: string | null
  observacoes: string | null
  pedido_em: string
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
}

export type PedidoComItens = Pedido & { pedido_itens: Item[] }

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
