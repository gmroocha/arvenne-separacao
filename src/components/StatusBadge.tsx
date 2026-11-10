import { MessageCircle, ShoppingBag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Origem } from "@/lib/tipos"

export function StatusBadge({ status }: { status: StatusPedido }) {
  const variante =
    status === "aguardando_cliente"
      ? "destructive"
      : status === "enviado" || status === "cancelado" || status === "perdida"
        ? "outline"
        : "secondary"
  return <Badge variant={variante}>{NOME_ETAPA[status]}</Badge>
}

export function OrigemBadge({ origem }: { origem: Origem }) {
  return (
    <Badge variant="outline">
      {origem === "shopify" ? <ShoppingBag /> : <MessageCircle />}
      {origem === "shopify" ? "Site" : "WhatsApp"}
    </Badge>
  )
}
