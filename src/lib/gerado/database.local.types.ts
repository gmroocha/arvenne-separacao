// GERADO por npm run tipos:local a partir das migrations posteriores a 20261116090000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
    movimentos_financeiros: {
      Row: {
        id: number
        pedido_id: string
        troca_id: string | null
        tipo: string
        valor: number
        estorna_id: number | null
        detalhes: Json
        registrado_em: string
        usuario_email: string | null
      }
      Insert: {
        id?: number
        pedido_id: string
        troca_id?: string | null
        tipo: string
        valor: number
        estorna_id?: number | null
        detalhes?: Json
        registrado_em?: string
        usuario_email?: string | null
      }
      Update: {
        id?: number
        pedido_id?: string
        troca_id?: string | null
        tipo?: string
        valor?: number
        estorna_id?: number | null
        detalhes?: Json
        registrado_em?: string
        usuario_email?: string | null
      }
      Relationships: []
    }
    pedido_itens: {
      Row: {
        id: string
        pedido_id: string
        origem: string
        shopify_variant_id: number | null
        peca_clube_id: string | null
        sku: string | null
        nome: string
        variante: string | null
        foto_url: string | null
        qtd: number
        preco: number | null
        status: string
        observacao: string | null
        ordem: number
        created_at: string
        updated_at: string
        conferido_em: string | null
        etiquetado_em: string | null
        etiqueta_previa: boolean
        qtd_bipada: number
        bipado_em: string | null
        preco_pago: number | null
        shopify_line_id: string | null
        removido_em: string | null
        devolvido_em: string | null
        reembolsado_shopify_em: string | null
        adicional: boolean
        venda_origem_id: string | null
        valor_pago_linha: number | null
        troca_peca_origem_id: string | null
      }
      Insert: {
        id?: string
        pedido_id: string
        origem: string
        shopify_variant_id?: number | null
        peca_clube_id?: string | null
        sku?: string | null
        nome: string
        variante?: string | null
        foto_url?: string | null
        qtd?: number
        preco?: number | null
        status?: string
        observacao?: string | null
        ordem?: number
        created_at?: string
        updated_at?: string
        conferido_em?: string | null
        etiquetado_em?: string | null
        etiqueta_previa?: boolean
        qtd_bipada?: number
        bipado_em?: string | null
        preco_pago?: number | null
        shopify_line_id?: string | null
        removido_em?: string | null
        devolvido_em?: string | null
        reembolsado_shopify_em?: string | null
        adicional?: boolean
        venda_origem_id?: string | null
        valor_pago_linha?: number | null
        troca_peca_origem_id?: string | null
      }
      Update: {
        id?: string
        pedido_id?: string
        origem?: string
        shopify_variant_id?: number | null
        peca_clube_id?: string | null
        sku?: string | null
        nome?: string
        variante?: string | null
        foto_url?: string | null
        qtd?: number
        preco?: number | null
        status?: string
        observacao?: string | null
        ordem?: number
        created_at?: string
        updated_at?: string
        conferido_em?: string | null
        etiquetado_em?: string | null
        etiqueta_previa?: boolean
        qtd_bipada?: number
        bipado_em?: string | null
        preco_pago?: number | null
        shopify_line_id?: string | null
        removido_em?: string | null
        devolvido_em?: string | null
        reembolsado_shopify_em?: string | null
        adicional?: boolean
        venda_origem_id?: string | null
        valor_pago_linha?: number | null
        troca_peca_origem_id?: string | null
      }
      Relationships: []
    }
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
      }
      Relationships: []
    }
    trocas: {
      Row: {
        id: string
        pedido_id: string
        token: string
        status: string
        enviada_em: string | null
        respondida_em: string | null
        concluida_em: string | null
        criado_por: string | null
        created_at: string
        updated_at: string
        fator_desconto: number
        acerto_status: string | null
        acerto_em: string | null
        acerto_por: string | null
        cobrir_ate: number
        acerto_controle_novo: boolean
      }
      Insert: {
        id?: string
        pedido_id: string
        token?: string
        status?: string
        enviada_em?: string | null
        respondida_em?: string | null
        concluida_em?: string | null
        criado_por?: string | null
        created_at?: string
        updated_at?: string
        fator_desconto: number
        acerto_status?: string | null
        acerto_em?: string | null
        acerto_por?: string | null
        cobrir_ate?: number
        acerto_controle_novo?: boolean
      }
      Update: {
        id?: string
        pedido_id?: string
        token?: string
        status?: string
        enviada_em?: string | null
        respondida_em?: string | null
        concluida_em?: string | null
        criado_por?: string | null
        created_at?: string
        updated_at?: string
        fator_desconto?: number
        acerto_status?: string | null
        acerto_em?: string | null
        acerto_por?: string | null
        cobrir_ate?: number
        acerto_controle_novo?: boolean
      }
      Relationships: []
    }
    vistoria_execucoes: {
      Row: {
        id: number
        executada_em: string
        ocorrencias: Json
        qtd_ocorrencias: number
      }
      Insert: {
        id?: number
        executada_em?: string
        ocorrencias: Json
        qtd_ocorrencias: number
      }
      Update: {
        id?: number
        executada_em?: string
        ocorrencias?: Json
        qtd_ocorrencias?: number
      }
      Relationships: []
    }
  }
  Views: {
    v_cobertura_troca_peca: {
      Row: {
        troca_peca_id: string | null
        troca_id: string | null
        pedido_id: string | null
        venda_origem_id: string | null
        coberto: number | null
      }
      Relationships: []
    }
    v_item_liquido: {
      Row: {
        id: string | null
        pedido_id: string | null
        venda_origem_id: string | null
        valor_antes_cobertura: number | null
        coberto: number | null
        valor_liquido: number | null
      }
      Relationships: []
    }
    v_parte_somada: {
      Row: {
        venda_id: string | null
        pedido_id: string | null
        valor_atual: number | null
        valor_retirado: number | null
        coberto: number | null
      }
      Relationships: []
    }
    v_pedido_acerto: {
      Row: {
        pedido_id: string | null
        valor_pago_original: number | null
        valor_pago_pecas_trocadas: number | null
        total_a_cobrar: number | null
        total_credito: number | null
        saldo: number | null
        novo_total: number | null
        troca_id: string | null
        acerto_status: string | null
        acerto_em: string | null
        acerto_por: string | null
        pecas: Json | null
        coberto: number | null
        total_pago_atual: number | null
        bloqueio: string | null
      }
      Relationships: []
    }
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
      }
      Relationships: []
    }
    v_vistoria_resumo: {
      Row: {
        id: number | null
        executada_em: string | null
        qtd_ocorrencias: number | null
        ocorrencias: Json | null
      }
      Relationships: []
    }
  }
  Functions: {
    fechar_financeiro: { Args: { p_pedido: string | null }; Returns: undefined | null }
    listar_inconsistencias: { Args: Record<PropertyKey, never>; Returns: { pedido_id: string | null; numero: string | null; regra: string | null; detalhe: string | null }[] }
    reavaliar_etapa: { Args: { p_pedido: string | null }; Returns: undefined | null }
    reconciliar_acertos: { Args: { p_pedido: string | null; p_priorizar?: string | null }; Returns: undefined | null }
    registrar_movimento_troca: { Args: { p_troca: string | null; p_anterior: string | null; p_novo: string | null }; Returns: number | null }
    registrar_vistoria: { Args: Record<PropertyKey, never>; Returns: number | null }
    regras_etapas: { Args: { p: Json | null }; Returns: Json | null }
    saldo_financeiro: { Args: { p_pedido: string | null }; Returns: number | null }
    substituir_item: { Args: { p_item: string | null; p_itens: Json | null }; Returns: string | null }
    tg_documento_reaberto: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_estorno_validar: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_fechar_financeiro: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_financeiro_imutavel: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_movimento_imutavel: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_retrato_somada_imutavel: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_saldo_itens_alterado: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_saldo_pagamento_alterado: { Args: Record<PropertyKey, never>; Returns: string | null }
    tg_trabalho_reaberto: { Args: Record<PropertyKey, never>; Returns: string | null }
    troca_saldo_liquido: { Args: { p_troca: string | null }; Returns: number | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
