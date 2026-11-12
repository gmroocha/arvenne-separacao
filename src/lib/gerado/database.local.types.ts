// GERADO por npm run tipos:local a partir das migrations posteriores a 20261118210000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
    catalogo_sincronizacao: {
      Row: {
        modo: string
        iniciado_em: string
        concluido_em: string
        variantes: number
      }
      Insert: {
        modo: string
        iniciado_em: string
        concluido_em?: string
        variantes?: number
      }
      Update: {
        modo?: string
        iniciado_em?: string
        concluido_em?: string
        variantes?: number
      }
      Relationships: []
    }
  }
  Views: {
    v_pedidos: {
      Row: {
        id: string | null
        numero: string | null
        origem: string | null
        status: string | null
        status_desde: string | null
        cliente_nome: string | null
        cliente_telefone: string | null
        cliente_email: string | null
        valor_total: number | null
        shopify_order_id: number | null
        shopify_url: string | null
        carrinho_url: string | null
        rastreio: string | null
        observacoes: string | null
        pedido_em: string | null
        created_at: string | null
        updated_at: string | null
        cliente_id: string | null
        cliente_cpf: string | null
        entrega_cep: string | null
        entrega_logradouro: string | null
        entrega_numero: string | null
        entrega_complemento: string | null
        entrega_bairro: string | null
        entrega_cidade: string | null
        entrega_uf: string | null
        desconto_tipo: string | null
        desconto_valor: number | null
        cupom: string | null
        desconto_codigos: (string)[] | null
        frete_tipo: string | null
        frete_pago_por: string | null
        frete_cobrado: number | null
        frete_custo: number | null
        forma_pagamento: string | null
        valor_pago: number | null
        pago_em: string | null
        data_compra: string | null
        token_publico: string | null
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
        subtotal: number | null
        qtd_pecas: number | null
        qtd_linhas: number | null
        qtd_encontradas: number | null
        qtd_problemas: number | null
        qtd_conferidas: number | null
        qtd_etiquetadas: number | null
        qtd_bipadas: number | null
        fotos: Json | null
        desconto: number | null
        frete_na_conta: number | null
        fase: string | null
        total: number | null
        valor_pecas_com_desconto: number | null
        frete_diferenca: number | null
        pendente_rastreio: boolean | null
        prazo: string | null
        prazo_horas_uteis: number | null
        cliente_razao_social: string | null
        cliente_ie: string | null
        desconto_pix: number | null
        frete_original: number | null
        desconto_frete: number | null
        acerto_pendente: boolean | null
        a_devolver: number | null
        valor_removido: number | null
        troca_coberto: number | null
        qtd_adicionais: number | null
        valor_somado: number | null
        valor_pago_somado: number | null
        total_geral: number | null
        partes: Json | null
        somar_em: string | null
        somada_em: string | null
        total_pago: number | null
        somada_a_numero: string | null
        etapas_permitidas: Json | null
        valor_pecas_pacote: number | null
      }
      Relationships: []
    }
  }
  Functions: {
    tg_troca_escolhas_historico: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_troca_opcoes_historico: { Args: Record<PropertyKey, never>; Returns: string | null }
    valor_linha_shopify: { Args: { i: string | null; p_linha: string | null; p_qtd: number | null; p_valor: number | null }; Returns: number | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
