// GERADO por npm run tipos:local a partir das migrations posteriores a 20261122170000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
    pedidos: {
      Row: {
        id: string
        numero: string
        origem: string
        status: string
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
        created_at: string
        updated_at: string
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
        frete_tipo: string | null
        frete_pago_por: string | null
        frete_cobrado: number | null
        frete_custo: number | null
        forma_pagamento: string | null
        valor_pago: number | null
        pago_em: string | null
        data_compra: string | null
        token_publico: string
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
        desconto_codigos: (string)[] | null
        shopify_bruto: Json | null
        cliente_razao_social: string | null
        cliente_ie: string | null
        frete_original: number | null
        desconto_frete: number | null
        pago_em_estimado: boolean
        somar_em: string | null
        somada_em: string | null
        somada_valor: number | null
        somada_retrato: Json | null
        financeiro_retrato: Json | null
        acerto_troca_id: string | null
        etapa_antes_desvio: string | null
        descontos: Json | null
        excluido_em: string | null
        excluido_por: string | null
        frete_peso_g: number | null
        responsaveis: Json
        entregue_em: string | null
      }
      Insert: {
        id?: string
        numero?: string
        origem: string
        status?: string
        status_desde?: string
        cliente_nome?: string | null
        cliente_telefone?: string | null
        cliente_email?: string | null
        valor_total?: number | null
        shopify_order_id?: number | null
        shopify_url?: string | null
        carrinho_url?: string | null
        rastreio?: string | null
        observacoes?: string | null
        pedido_em?: string
        created_at?: string
        updated_at?: string
        cliente_id?: string | null
        cliente_cpf?: string | null
        entrega_cep?: string | null
        entrega_logradouro?: string | null
        entrega_numero?: string | null
        entrega_complemento?: string | null
        entrega_bairro?: string | null
        entrega_cidade?: string | null
        entrega_uf?: string | null
        desconto_tipo?: string | null
        desconto_valor?: number | null
        cupom?: string | null
        frete_tipo?: string | null
        frete_pago_por?: string | null
        frete_cobrado?: number | null
        frete_custo?: number | null
        forma_pagamento?: string | null
        valor_pago?: number | null
        pago_em?: string | null
        data_compra?: string | null
        token_publico?: string
        nf_numero?: string | null
        nf_emitida_em?: string | null
        frete_gerado_em?: string | null
        frete_servico?: string | null
        rastreio_url?: string | null
        pedido_fornecedor_numero?: string | null
        pedido_fornecedor_em?: string | null
        embalado_em?: string | null
        postado_em?: string | null
        rastreio_enviado_em?: string | null
        desconto_codigos?: (string)[] | null
        shopify_bruto?: Json | null
        cliente_razao_social?: string | null
        cliente_ie?: string | null
        frete_original?: number | null
        desconto_frete?: number | null
        pago_em_estimado?: boolean
        somar_em?: string | null
        somada_em?: string | null
        somada_valor?: number | null
        somada_retrato?: Json | null
        financeiro_retrato?: Json | null
        acerto_troca_id?: string | null
        etapa_antes_desvio?: string | null
        descontos?: Json | null
        excluido_em?: string | null
        excluido_por?: string | null
        frete_peso_g?: number | null
        responsaveis?: Json
        entregue_em?: string | null
      }
      Update: {
        id?: string
        numero?: string
        origem?: string
        status?: string
        status_desde?: string
        cliente_nome?: string | null
        cliente_telefone?: string | null
        cliente_email?: string | null
        valor_total?: number | null
        shopify_order_id?: number | null
        shopify_url?: string | null
        carrinho_url?: string | null
        rastreio?: string | null
        observacoes?: string | null
        pedido_em?: string
        created_at?: string
        updated_at?: string
        cliente_id?: string | null
        cliente_cpf?: string | null
        entrega_cep?: string | null
        entrega_logradouro?: string | null
        entrega_numero?: string | null
        entrega_complemento?: string | null
        entrega_bairro?: string | null
        entrega_cidade?: string | null
        entrega_uf?: string | null
        desconto_tipo?: string | null
        desconto_valor?: number | null
        cupom?: string | null
        frete_tipo?: string | null
        frete_pago_por?: string | null
        frete_cobrado?: number | null
        frete_custo?: number | null
        forma_pagamento?: string | null
        valor_pago?: number | null
        pago_em?: string | null
        data_compra?: string | null
        token_publico?: string
        nf_numero?: string | null
        nf_emitida_em?: string | null
        frete_gerado_em?: string | null
        frete_servico?: string | null
        rastreio_url?: string | null
        pedido_fornecedor_numero?: string | null
        pedido_fornecedor_em?: string | null
        embalado_em?: string | null
        postado_em?: string | null
        rastreio_enviado_em?: string | null
        desconto_codigos?: (string)[] | null
        shopify_bruto?: Json | null
        cliente_razao_social?: string | null
        cliente_ie?: string | null
        frete_original?: number | null
        desconto_frete?: number | null
        pago_em_estimado?: boolean
        somar_em?: string | null
        somada_em?: string | null
        somada_valor?: number | null
        somada_retrato?: Json | null
        financeiro_retrato?: Json | null
        acerto_troca_id?: string | null
        etapa_antes_desvio?: string | null
        descontos?: Json | null
        excluido_em?: string | null
        excluido_por?: string | null
        frete_peso_g?: number | null
        responsaveis?: Json
        entregue_em?: string | null
      }
      Relationships: []
    }
  }
  Views: {
    v_pedidos_operacao: {
      Row: {
        id: string | null
        numero: string | null
        origem: string | null
        status: string | null
        status_desde: string | null
        cliente_nome: string | null
        cliente_telefone: string | null
        shopify_url: string | null
        pedido_em: string | null
        etapa_antes_desvio: string | null
        responsaveis: Json | null
        qtd_pecas: number | null
        qtd_linhas: number | null
        qtd_encontradas: number | null
        qtd_conferidas: number | null
        qtd_bipadas: number | null
        fotos: Json | null
        fase: string | null
        pendente_rastreio: boolean | null
        prazo: string | null
        prazo_horas_uteis: number | null
        acerto_pendente: boolean | null
        a_devolver: number | null
        etapas_permitidas: Json | null
      }
      Relationships: []
    }
    v_producao_pessoa: {
      Row: {
        dia: string | null
        pessoa: string | null
        etapa: string | null
        pedidos: number | null
        pecas: number | null
      }
      Relationships: []
    }
  }
  Functions: {
    avancar_pecas: { Args: { p_pedido: string | null }; Returns: string | null }
    excluir_membro: { Args: { p_membro: string | null }; Returns: undefined | null }
    marcar_pecas: { Args: { p_pedido: string | null; p_marcas: Json | null }; Returns: Json | null }
    mover_etapa: { Args: { p_pedido: string | null; p_destino: string | null }; Returns: string | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
