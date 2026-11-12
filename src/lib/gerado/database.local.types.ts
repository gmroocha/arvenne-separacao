// GERADO por npm run tipos:local a partir das migrations posteriores a 20261116090000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
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
    listar_inconsistencias: { Args: Record<PropertyKey, never>; Returns: { pedido_id: string | null; numero: string | null; regra: string | null; detalhe: string | null }[] }
    registrar_vistoria: { Args: Record<PropertyKey, never>; Returns: number | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
