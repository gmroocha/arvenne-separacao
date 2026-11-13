// GERADO por npm run tipos:local a partir das migrations posteriores a 20261120090000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto } from './database.types'

type Adicoes = {
  Tables: {

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
