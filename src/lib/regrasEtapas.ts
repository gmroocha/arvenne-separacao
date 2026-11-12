import type { Json } from "@/lib/gerado/database.types"
import type { StatusPedido } from "@/lib/status"

// Só interpreta a decisão pronta do SQL; pré-requisitos e dinheiro não são recalculados aqui.
export function motivoEtapa(regras: Json | undefined, destino: StatusPedido): string | null {
  if (!regras || typeof regras !== "object" || Array.isArray(regras) || !(destino in regras)) {
    return "Atualize o banco para conferir os pré-requisitos desta etapa."
  }
  const motivo = regras[destino]
  return motivo === null ? null : typeof motivo === "string" ? motivo : "Não foi possível conferir esta etapa."
}
