// GERADO por npm run tipos:local a partir das migrations posteriores a 20261120090000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {

  }
  Views: {

  }
  Functions: {
    alterar_item: { Args: { p_item: string | null; p_campos: Json | null }; Returns: undefined | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
