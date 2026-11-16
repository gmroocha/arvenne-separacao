// GERADO por npm run tipos:local a partir das migrations posteriores a 20261121090000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto } from './database.types'

type Adicoes = {
  Tables: {
    creditos_cliente: {
      Row: {
        id: string
        troca_id: string
        pedido_id: string
        destino: string
        valor: number
        registrado_em: string
        registrado_por: string | null
        reembolsado_em: string | null
        reembolsado_por: string | null
        usado_em: string | null
        usado_pedido_id: string | null
        usado_por: string | null
        cancelado_em: string | null
      }
      Insert: {
        id?: string
        troca_id: string
        pedido_id: string
        destino: string
        valor: number
        registrado_em?: string
        registrado_por?: string | null
        reembolsado_em?: string | null
        reembolsado_por?: string | null
        usado_em?: string | null
        usado_pedido_id?: string | null
        usado_por?: string | null
        cancelado_em?: string | null
      }
      Update: {
        id?: string
        troca_id?: string
        pedido_id?: string
        destino?: string
        valor?: number
        registrado_em?: string
        registrado_por?: string | null
        reembolsado_em?: string | null
        reembolsado_por?: string | null
        usado_em?: string | null
        usado_pedido_id?: string | null
        usado_por?: string | null
        cancelado_em?: string | null
      }
      Relationships: []
    }
  }
  Views: {
    v_creditos_cliente: {
      Row: {
        id: string | null
        troca_id: string | null
        pedido_id: string | null
        numero: string | null
        cliente_nome: string | null
        destino: string | null
        valor: number | null
        situacao: string | null
        registrado_em: string | null
        registrado_por: string | null
        reembolsado_em: string | null
        reembolsado_por: string | null
        usado_em: string | null
        usado_pedido_id: string | null
        usado_numero: string | null
        usado_por: string | null
      }
      Relationships: []
    }
  }
  Functions: {
    creditos_do_pedido: { Args: { p_pedido: string | null }; Returns: { id: string | null; pedido_id: string | null; numero: string | null; valor: number | null; situacao: string | null; registrado_em: string | null; usado_aqui: boolean | null }[] }
    marcar_reembolsado: { Args: { p_credito: string | null; p_desfazer?: boolean | null }; Returns: undefined | null }
    mesma_cliente: { Args: { a: string | null; b: string | null }; Returns: boolean | null }
    registrar_credito: { Args: { p_troca: string | null; p_destino: string | null }; Returns: string | null }
    tg_trocas_credito: { Args: Record<PropertyKey, never>; Returns: string | null }
    usar_credito: { Args: { p_credito: string | null; p_pedido: string | null; p_desfazer?: boolean | null }; Returns: undefined | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
