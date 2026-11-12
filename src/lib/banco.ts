import type { Database as Gerado } from "@/lib/gerado/database.local.types"
import type { ParteSomada } from "@/lib/tipos"

// JSON de SQL não possui campos inferíveis pelo gerador. Só refinamos essas duas estruturas.
// Os demais campos/tabelas/argumentos continuam vindo integralmente do arquivo gerado.
type Views = Gerado["public"]["Views"]
type Funcoes = Gerado["public"]["Functions"]
type FuncoesComNull = {
  [F in keyof Funcoes]: Omit<Funcoes[F], "Args"> & {
    // Parâmetros SQL aceitam NULL; o gerador só infere se um argumento tem default.
    Args: { [A in keyof Funcoes[F]["Args"]]: Funcoes[F]["Args"][A] | null }
  }
}

export type Database = Omit<Gerado, "public"> & {
  public: Omit<Gerado["public"], "Views" | "Functions"> & {
    Functions: FuncoesComNull
    Views: Omit<Views, "v_pedidos"> & {
      v_pedidos: Omit<Views["v_pedidos"], "Row"> & {
        Row: Omit<Views["v_pedidos"]["Row"], "partes" | "fotos"> & { partes: ParteSomada[]; fotos: string[] }
      }
    }
  }
}
