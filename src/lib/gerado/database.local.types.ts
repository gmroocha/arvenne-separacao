// GERADO por npm run tipos:local a partir das migrations posteriores a 20261122140000.
// Não editar à mão. O arquivo database.types.ts é gerado pelo Supabase CLI.
import type { Database as Remoto, Json } from './database.types'

type Adicoes = {
  Tables: {

  }
  Views: {

  }
  Functions: {
    corrigir_frete_pedido: { Args: { p_pedido: string | null; p_pago_por: string | null; p_cobrado?: number | null; p_dados?: Json | null }; Returns: undefined | null }
    faltas_para_pagar: { Args: { p: Json | null }; Returns: (string)[] | null }
  }
}

export type Database = Omit<Remoto, 'public'> & {
  public: Omit<Remoto['public'], keyof Adicoes> & {
    [K in keyof Adicoes]: Omit<Remoto['public'][K], keyof Adicoes[K]> & Adicoes[K]
  }
}
