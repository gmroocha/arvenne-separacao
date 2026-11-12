export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bipagens: {
        Row: {
          codigo: string
          created_at: string
          id: number
          item_id: string | null
          pedido_id: string
          resultado: string
          usuario_email: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: never
          item_id?: string | null
          pedido_id: string
          resultado: string
          usuario_email?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: never
          item_id?: string | null
          pedido_id?: string
          resultado?: string
          usuario_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bipagens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bipagens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bipagens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_site: {
        Row: {
          atualizado_em: string
          foto_url: string | null
          preco: number | null
          produto: string
          produto_id: number | null
          sku: string | null
          status: string | null
          variant_id: number
          variante: string | null
          vende_sem_estoque: boolean | null
        }
        Insert: {
          atualizado_em?: string
          foto_url?: string | null
          preco?: number | null
          produto: string
          produto_id?: number | null
          sku?: string | null
          status?: string | null
          variant_id: number
          variante?: string | null
          vende_sem_estoque?: boolean | null
        }
        Update: {
          atualizado_em?: string
          foto_url?: string | null
          preco?: number | null
          produto?: string
          produto_id?: number | null
          sku?: string | null
          status?: string | null
          variant_id?: number
          variante?: string | null
          vende_sem_estoque?: boolean | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          ie: string | null
          logradouro: string | null
          nome: string
          numero: string | null
          razao_social: string | null
          shopify_customer_id: number | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ie?: string | null
          logradouro?: string | null
          nome: string
          numero?: string | null
          razao_social?: string | null
          shopify_customer_id?: number | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ie?: string | null
          logradouro?: string | null
          nome?: string
          numero?: string | null
          razao_social?: string | null
          shopify_customer_id?: number | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          created_at: string
          id: string
          pagina: string | null
          pedido_id: string | null
          resolvido_em: string | null
          texto: string
          usuario_email: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pagina?: string | null
          pedido_id?: string | null
          resolvido_em?: string | null
          texto: string
          usuario_email?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pagina?: string | null
          pedido_id?: string | null
          resolvido_em?: string | null
          texto?: string
          usuario_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          data: string
          nome: string
        }
        Insert: {
          data: string
          nome: string
        }
        Update: {
          data?: string
          nome?: string
        }
        Relationships: []
      }
      pecas_clube: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          foto_url: string | null
          id: string
          nome: string
          preco: number | null
          variante: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome: string
          preco?: number | null
          variante?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          foto_url?: string | null
          id?: string
          nome?: string
          preco?: number | null
          variante?: string | null
        }
        Relationships: []
      }
      pedido_eventos: {
        Row: {
          created_at: string
          de: string | null
          id: number
          item_id: string | null
          para: string | null
          pedido_id: string
          texto: string | null
          tipo: string
          usuario_email: string | null
        }
        Insert: {
          created_at?: string
          de?: string | null
          id?: never
          item_id?: string | null
          para?: string | null
          pedido_id: string
          texto?: string | null
          tipo: string
          usuario_email?: string | null
        }
        Update: {
          created_at?: string
          de?: string | null
          id?: never
          item_id?: string | null
          para?: string | null
          pedido_id?: string
          texto?: string | null
          tipo?: string
          usuario_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          adicional: boolean
          bipado_em: string | null
          conferido_em: string | null
          created_at: string
          devolvido_em: string | null
          etiqueta_previa: boolean
          etiquetado_em: string | null
          foto_url: string | null
          id: string
          nome: string
          observacao: string | null
          ordem: number
          origem: string
          peca_clube_id: string | null
          pedido_id: string
          preco: number | null
          preco_pago: number | null
          qtd: number
          qtd_bipada: number
          reembolsado_shopify_em: string | null
          removido_em: string | null
          shopify_line_id: string | null
          shopify_variant_id: number | null
          sku: string | null
          status: string
          updated_at: string
          variante: string | null
          venda_origem_id: string | null
        }
        Insert: {
          adicional?: boolean
          bipado_em?: string | null
          conferido_em?: string | null
          created_at?: string
          devolvido_em?: string | null
          etiqueta_previa?: boolean
          etiquetado_em?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          observacao?: string | null
          ordem?: number
          origem: string
          peca_clube_id?: string | null
          pedido_id: string
          preco?: number | null
          preco_pago?: number | null
          qtd?: number
          qtd_bipada?: number
          reembolsado_shopify_em?: string | null
          removido_em?: string | null
          shopify_line_id?: string | null
          shopify_variant_id?: number | null
          sku?: string | null
          status?: string
          updated_at?: string
          variante?: string | null
          venda_origem_id?: string | null
        }
        Update: {
          adicional?: boolean
          bipado_em?: string | null
          conferido_em?: string | null
          created_at?: string
          devolvido_em?: string | null
          etiqueta_previa?: boolean
          etiquetado_em?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          ordem?: number
          origem?: string
          peca_clube_id?: string | null
          pedido_id?: string
          preco?: number | null
          preco_pago?: number | null
          qtd?: number
          qtd_bipada?: number
          reembolsado_shopify_em?: string | null
          removido_em?: string | null
          shopify_line_id?: string | null
          shopify_variant_id?: number | null
          sku?: string | null
          status?: string
          updated_at?: string
          variante?: string | null
          venda_origem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_peca_clube_id_fkey"
            columns: ["peca_clube_id"]
            isOneToOne: false
            referencedRelation: "pecas_clube"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_venda_origem_id_fkey"
            columns: ["venda_origem_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_venda_origem_id_fkey"
            columns: ["venda_origem_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          carrinho_url: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_id: string | null
          cliente_ie: string | null
          cliente_nome: string | null
          cliente_razao_social: string | null
          cliente_telefone: string | null
          created_at: string
          cupom: string | null
          data_compra: string | null
          desconto_codigos: string[] | null
          desconto_frete: number | null
          desconto_tipo: string | null
          desconto_valor: number | null
          embalado_em: string | null
          entrega_bairro: string | null
          entrega_cep: string | null
          entrega_cidade: string | null
          entrega_complemento: string | null
          entrega_logradouro: string | null
          entrega_numero: string | null
          entrega_uf: string | null
          forma_pagamento: string | null
          frete_cobrado: number | null
          frete_custo: number | null
          frete_gerado_em: string | null
          frete_original: number | null
          frete_pago_por: string | null
          frete_servico: string | null
          frete_tipo: string | null
          id: string
          nf_emitida_em: string | null
          nf_numero: string | null
          numero: string
          observacoes: string | null
          origem: string
          pago_em: string | null
          pago_em_estimado: boolean
          pedido_em: string
          pedido_fornecedor_em: string | null
          pedido_fornecedor_numero: string | null
          postado_em: string | null
          rastreio: string | null
          rastreio_enviado_em: string | null
          rastreio_url: string | null
          shopify_bruto: Json | null
          shopify_order_id: number | null
          shopify_url: string | null
          somada_em: string | null
          somada_valor: number | null
          somar_em: string | null
          status: string
          status_desde: string
          token_publico: string
          updated_at: string
          valor_pago: number | null
          valor_total: number | null
        }
        Insert: {
          carrinho_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_id?: string | null
          cliente_ie?: string | null
          cliente_nome?: string | null
          cliente_razao_social?: string | null
          cliente_telefone?: string | null
          created_at?: string
          cupom?: string | null
          data_compra?: string | null
          desconto_codigos?: string[] | null
          desconto_frete?: number | null
          desconto_tipo?: string | null
          desconto_valor?: number | null
          embalado_em?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_logradouro?: string | null
          entrega_numero?: string | null
          entrega_uf?: string | null
          forma_pagamento?: string | null
          frete_cobrado?: number | null
          frete_custo?: number | null
          frete_gerado_em?: string | null
          frete_original?: number | null
          frete_pago_por?: string | null
          frete_servico?: string | null
          frete_tipo?: string | null
          id?: string
          nf_emitida_em?: string | null
          nf_numero?: string | null
          numero?: string
          observacoes?: string | null
          origem: string
          pago_em?: string | null
          pago_em_estimado?: boolean
          pedido_em?: string
          pedido_fornecedor_em?: string | null
          pedido_fornecedor_numero?: string | null
          postado_em?: string | null
          rastreio?: string | null
          rastreio_enviado_em?: string | null
          rastreio_url?: string | null
          shopify_bruto?: Json | null
          shopify_order_id?: number | null
          shopify_url?: string | null
          somada_em?: string | null
          somada_valor?: number | null
          somar_em?: string | null
          status?: string
          status_desde?: string
          token_publico?: string
          updated_at?: string
          valor_pago?: number | null
          valor_total?: number | null
        }
        Update: {
          carrinho_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_id?: string | null
          cliente_ie?: string | null
          cliente_nome?: string | null
          cliente_razao_social?: string | null
          cliente_telefone?: string | null
          created_at?: string
          cupom?: string | null
          data_compra?: string | null
          desconto_codigos?: string[] | null
          desconto_frete?: number | null
          desconto_tipo?: string | null
          desconto_valor?: number | null
          embalado_em?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_logradouro?: string | null
          entrega_numero?: string | null
          entrega_uf?: string | null
          forma_pagamento?: string | null
          frete_cobrado?: number | null
          frete_custo?: number | null
          frete_gerado_em?: string | null
          frete_original?: number | null
          frete_pago_por?: string | null
          frete_servico?: string | null
          frete_tipo?: string | null
          id?: string
          nf_emitida_em?: string | null
          nf_numero?: string | null
          numero?: string
          observacoes?: string | null
          origem?: string
          pago_em?: string | null
          pago_em_estimado?: boolean
          pedido_em?: string
          pedido_fornecedor_em?: string | null
          pedido_fornecedor_numero?: string | null
          postado_em?: string | null
          rastreio?: string | null
          rastreio_enviado_em?: string | null
          rastreio_url?: string | null
          shopify_bruto?: Json | null
          shopify_order_id?: number | null
          shopify_url?: string | null
          somada_em?: string | null
          somada_valor?: number | null
          somar_em?: string | null
          status?: string
          status_desde?: string
          token_publico?: string
          updated_at?: string
          valor_pago?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_somar_em_fkey"
            columns: ["somar_em"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_somar_em_fkey"
            columns: ["somar_em"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      troca_escolhas: {
        Row: {
          created_at: string
          id: string
          opcao_id: string
          qtd: number
          seq: number
          troca_peca_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opcao_id: string
          qtd: number
          seq?: never
          troca_peca_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opcao_id?: string
          qtd?: number
          seq?: never
          troca_peca_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "troca_escolhas_opcao_id_fkey"
            columns: ["opcao_id"]
            isOneToOne: false
            referencedRelation: "troca_opcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troca_escolhas_troca_peca_id_fkey"
            columns: ["troca_peca_id"]
            isOneToOne: false
            referencedRelation: "troca_pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      troca_opcoes: {
        Row: {
          created_at: string
          foto_url: string | null
          id: string
          motivo: string
          nome: string
          ordem: number
          origem: string
          peca_clube_id: string | null
          preco: number | null
          shopify_variant_id: number | null
          sku: string | null
          troca_peca_id: string
          variante: string | null
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          id?: string
          motivo?: string
          nome: string
          ordem?: number
          origem: string
          peca_clube_id?: string | null
          preco?: number | null
          shopify_variant_id?: number | null
          sku?: string | null
          troca_peca_id: string
          variante?: string | null
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          id?: string
          motivo?: string
          nome?: string
          ordem?: number
          origem?: string
          peca_clube_id?: string | null
          preco?: number | null
          shopify_variant_id?: number | null
          sku?: string | null
          troca_peca_id?: string
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "troca_opcoes_troca_peca_id_fkey"
            columns: ["troca_peca_id"]
            isOneToOne: false
            referencedRelation: "troca_pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      troca_pecas: {
        Row: {
          concluida_em: string | null
          created_at: string
          escolha_opcao_id: string | null
          escolha_tipo: string | null
          escolhida_por: string | null
          id: string
          item_id: string
          respondida_em: string | null
          resultado_diferenca: number | null
          troca_id: string
        }
        Insert: {
          concluida_em?: string | null
          created_at?: string
          escolha_opcao_id?: string | null
          escolha_tipo?: string | null
          escolhida_por?: string | null
          id?: string
          item_id: string
          respondida_em?: string | null
          resultado_diferenca?: number | null
          troca_id: string
        }
        Update: {
          concluida_em?: string | null
          created_at?: string
          escolha_opcao_id?: string | null
          escolha_tipo?: string | null
          escolhida_por?: string | null
          id?: string
          item_id?: string
          respondida_em?: string | null
          resultado_diferenca?: number | null
          troca_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "troca_pecas_escolha_opcao_fk"
            columns: ["escolha_opcao_id"]
            isOneToOne: false
            referencedRelation: "troca_opcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troca_pecas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troca_pecas_troca_id_fkey"
            columns: ["troca_id"]
            isOneToOne: false
            referencedRelation: "trocas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troca_pecas_troca_id_fkey"
            columns: ["troca_id"]
            isOneToOne: false
            referencedRelation: "v_pedido_acerto"
            referencedColumns: ["troca_id"]
          },
          {
            foreignKeyName: "troca_pecas_troca_id_fkey"
            columns: ["troca_id"]
            isOneToOne: false
            referencedRelation: "v_troca_resumo"
            referencedColumns: ["troca_id"]
          },
        ]
      }
      trocas: {
        Row: {
          acerto_em: string | null
          acerto_por: string | null
          acerto_status: string | null
          cobrir_ate: number
          concluida_em: string | null
          created_at: string
          criado_por: string | null
          enviada_em: string | null
          fator_desconto: number
          id: string
          pedido_id: string
          respondida_em: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          acerto_em?: string | null
          acerto_por?: string | null
          acerto_status?: string | null
          cobrir_ate?: number
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          enviada_em?: string | null
          fator_desconto: number
          id?: string
          pedido_id: string
          respondida_em?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          acerto_em?: string | null
          acerto_por?: string | null
          acerto_status?: string | null
          cobrir_ate?: number
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          enviada_em?: string | null
          fator_desconto?: number
          id?: string
          pedido_id?: string
          respondida_em?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_pecas_em_varios_pedidos: {
        Row: {
          chave: string | null
          foto_url: string | null
          nome: string | null
          pedidos: Json | null
          qtd_pedidos: number | null
          qtd_total: number | null
          sku: string | null
          variante: string | null
        }
        Relationships: []
      }
      v_pedido_acerto: {
        Row: {
          acerto_em: string | null
          acerto_por: string | null
          acerto_status: string | null
          coberto: number | null
          novo_total: number | null
          pecas: Json | null
          pedido_id: string | null
          saldo: number | null
          total_a_cobrar: number | null
          total_credito: number | null
          troca_id: string | null
          valor_pago_original: number | null
          valor_pago_pecas_trocadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pedidos: {
        Row: {
          a_devolver: number | null
          acerto_pendente: boolean | null
          carrinho_url: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_id: string | null
          cliente_ie: string | null
          cliente_nome: string | null
          cliente_razao_social: string | null
          cliente_telefone: string | null
          created_at: string | null
          cupom: string | null
          data_compra: string | null
          desconto: number | null
          desconto_codigos: string[] | null
          desconto_frete: number | null
          desconto_pix: number | null
          desconto_tipo: string | null
          desconto_valor: number | null
          embalado_em: string | null
          entrega_bairro: string | null
          entrega_cep: string | null
          entrega_cidade: string | null
          entrega_complemento: string | null
          entrega_logradouro: string | null
          entrega_numero: string | null
          entrega_uf: string | null
          fase: string | null
          forma_pagamento: string | null
          fotos: Json | null
          frete_cobrado: number | null
          frete_custo: number | null
          frete_diferenca: number | null
          frete_gerado_em: string | null
          frete_na_conta: number | null
          frete_original: number | null
          frete_pago_por: string | null
          frete_servico: string | null
          frete_tipo: string | null
          id: string | null
          nf_emitida_em: string | null
          nf_numero: string | null
          numero: string | null
          observacoes: string | null
          origem: string | null
          pago_em: string | null
          partes: Json | null
          pedido_em: string | null
          pedido_fornecedor_em: string | null
          pedido_fornecedor_numero: string | null
          pendente_rastreio: boolean | null
          postado_em: string | null
          prazo: string | null
          prazo_horas_uteis: number | null
          qtd_adicionais: number | null
          qtd_bipadas: number | null
          qtd_conferidas: number | null
          qtd_encontradas: number | null
          qtd_etiquetadas: number | null
          qtd_linhas: number | null
          qtd_pecas: number | null
          qtd_problemas: number | null
          rastreio: string | null
          rastreio_enviado_em: string | null
          rastreio_url: string | null
          shopify_order_id: number | null
          shopify_url: string | null
          somada_a_numero: string | null
          somada_em: string | null
          somar_em: string | null
          status: string | null
          status_desde: string | null
          subtotal: number | null
          token_publico: string | null
          total: number | null
          total_geral: number | null
          total_pago: number | null
          troca_coberto: number | null
          updated_at: string | null
          valor_pago: number | null
          valor_pago_somado: number | null
          valor_pecas_com_desconto: number | null
          valor_removido: number | null
          valor_somado: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_somar_em_fkey"
            columns: ["somar_em"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_somar_em_fkey"
            columns: ["somar_em"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tempo_etapas: {
        Row: {
          cliente_nome: string | null
          em_andamento: boolean | null
          entrou_em: string | null
          entrou_por: string | null
          etapa: string | null
          horas_corridas: number | null
          horas_uteis: number | null
          numero: string | null
          origem: string | null
          pedido_id: string | null
          proxima_etapa: string | null
          saiu_em: string | null
          saiu_por: string | null
          visita: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tempo_sku: {
        Row: {
          achado_em: string | null
          achado_por: string | null
          desde_em: string | null
          dia: string | null
          evento_id: number | null
          hora: number | null
          item_id: string | null
          nome: string | null
          numero: string | null
          pedido_id: string | null
          qtd: number | null
          referencia: string | null
          segundos_para_achar: number | null
          sku: string | null
          variante: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_troca_carrinho: {
        Row: {
          diferenca: number | null
          item_id: string | null
          itens: Json | null
          pedido_id: string | null
          troca_id: string | null
          troca_peca_id: string | null
          unidades: number | null
          valor_escolhido: number | null
          valor_pago_item: number | null
        }
        Relationships: [
          {
            foreignKeyName: "troca_escolhas_troca_peca_id_fkey"
            columns: ["troca_peca_id"]
            isOneToOne: false
            referencedRelation: "troca_pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_troca_resumo: {
        Row: {
          coberto: number | null
          cobrir_ate: number | null
          diferenca_bruta: number | null
          diferenca_total: number | null
          pecas_respondidas: number | null
          pecas_total: number | null
          pedido_id: string | null
          total_pago: number | null
          troca_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trocas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_troca_valores: {
        Row: {
          diferenca: number | null
          item_id: string | null
          opcao_id: string | null
          pedido_id: string | null
          qtd: number | null
          situacao: string | null
          tipo: string | null
          troca_id: string | null
          troca_peca_id: string | null
          valor_opcao: number | null
          valor_pago_item: number | null
          valor_unit: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adicionar_itens: {
        Args: { p_itens: Json; p_pedido: string; p_somar?: boolean }
        Returns: undefined
      }
      bipar: {
        Args: { p_codigo: string; p_item: string; p_pedido: string }
        Returns: string
      }
      bipar_ajustar: {
        Args: { p_delta: number; p_item: string }
        Returns: number
      }
      categorias_catalogo: {
        Args: never
        Returns: {
          categoria: string
          total: number
        }[]
      }
      criar_venda: {
        Args: { p?: Json }
        Returns: {
          id: string
          numero: string
        }[]
      }
      enviar_troca: { Args: { p_troca: string }; Returns: undefined }
      fator_pedido: { Args: { p_pedido: string }; Returns: number }
      garantir_troca: {
        Args: { p_itens: string[]; p_pedido: string }
        Returns: string
      }
      horas_uteis: { Args: { ate: string; de: string }; Returns: number }
      importar_pedido_shopify: { Args: { p: Json }; Returns: boolean }
      marcar_devolvido: {
        Args: { p_desfazer?: boolean; p_pedido: string }
        Returns: undefined
      }
      marcar_falta: {
        Args: { p_item: string; p_qtd: number; p_status?: string }
        Returns: string
      }
      prazo_envio: { Args: { pago: string }; Returns: string }
      reiniciar_pedido: {
        Args: { p_etapa: string; p_pedido: string; p_tudo: boolean }
        Returns: undefined
      }
      romaneio_publico: { Args: { p_token: string }; Returns: Json }
      somar_venda: {
        Args: {
          p_forma: string
          p_pago_em?: string
          p_valor: number
          p_venda: string
        }
        Returns: undefined
      }
      sugerir_troca: {
        Args: {
          p_busca?: string
          p_categoria?: string
          p_faixa?: number
          p_incluir_pedido?: boolean
          p_item: string
          p_modo?: string
          p_so_sem_estoque?: boolean
        }
        Returns: {
          diferenca: number
          foto_url: string
          motivo: string
          no_pedido: boolean
          preco: number
          preco_cliente: number
          produto: string
          produto_id: number
          situacao: string
          sku: string
          variant_id: number
          variante: string
          vende_sem_estoque: boolean
        }[]
      }
      troca_acerto: {
        Args: { p_status: string; p_troca: string }
        Returns: boolean
      }
      troca_aprovar: {
        Args: {
          p_opcao?: string
          p_peca: string
          p_tipo: string
          p_troca: string
        }
        Returns: boolean
      }
      troca_aprovar_carrinho: {
        Args: { p_peca: string; p_troca: string }
        Returns: boolean
      }
      troca_carrinho: {
        Args: {
          p_item: string
          p_opcao: string
          p_qtd: number
          p_token: string
        }
        Returns: boolean
      }
      troca_carrinho_definir: {
        Args: { p_opcao: string; p_peca: string }
        Returns: undefined
      }
      troca_concluir_peca: {
        Args: {
          p_escolha_tipo: string
          p_opcao: string
          p_peca: string
          p_tipo: string
          p_troca: string
          p_versao?: string
        }
        Returns: boolean
      }
      troca_escolher: {
        Args: {
          p_item: string
          p_opcao?: string
          p_tipo: string
          p_token: string
        }
        Returns: boolean
      }
      troca_fator: { Args: { p_item: string }; Returns: number }
      troca_publica: { Args: { p_token: string }; Returns: Json }
      troca_recalcular_escolha: { Args: { p_peca: string }; Returns: undefined }
      troca_valor_pago: {
        Args: { p_item: string }
        Returns: {
          qtd: number
          valor_pago: number
          valor_pago_unit: number
        }[]
      }
      usuario_atual_email: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
