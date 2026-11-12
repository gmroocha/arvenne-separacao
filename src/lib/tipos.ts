import type { Database } from './gerado/database.local.types'
type Tables<N extends keyof Database['public']['Tables']> = Database['public']['Tables'][N]['Row']
type Views<N extends keyof Database['public']['Views']> = Database['public']['Views'][N]['Row']
type Obrigatorios<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }
import type { Fase, StatusItem, StatusPedido } from "./status"

export type Origem = "shopify" | "whatsapp"
export type OrigemItem = "shopify" | "clube" | "avulso"

export type DescontoTipo = "valor" | "percentual"
export type FreteTipo = "PAC" | "SEDEX" | "retirada" | "outro"
export type FretePagoPor = "cliente" | "arvenne"

// Uma venda somada a um pedido (v_pedidos.partes).
export type ParteSomada = {
  id: string
  numero: string
  pago_em: string | null
  forma_pagamento: string | null
  valor_pago: number | null
  somada_valor: number | null
  qtd_pecas: number
}

// Uma linha de v_pedidos: colunas de pedidos + o que o banco calcula (a tela só formata).
export type Pedido = Omit<Obrigatorios<Views<'v_pedidos'>, 'id' | 'numero' | 'status_desde' | 'pedido_em' | 'created_at' | 'token_publico' | 'subtotal' | 'desconto' | 'desconto_pix' | 'frete_na_conta' | 'total' | 'qtd_pecas' | 'qtd_linhas' | 'qtd_encontradas' | 'qtd_problemas' | 'qtd_conferidas' | 'qtd_etiquetadas' | 'qtd_bipadas' | 'valor_pecas_com_desconto' | 'acerto_pendente' | 'pendente_rastreio' | 'troca_coberto' | 'qtd_adicionais' | 'valor_somado' | 'valor_pago_somado' | 'total_geral'>, 'origem' | 'status' | 'fase' | 'fotos' | 'partes' | 'desconto_tipo' | 'frete_tipo' | 'frete_pago_por'> & {
  origem: Origem; status: StatusPedido; fase: Fase
  fotos: string[]; partes: ParteSomada[]
  desconto_tipo: DescontoTipo | null; frete_tipo: FreteTipo | null; frete_pago_por: FretePagoPor | null
}

export type Item = Omit<Tables<'pedido_itens'>, 'origem' | 'status'> & { origem: OrigemItem; status: StatusItem }

export type ResultadoBipagem = "ok" | "fora_do_pedido" | "excedente"

export type Evento = Tables<'pedido_eventos'>

export type PecaClube = Tables<'pecas_clube'>

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

export type Cliente = Tables<'clientes'>

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
  adicionais?: { nome: string; variante: string | null; sku: string | null; foto_url: string | null; qtd: number; preco: number | null }[]
  valor_somado?: number
  total_geral?: number
  somada_a?: string | null
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

export type TrocaOpcao = Omit<Tables<'troca_opcoes'>, 'origem' | 'motivo'> & {
  origem: 'site' | 'clube'; motivo: 'mesmo_modelo' | 'mesmo_valor' | 'busca'
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
export type TrocaEscolha = Tables<'troca_escolhas'>

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
export type TrocaPeca = Omit<Tables<'troca_pecas'>, 'escolha_tipo' | 'escolhida_por'> & {
  escolha_tipo: EscolhaTroca | null; escolhida_por: 'cliente' | 'equipe' | null
  opcoes: TrocaOpcao[]; valores: TrocaValor[]; escolhas?: TrocaEscolha[]; carrinho?: TrocaCarrinho | null
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

export type Troca = Omit<Tables<'trocas'>, 'status' | 'acerto_status'> & {
  status: StatusTroca; acerto_status: StatusAcerto | null; pecas: TrocaPeca[]; resumo: TrocaResumo | null
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
