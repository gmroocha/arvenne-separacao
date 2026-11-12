import { MessageCircle, ShoppingBag } from "lucide-react"
import SeloStatus from "@/components/SeloStatus"
import { ehDesvio } from "@/lib/selo"
import { Badge } from "@/components/ui/badge"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Origem } from "@/lib/tipos"

// somadaA: número do pedido principal de uma venda somada ("Somada a ARV-1274").
export function StatusBadge({ status, somadaA }: { status: StatusPedido; somadaA?: string | null }) {
  if (ehDesvio(status)) return <SeloStatus status={status} />
  const variante = status === "enviado" || status === "cancelado" || status === "perdida" || status === "somada" ? "outline" : "secondary"
  return <Badge variant={variante}>{status === "somada" && somadaA ? `Somada a ${somadaA}` : NOME_ETAPA[status]}</Badge>
}

export function OrigemBadge({ origem }: { origem: Origem }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&>svg]:size-3">
      {origem === "shopify" ? <ShoppingBag /> : <MessageCircle />}
      {origem === "shopify" ? "Site" : "WhatsApp"}
    </span>
  )
}
