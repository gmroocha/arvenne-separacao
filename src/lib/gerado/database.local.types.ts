// GERADO por npm run tipos:local a partir das migrations posteriores a 20261124110000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
    equipe: {
      Row: {
        id: string
        nome: string
        email: string | null
        ativo: boolean
        created_at: string
        papel: string
        usuario: string | null
        user_id: string | null
      }
      Insert: {
        id?: string
        nome: string
        email?: string | null
        ativo?: boolean
        created_at?: string
        papel?: string
        usuario?: string | null
        user_id?: string | null
      }
      Update: {
        id?: string
        nome?: string
        email?: string | null
        ativo?: boolean
        created_at?: string
        papel?: string
        usuario?: string | null
        user_id?: string | null
      }
      Relationships: []
    }
    metas_etapa: {
      Row: {
        etapa: string
        meta_horas_uteis: number
      }
      Insert: {
        etapa: string
        meta_horas_uteis: number
      }
      Update: {
        etapa?: string
        meta_horas_uteis?: number
      }
      Relationships: []
    }
    ocorrencias: {
      Row: {
        id: string
        pedido_id: string
        item_id: string | null
        tipo: string
        motivo: string
        etapa: string
        responsavel_id: string | null
        conferente_id: string | null
        registrado_por: string | null
        observacao: string | null
        created_at: string
        anulada_em: string | null
        anulada_por: string | null
      }
      Insert: {
        id?: string
        pedido_id: string
        item_id?: string | null
        tipo: string
        motivo: string
        etapa: string
        responsavel_id?: string | null
        conferente_id?: string | null
        registrado_por?: string | null
        observacao?: string | null
        created_at?: string
        anulada_em?: string | null
        anulada_por?: string | null
      }
      Update: {
        id?: string
        pedido_id?: string
        item_id?: string | null
        tipo?: string
        motivo?: string
        etapa?: string
        responsavel_id?: string | null
        conferente_id?: string | null
        registrado_por?: string | null
        observacao?: string | null
        created_at?: string
        anulada_em?: string | null
        anulada_por?: string | null
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
        entrada: string | null
        nota: string | null
        separado_por: string | null
        conferido_por: string | null
        bipado_por: string | null
        falta_por: string | null
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
        entrada?: string | null
        nota?: string | null
        separado_por?: string | null
        conferido_por?: string | null
        bipado_por?: string | null
        falta_por?: string | null
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
        entrada?: string | null
        nota?: string | null
        separado_por?: string | null
        conferido_por?: string | null
        bipado_por?: string | null
        falta_por?: string | null
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
        etapa_antes_desvio: string | null
        descontos: Json | null
        excluido_em: string | null
        excluido_por: string | null
        frete_peso_g: number | null
        responsaveis: Json
        entregue_em: string | null
        nf_chave: string | null
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
        nf_chave?: string | null
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
        nf_chave?: string | null
      }
      Relationships: []
    }
    responsavel_padrao: {
      Row: {
        etapa: string
        membro_id: string | null
      }
      Insert: {
        etapa: string
        membro_id?: string | null
      }
      Update: {
        etapa?: string
        membro_id?: string | null
      }
      Relationships: []
    }
  }
  Views: {
    v_ocorrencias: {
      Row: {
        id: string | null
        pedido_id: string | null
        item_id: string | null
        tipo: string | null
        motivo: string | null
        etapa: string | null
        responsavel_id: string | null
        conferente_id: string | null
        registrado_por: string | null
        observacao: string | null
        created_at: string | null
        anulada_em: string | null
        anulada_por: string | null
        responsavel_nome: string | null
        conferente_nome: string | null
        registrado_por_nome: string | null
        numero: string | null
        cliente_nome: string | null
        sku: string | null
        item_nome: string | null
        variante: string | null
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
        valor_pecas_pacote: number | null
        etapa_antes_desvio: string | null
        desconto_sem_cobertura: number | null
        desconto_percentual: number | null
        descontos: Json | null
        frete_peso_g: number | null
        responsaveis: Json | null
        nf_chave: string | null
      }
      Relationships: []
    }
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
        nf_chave: string | null
        horas_na_etapa: number | null
        termometro: string | null
        troca_decididas: number | null
        troca_pecas_abertas: number | null
        cliente_decidiu: boolean | null
      }
      Relationships: []
    }
  }
  Functions: {
    anular_ocorrencia: { Args: { p_id: string | null }; Returns: undefined | null }
    autor_da_etapa: { Args: { p_pedido: string | null; p_etapa: string | null }; Returns: string | null }
    decisao_troca: { Args: { p_pedido: string | null; p_status: string | null }; Returns: Json | null }
    etapa_da_esteira: { Args: { p_status: string | null; p_antes: string | null }; Returns: string | null }
    etapa_da_ocorrencia: { Args: { p_motivo: string | null }; Returns: string | null }
    exigir_gestor: { Args: Record<PropertyKey, never>; Returns: undefined | null }
    exigir_pedido: { Args: { p_pedido: string | null }; Returns: undefined | null }
    exigir_pedido_da_peca_troca: { Args: { p_peca: string | null }; Returns: undefined | null }
    exigir_pedido_da_troca: { Args: { p_troca: string | null }; Returns: undefined | null }
    exigir_pedido_do_credito: { Args: { p_credito: string | null }; Returns: undefined | null }
    exigir_pedido_do_item: { Args: { p_item: string | null }; Returns: undefined | null }
    membro_atual: { Args: Record<PropertyKey, never>; Returns: string | null }
    pode_ver_pedido: { Args: { p_pedido: string | null }; Returns: boolean | null }
    preencher_responsaveis_padrao: { Args: Record<PropertyKey, never>; Returns: number | null }
    registrado_por_atual: { Args: Record<PropertyKey, never>; Returns: string | null }
    registrar_erro_bipagem: { Args: { p_item: string | null; p_motivo: string | null; p_obs?: string | null; p_responsavel?: string | null }; Returns: string | null }
    registrar_falta_indevida: { Args: { p_item: string | null }; Returns: undefined | null }
    registrar_problema_entrega: { Args: { p_pedido: string | null; p_motivo: string | null; p_etapa?: string | null; p_responsavel?: string | null; p_item?: string | null; p_obs?: string | null }; Returns: string | null }
    responsavel_padrao_de: { Args: { p_etapa: string | null }; Returns: string | null }
    responsavel_sugerido: { Args: { p_pedido: string | null; p_etapa: string | null; p_item?: string | null }; Returns: string | null }
    rotulo_motivo: { Args: { p_motivo: string | null }; Returns: string | null }
    sou_sistema: { Args: Record<PropertyKey, never>; Returns: boolean | null }
    termometro_etapa: { Args: { p_status: string | null; p_horas: number | null }; Returns: string | null }
    tg_itens_limpa_por: { Args: Record<PropertyKey, never>; Returns: string | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
