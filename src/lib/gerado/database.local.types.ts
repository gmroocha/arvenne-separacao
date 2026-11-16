// GERADO por npm run tipos:local a partir das migrations posteriores a 20261120140000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {

  }
  Views: {

  }
  Functions: {
    pecas_repetidas: { Args: { p_pedidos?: (string)[] | null }; Returns: { chave: string | null; sku: string | null; nome: string | null; variante: string | null; foto_url: string | null; qtd_total: number | null; qtd_pedidos: number | null; pedidos: Json | null }[] }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
