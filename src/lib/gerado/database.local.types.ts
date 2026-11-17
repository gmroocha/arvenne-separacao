// GERADO por npm run tipos:local a partir das migrations posteriores a 20261121100000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto } from './database.types'

type Adicoes = {
  Tables: {
    feedbacks: {
      Row: {
        id: string
        texto: string
        pagina: string | null
        pedido_id: string | null
        usuario_email: string | null
        created_at: string
        resolvido_em: string | null
        item_id: string | null
        sku: string | null
      }
      Insert: {
        id?: string
        texto: string
        pagina?: string | null
        pedido_id?: string | null
        usuario_email?: string | null
        created_at?: string
        resolvido_em?: string | null
        item_id?: string | null
        sku?: string | null
      }
      Update: {
        id?: string
        texto?: string
        pagina?: string | null
        pedido_id?: string | null
        usuario_email?: string | null
        created_at?: string
        resolvido_em?: string | null
        item_id?: string | null
        sku?: string | null
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
      }
      Relationships: []
    }
  }
  Views: {

  }
  Functions: {

  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
