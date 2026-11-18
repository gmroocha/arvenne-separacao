import { Check, ChevronDown } from "lucide-react"
import FaixaRolavel from "@/components/FaixaRolavel"
import MenuAcoes from "@/components/MenuAcoes"
import SeloStatus from "@/components/SeloStatus"
import AvatarMembro from "@/components/AvatarMembro"
import { Badge } from "@/components/ui/badge"
import { pecasPorEtapa } from "@/lib/etapa"
import { useEquipe } from "@/lib/api"
import { ehDesvio } from "@/lib/selo"
import { quando } from "@/lib/formato"
import { ICONE_ETAPA, PASSOS, passoAtual, passoDe, type StatusPedido } from "@/lib/status"
import type { Evento, Item } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import { useIrParaEtapa } from "./useIrParaEtapa"

type Props = {
  status: StatusPedido
  // V37: em "avisar/aguardando cliente", a etapa de onde o pedido veio (a etapa atual na linha).
  etapaAntesDesvio?: StatusPedido | null
  eventos: Evento[]
  responsaveis?: Record<string, string> | null // { etapa: equipe.id } (pode faltar até o banco ter o time)
  vista: StatusPedido | null // etapa que está na tela (null = a atual do pedido)
  aoVer: (vista: StatusPedido | null) => void
  pecas?: Item[] // as peças do pedido: a linha mostra quantas esperam em cada etapa de peça
}

// Esteira do pedido: Separação → Conferência → Bipagem → Nota fiscal → Embalagem → Frete → Postagem → Concluído.
// Tocar numa etapa só muda o que aparece na tela, nunca o status do pedido. Cada peça anda sozinha: as etapas de
// peça (Separação, Conferência, Bipagem) abrem sempre, com as peças que já chegaram lá; as de documentos à
// frente da atual pedem aviso (Dialog) antes de abrir.
export default function Etapas({ status, etapaAntesDesvio, eventos, responsaveis, vista, aoVer, pecas = [] }: Props) {
  const emCada = pecasPorEtapa(pecas)
  const contagem = (id: string) => (id in emCada ? emCada[id as keyof typeof emCada] : 0)
  const membros = useEquipe().data ?? []
  // Nome de quem faz a etapa (só etapas de trabalho; some se a pessoa não está na lista).
  const quemFaz = (etapa: string) => membros.find((m) => m.id === (responsaveis ?? {})[etapa])?.nome
  const atual = passoAtual({ status, etapa_antes_desvio: etapaAntesDesvio })
  const vistaIdx = vista ? passoDe(vista) : atual

  const quem = (i: number) => {
    const sts = PASSOS[i].statuses as readonly string[]
    return eventos.find((e) => e.tipo === "status" && e.de && sts.includes(e.de) && !sts.includes(e.para ?? ""))
  }
  const detalhe = vistaIdx >= 0 && vistaIdx < atual ? quem(vistaIdx) : null

  const { ir: abrir, dialogo } = useIrParaEtapa(atual, aoVer)

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
                  rotulo: [i === atual ? `${p.nome} · atual` : p.nome, contagem(p.id) > 0 ? `${contagem(p.id)} ${contagem(p.id) === 1 ? "peça" : "peças"}` : null, quemFaz(p.id)].filter(Boolean).join(" · "),
                  icone: i < atual ? Check : ICONE_ETAPA[p.id],
                  aoClicar: () => abrir(i),
                })),
              },
            ]}
            gatilho={
              <button type="button" className="flex min-h-9 items-center gap-2 self-start text-left text-sm font-medium">
                Etapa {vistaIdx + 1} de {PASSOS.length} · {PASSOS[vistaIdx].nome}
                {contagem(PASSOS[vistaIdx].id) > 0 && (
                  <Badge variant="outline" className="h-5 min-w-5 px-1 tabular-nums" aria-label={`${contagem(PASSOS[vistaIdx].id)} peças nesta etapa`}>
                    {contagem(PASSOS[vistaIdx].id)}
                  </Badge>
                )}
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
            const nomeResp = quemFaz(p.id)
            return (
              <li key={p.id} className="flex items-center">
                <button
                  type="button"
                  disabled={atual < 0}
                  onClick={() => abrir(i)}
                  aria-current={vendo ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full inset-ring px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    vendo && "inset-ring-primary bg-primary text-primary-foreground",
                    // Contorno suave + fundo tingido: o contorno branco de 1 px serrilhava no modo escuro.
                    !vendo && ehAtual && "inset-ring-primary/35 bg-primary/10 text-foreground hover:bg-primary/15",
                    !vendo && feita && "inset-ring-(length:--traco) inset-ring-success/40 bg-success/10 text-success hover:bg-success/15",
                    !vendo && !feita && !ehAtual && "inset-ring-border bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {feita ? <Check className="size-4" /> : <Icone className="size-4" />}
                  {p.nome}
                  {ehAtual && <span className="sr-only">(etapa atual)</span>}
                  {contagem(p.id) > 0 && (
                    <Badge variant={vendo ? "secondary" : "outline"} className="h-5 min-w-5 px-1 tabular-nums" aria-label={`${contagem(p.id)} peças nesta etapa`}>
                      {contagem(p.id)}
                    </Badge>
                  )}
                  {nomeResp && <AvatarMembro nome={nomeResp} className="-mr-1.5 size-5" />}
                </button>
                {i < PASSOS.length - 1 && <span className={cn("h-0.5 w-4", i < atual ? "bg-success" : "bg-border")} />}
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

      {dialogo}
    </div>
  )
}
