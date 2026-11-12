import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import FaixaRolavel from "@/components/FaixaRolavel"
import MenuAcoes from "@/components/MenuAcoes"
import RespDialog from "@/components/RespDialog"
import SeloStatus from "@/components/SeloStatus"
import { Button } from "@/components/ui/button"
import { ehDesvio } from "@/lib/selo"
import { quando } from "@/lib/formato"
import { ICONE_ETAPA, PASSOS, passoAtual, passoDe, type StatusPedido } from "@/lib/status"
import type { Evento } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  status: StatusPedido
  // V37: em "avisar/aguardando cliente", a etapa de onde o pedido veio (a etapa atual na linha).
  etapaAntesDesvio?: StatusPedido | null
  eventos: Evento[]
  vista: StatusPedido | null // etapa que está na tela (null = a atual do pedido)
  aoVer: (vista: StatusPedido | null) => void
}

const lista = (nomes: string[]) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0])

// Esteira do pedido: Separação → Conferência → Etiquetagem → Bipagem → Nota e frete → Embalagem →
// Postagem → Enviado. Tocar numa etapa só muda o que aparece na tela, nunca o status do pedido.
// Etapa à frente da atual pede aviso (Dialog) antes de abrir.
export default function Etapas({ status, etapaAntesDesvio, eventos, vista, aoVer }: Props) {
  const atual = passoAtual({ status, etapa_antes_desvio: etapaAntesDesvio })
  const vistaIdx = vista ? passoDe(vista) : atual
  const [bloqueada, setBloqueada] = useState<number | null>(null) // etapa à frente que a pessoa tentou abrir

  const quem = (i: number) => {
    const sts = PASSOS[i].statuses as readonly string[]
    return eventos.find((e) => e.tipo === "status" && e.de && sts.includes(e.de) && !sts.includes(e.para ?? ""))
  }
  const detalhe = vistaIdx >= 0 && vistaIdx < atual ? quem(vistaIdx) : null

  const abrir = (i: number) => {
    if (atual < 0) return
    if (i === atual) return aoVer(null)
    if (i > atual) return setBloqueada(i)
    aoVer(PASSOS[i].id)
  }
  const faltam = bloqueada !== null ? PASSOS.slice(atual, bloqueada).map((p) => p.nome) : []

  return (
    <div className="flex flex-col gap-2">
      {atual >= 0 && (
        <div className="flex flex-col gap-1.5 lg:hidden">
          <MenuAcoes
            titulo="Etapas do pedido"
            grupos={[
              {
                estilo: "ghost",
                itens: PASSOS.map((p, i) => ({
                  rotulo: i === atual ? `${p.nome} · atual` : p.nome,
                  icone: i < atual ? Check : ICONE_ETAPA[p.id],
                  aoClicar: () => abrir(i),
                })),
              },
            ]}
            gatilho={
              <button type="button" className="flex min-h-9 items-center gap-2 self-start text-left text-sm font-medium">
                Etapa {vistaIdx + 1} de {PASSOS.length} · {PASSOS[vistaIdx].nome}
                {vistaIdx === atual && ehDesvio(status) && <SeloStatus status={status} />}
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            }
          />
          <div className="flex gap-1" aria-hidden>
            {PASSOS.map((p, i) => (
              <span
                key={p.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  // Verde nas etapas concluídas dá a sensação de progresso; a atual fica em destaque.
                  i < atual ? "bg-success" : i === atual ? "bg-primary" : "bg-muted",
                  i === vistaIdx && vistaIdx !== atual && "outline-2 outline-offset-1 outline-primary",
                )}
              />
            ))}
          </div>
        </div>
      )}

      <FaixaRolavel chave={`${status}-${vista}`} className="hidden lg:block">
        <ol className="flex w-max items-center pb-1" aria-label="Etapas do pedido">
          {PASSOS.map((p, i) => {
            const feita = atual >= 0 && i < atual
            const ehAtual = i === atual
            const vendo = i === vistaIdx
            const Icone = ICONE_ETAPA[p.id]
            return (
              <li key={p.id} className="flex items-center">
                <button
                  type="button"
                  disabled={atual < 0}
                  onClick={() => abrir(i)}
                  aria-current={vendo ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    vendo && "border-primary bg-primary text-primary-foreground",
                    // Contorno suave + fundo tingido: o contorno branco de 1 px serrilhava no modo escuro.
                    !vendo && ehAtual && "border-primary/35 bg-primary/10 text-foreground hover:bg-primary/15",
                    !vendo && feita && "border-success/40 bg-success/10 text-success hover:bg-success/15",
                    !vendo && !feita && !ehAtual && "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {feita ? <Check className="size-4" /> : <Icone className="size-4" />}
                  {p.nome}
                  {ehAtual && <span className="sr-only">(etapa atual)</span>}
                </button>
                {i < PASSOS.length - 1 && <span className={cn("h-px w-4", i < atual ? "bg-success" : "bg-border")} />}
              </li>
            )
          })}
        </ol>
      </FaixaRolavel>
      {vistaIdx >= 0 && vistaIdx < atual && (
        <p className="text-sm text-muted-foreground">
          {PASSOS[vistaIdx].nome}:{" "}
          {detalhe ? `concluída por ${detalhe.usuario_email ?? "sistema"} em ${quando(detalhe.created_at)}` : "sem registro no histórico"}
        </p>
      )}

      <RespDialog
        aberto={bloqueada !== null}
        aoMudar={(a) => !a && setBloqueada(null)}
        titulo="Etapa ainda não liberada"
        descricao={bloqueada !== null ? `Para chegar em ${PASSOS[bloqueada].nome}, conclua antes: ${lista(faltam)}.` : undefined}
      >
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
          <Button size="toque" onClick={() => setBloqueada(null)}>
            Ok
          </Button>
          <Button
            size="toque"
            variant="outline"
            onClick={() => {
              if (bloqueada !== null) aoVer(PASSOS[bloqueada].id)
              setBloqueada(null)
            }}
          >
            Ver mesmo assim
          </Button>
        </div>
      </RespDialog>
    </div>
  )
}
