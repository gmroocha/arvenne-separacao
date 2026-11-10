import { useState } from "react"
import { Check, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { quando } from "@/lib/formato"
import { PASSOS, passoDe, type StatusPedido } from "@/lib/status"
import type { Evento } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = { status: StatusPedido; eventos: Evento[] }

// Separação → Conferência → Nota/Bling/frete → Embalagem → Correios → Enviado.
export default function Etapas({ status, eventos }: Props) {
  const atual = passoDe(status)
  const [aberta, setAberta] = useState<number | null>(null)

  // Quem concluiu a etapa: o último evento que saiu dela.
  const quem = (i: number) => {
    const sts = PASSOS[i].statuses as readonly string[]
    return eventos.find((e) => e.tipo === "status" && e.de && sts.includes(e.de) && !sts.includes(e.para ?? ""))
  }
  const detalhe = aberta !== null && aberta < atual ? quem(aberta) : null

  return (
    <div className="flex flex-col gap-2">
      <ol className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" aria-label="Etapas do pedido">
        {PASSOS.map((p, i) => {
          const feita = atual >= 0 && i < atual
          const ativa = i === atual
          return (
            <li key={p.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!feita}
                onClick={() => setAberta(aberta === i ? null : i)}
                aria-current={ativa ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                  ativa && "border-primary bg-primary text-primary-foreground",
                  feita && "bg-background text-foreground hover:bg-muted",
                  !feita && !ativa && "bg-muted text-muted-foreground",
                )}
              >
                {feita ? (
                  <Check className="size-4" />
                ) : (
                  <span className="text-xs tabular-nums">{i + 1}</span>
                )}
                {p.nome}
              </button>
              {i === 0 && status === "aguardando_cliente" && (
                <Badge variant="destructive">
                  <TriangleAlert /> Aguardando cliente
                </Badge>
              )}
              {i < PASSOS.length - 1 && <span className="mx-0.5 h-px w-3 bg-border" />}
            </li>
          )
        })}
      </ol>
      {aberta !== null && aberta < atual && (
        <p className="text-sm text-muted-foreground">
          {PASSOS[aberta].nome}:{" "}
          {detalhe ? `concluída por ${detalhe.usuario_email ?? "sistema"} em ${quando(detalhe.created_at)}` : "sem registro no histórico"}
        </p>
      )}
    </div>
  )
}
