import { MessageCircle, ShoppingBag } from "lucide-react"
import SeloStatus from "@/components/SeloStatus"
import { ehDesvio } from "@/lib/selo"
import { Badge } from "@/components/ui/badge"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Origem } from "@/lib/tipos"

export function StatusBadge({ status }: { status: StatusPedido }) {
  if (ehDesvio(status)) return <SeloStatus status={status} />
  const variante = status === "enviado" || status === "cancelado" || status === "perdida" ? "outline" : "secondary"
  return <Badge variant={variante}>{NOME_ETAPA[status]}</Badge>
}

export function OrigemBadge({ origem }: { origem: Origem }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground [&>svg]:size-3">
      {origem === "shopify" ? <ShoppingBag /> : <MessageCircle />}
      {origem === "shopify" ? "Site" : "WhatsApp"}
    </span>
  )
}
