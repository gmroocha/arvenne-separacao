// GERADO por npm run tipos:local a partir das migrations posteriores a 20261122190000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {
    clube_modelos: {
      Row: {
        id: string
        nome: string
        foto_url: string | null
        codigo_base: string
        preco: number | null
        ativo: boolean
        created_at: string
      }
      Insert: {
        id?: string
        nome: string
        foto_url?: string | null
        codigo_base: string
        preco?: number | null
        ativo?: boolean
        created_at?: string
      }
      Update: {
        id?: string
        nome?: string
        foto_url?: string | null
        codigo_base?: string
        preco?: number | null
        ativo?: boolean
        created_at?: string
      }
      Relationships: []
    }
    equipe: {
      Row: {
        id: string
        nome: string
        email: string | null
        ativo: boolean
        created_at: string
        papel: string
      }
      Insert: {
        id?: string
        nome: string
        email?: string | null
        ativo?: boolean
        created_at?: string
        papel?: string
      }
      Update: {
        id?: string
        nome?: string
        email?: string | null
        ativo?: boolean
        created_at?: string
        papel?: string
      }
      Relationships: []
    }
    pecas_clube: {
      Row: {
        id: string
        codigo: string
        nome: string
        variante: string | null
        foto_url: string | null
        preco: number | null
        ativo: boolean
        created_at: string
        modelo_id: string | null
      }
      Insert: {
        id?: string
        codigo: string
        nome: string
        variante?: string | null
        foto_url?: string | null
        preco?: number | null
        ativo?: boolean
        created_at?: string
        modelo_id?: string | null
      }
      Update: {
        id?: string
        codigo?: string
        nome?: string
        variante?: string | null
        foto_url?: string | null
        preco?: number | null
        ativo?: boolean
        created_at?: string
        modelo_id?: string | null
      }
      Relationships: []
    }
  }
  Views: {

  }
  Functions: {
    encontrar_peca: { Args: { p_item: string | null }; Returns: undefined | null }
    salvar_modelo_clube: { Args: { p: Json | null }; Returns: Json | null }
    sou_gestor: { Args: Record<PropertyKey, never>; Returns: boolean | null }
    tg_equipe_ultimo_gestor: { Args: Record<PropertyKey, never>; Returns: string | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
