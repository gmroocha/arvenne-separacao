import type { StatusPedido } from "@/lib/status"
import type { Item } from "@/lib/tipos"

// Peças que contam numa etapa: as que ainda estão no pedido.
export const vivas = (itens: Item[]) => itens.filter((i) => i.status !== "removido")

// A etapa de peças (separação, conferência, etiquetagem, bipagem) está completa?
// Só olha as peças; quem decide mudar de etapa é a pessoa, pelo Dialog.
export function etapaCompleta(status: StatusPedido, itens: Item[]): boolean {
  const v = vivas(itens)
  if (v.length === 0) return false
  switch (status) {
    case "novo":
    case "separacao":
      return v.every((i) => i.status === "encontrado")
    case "conferencia":
      return v.every((i) => i.status === "encontrado" && i.conferido_em)
    case "etiquetagem":
      return v.every((i) => i.status === "encontrado" && i.etiquetado_em)
    case "bipagem":
      return v.every((i) => i.status === "encontrado" && i.qtd_bipada >= i.qtd)
    default:
      return false
  }
}

// Etapas de foco (só as peças do pedido, sem valores nem dados de contato).
export const ETAPAS_DE_PECAS: StatusPedido[] = ["novo", "separacao", "avisar_cliente", "aguardando_cliente", "conferencia", "etiquetagem", "bipagem"]
