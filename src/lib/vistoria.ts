import type { Json } from "@/lib/gerado/database.types"

export type AvisoVistoria = { pedido_id: string | null; numero: string; regra: string; detalhe: string }

// Só valida o JSON do banco. Nenhuma regra de dinheiro/etapa é repetida na interface.
export function lerAvisosVistoria(json: Json): AvisoVistoria[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return []
    if ((v.pedido_id !== null && typeof v.pedido_id !== "string") || typeof v.numero !== "string" || typeof v.regra !== "string" || typeof v.detalhe !== "string") return []
    return [{ pedido_id: v.pedido_id, numero: v.numero, regra: v.regra, detalhe: v.detalhe }]
  })
}
