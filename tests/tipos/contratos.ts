import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../src/lib/banco"
import type { Item } from "../../src/lib/tipos"

// Só compila; não é executado e não acessa rede. Se um erro deixar de ser detectado, tsc falha.
export function conferirContrato(client: SupabaseClient<Database>, item: Item) {
  client.from("pedido_itens").update({ qtd: 2 })
  // @ts-expect-error Coluna inexistente precisa continuar sendo recusada.
  client.from("pedido_itens").update({ quantidade_inventada: 2 })
  // @ts-expect-error Tabela inexistente precisa continuar sendo recusada.
  client.from("tabela_inventada")
  // @ts-expect-error Argumento de RPC inexistente precisa continuar sendo recusado.
  client.rpc("bipar", { p_pedido: "x", p_item: "x", p_codigo_inventado: "AN" })
  // @ts-expect-error Campo do Item vem do banco; não aceitar nomes criados na tela.
  void item.preco_inventado
}
