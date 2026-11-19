import { Ban } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAnularOcorrencia, useOcorrencias, useSouGestor } from "@/lib/api"
import { quando } from "@/lib/formato"
import { NOME_TIPO, nomeMotivo, type Ocorrencia } from "@/lib/ocorrencias"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"
import { cn } from "@/lib/utils"

const etapaNome = (etapa: string) => NOME_ETAPA[etapa as StatusPedido] ?? etapa

function Linha({ o, pedidoId, gestor }: { o: Ocorrencia; pedidoId: string; gestor: boolean }) {
  const anular = useAnularOcorrencia(pedidoId)
  const peca = [o.sku, o.variante].filter(Boolean).join(" · ")
  return (
    <li className={cn("flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0", o.anulada_em && "text-muted-foreground")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{NOME_TIPO[o.tipo] ?? o.tipo}</span>
        <Badge variant="secondary">{nomeMotivo(o.motivo)}</Badge>
        {o.anulada_em && <Badge variant="outline">Anulada</Badge>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{quando(o.created_at)}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {o.responsavel_nome ? `De ${o.responsavel_nome}` : "Sem responsável definido"} · {etapaNome(o.etapa)}
        {o.conferente_nome ? ` · conferida por ${o.conferente_nome}` : ""}
      </div>
      {peca && <div className="font-mono text-xs">{peca}</div>}
      {o.observacao && <div className="text-sm">{o.observacao}</div>}
      {gestor && !o.anulada_em && (
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" disabled={anular.isPending} onClick={() => anular.mutate(o.id)}>
          <Ban /> Anular
        </Button>
      )}
    </li>
  )
}

// Lista de ocorrências de um pedido. Só o gestor anula (o banco confere de novo).
export function ListaOcorrencias({ ocorrencias, pedidoId }: { ocorrencias: Ocorrencia[]; pedidoId: string }) {
  const gestor = useSouGestor() === true
  return (
    <ul className="flex flex-col gap-3">
      {ocorrencias.map((o) => (
        <Linha key={o.id} o={o} pedidoId={pedidoId} gestor={gestor} />
      ))}
    </ul>
  )
}

// Cartão discreto na página do pedido: só aparece se o pedido tem ocorrência.
export default function CartaoOcorrencias({ pedidoId }: { pedidoId: string }) {
  const { data } = useOcorrencias(pedidoId)
  if (!data?.length) return null
  return (
    <Card size="sm" aria-label="Ocorrências do pedido">
      <CardHeader>
        <CardTitle>Ocorrências ({data[0].ativas_no_pedido})</CardTitle>
      </CardHeader>
      <CardContent>
        <ListaOcorrencias ocorrencias={data} pedidoId={pedidoId} />
      </CardContent>
    </Card>
  )
}
