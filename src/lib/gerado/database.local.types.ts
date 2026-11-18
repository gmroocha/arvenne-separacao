// GERADO por npm run tipos:local a partir das migrations posteriores a 20261122190000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto } from './database.types'

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
  }
  Views: {

  }
  Functions: {
    encontrar_peca: { Args: { p_item: string | null }; Returns: undefined | null }
    sou_gestor: { Args: Record<PropertyKey, never>; Returns: boolean | null }
    tg_equipe_ultimo_gestor: { Args: Record<PropertyKey, never>; Returns: string | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
