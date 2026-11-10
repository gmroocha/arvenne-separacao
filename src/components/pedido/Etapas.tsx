import { useState } from "react"
import { BellRing, Check, MessageCircleWarning } from "lucide-react"
import FaixaRolavel from "@/components/FaixaRolavel"
import { Badge } from "@/components/ui/badge"
import { quando } from "@/lib/formato"
import { ICONE_ETAPA, PASSOS, passoDe, type StatusPedido } from "@/lib/status"
import type { Evento } from "@/lib/tipos"
import { cn } from "@/lib/utils"

function Aguardando({ status }: { status: StatusPedido }) {
  const avisar = status === "avisar_cliente"
  return (
    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
      {avisar ? <BellRing /> : <MessageCircleWarning />} {avisar ? "Avisar cliente" : "Aguardando cliente"}
    </Badge>
  )
}

type Props = { status: StatusPedido; eventos: Evento[] }

// Esteira do pedido: Separação → Conferência → Etiquetagem → Bipagem → Nota e frete → Embalagem →
// Postagem → Enviado. Concluída com ✓, atual em destaque; toque numa concluída mostra quem fez.
export default function Etapas({ status, eventos }: Props) {
  const atual = passoDe(status)
  const desvio = status === "avisar_cliente" || status === "aguardando_cliente"
  const [aberta, setAberta] = useState<number | null>(null)

  const quem = (i: number) => {
    const sts = PASSOS[i].statuses as readonly string[]
    return eventos.find((e) => e.tipo === "status" && e.de && sts.includes(e.de) && !sts.includes(e.para ?? ""))
  }
  const detalhe = aberta !== null && aberta < atual ? quem(aberta) : null

  return (
    <div className="flex flex-col gap-2">
      {atual >= 0 && (
        <div className="flex flex-col gap-1.5 lg:hidden">
          <div className="flex items-center gap-2 text-sm font-medium">
            Etapa {atual + 1} de {PASSOS.length} · {PASSOS[atual].nome}
            {desvio && <Aguardando status={status} />}
          </div>
          <div className="flex gap-1" aria-hidden>
            {PASSOS.map((p, i) => (
              <span key={p.id} className={cn("h-1.5 flex-1 rounded-full", i <= atual ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </div>
      )}

      {atual >= 0 && desvio && (
        <div className="hidden lg:block">
          <Aguardando status={status} />
        </div>
      )}
      <FaixaRolavel chave={status} className="hidden lg:block">
      <ol className="flex w-max items-center pb-1" aria-label="Etapas do pedido">
        {PASSOS.map((p, i) => {
          const feita = atual >= 0 && i < atual
          const ativa = i === atual
          const Icone = ICONE_ETAPA[p.id]
          return (
            <li key={p.id} className="flex items-center">
              <button
                type="button"
                disabled={!feita}
                onClick={() => setAberta(aberta === i ? null : i)}
                aria-current={ativa ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                  ativa && "border-primary bg-primary text-primary-foreground",
                  feita && "bg-background text-foreground hover:bg-muted",
                  !feita && !ativa && "bg-muted text-muted-foreground",
                )}
              >
                {feita ? <Check className="size-4" /> : <Icone className="size-4" />}
                {p.nome}
              </button>
              {i < PASSOS.length - 1 && <span className={cn("h-px w-4", i < atual ? "bg-primary" : "bg-border")} />}
            </li>
          )
        })}
      </ol>
      </FaixaRolavel>
      {aberta !== null && aberta < atual && (
        <p className="text-sm text-muted-foreground">
          {PASSOS[aberta].nome}:{" "}
          {detalhe ? `concluída por ${detalhe.usuario_email ?? "sistema"} em ${quando(detalhe.created_at)}` : "sem registro no histórico"}
        </p>
      )}
    </div>
  )
}
