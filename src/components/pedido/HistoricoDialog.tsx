import { useMemo, useState } from "react"
import { ArrowRightLeft, Circle, Gem, ListOrdered, Plus, StickyNote, type LucideIcon } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAdicionarNota } from "@/lib/api"
import { agruparPorDia, FILTROS_HISTORICO, filtrarHistorico, horaDoEvento, montarHistorico, type CategoriaHistorico, type FiltroHistorico } from "@/lib/historico"
import type { Evento } from "@/lib/tipos"

const ICONE: Record<CategoriaHistorico, LucideIcon> = { etapas: ListOrdered, pecas: Gem, troca: ArrowRightLeft, notas: StickyNote, outros: Circle }

type Props = { aberto: boolean; aoMudar: (aberto: boolean) => void; pedidoId: string; eventos: Evento[] }

// Histórico em tela cheia: nota no topo, filtros e linha do tempo por dia.
export default function HistoricoDialog({ aberto, aoMudar, pedidoId, eventos }: Props) {
  const nota = useAdicionarNota()
  const [texto, setTexto] = useState("")
  const [filtro, setFiltro] = useState<FiltroHistorico>("tudo")
  const itens = useMemo(() => montarHistorico(eventos), [eventos])
  const grupos = useMemo(() => agruparPorDia(filtrarHistorico(itens, filtro)), [itens, filtro])

  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Histórico do pedido" descricao="Tudo o que aconteceu, do mais novo para o mais antigo." largo>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            nota.mutate({ pedidoId, texto: texto.trim() }, { onSuccess: () => setTexto("") })
          }}
        >
          <Input aria-label="Nova nota" placeholder="Adicionar nota" className="h-10" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Button type="submit" variant="outline" className="h-10 shrink-0" disabled={!texto.trim() || nota.isPending}>
            <Plus /> Adicionar
          </Button>
        </form>

        <ToggleGroup type="single" variant="outline" size="sm" spacing={1} className="flex-wrap" value={filtro} onValueChange={(v) => v && setFiltro(v as FiltroHistorico)} aria-label="Filtrar histórico">
          {FILTROS_HISTORICO.map((f) => (
            <ToggleGroupItem key={f.valor} value={f.valor}>
              {f.rotulo}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {grupos.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>}
        <div className="flex flex-col gap-7">
          {grupos.map((g) => (
            <section key={g.dia} aria-label={g.rotulo} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground">{g.rotulo}</h3>
              <ul className="flex flex-col">
                {g.itens.map((i, n) => {
                  const Icone = ICONE[i.categoria]
                  return (
                    <li key={i.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {n < g.itens.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-border" />}
                      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icone className="size-4" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm leading-snug font-medium">{i.titulo}</span>
                          {(i.sku || i.detalhe) && (
                            <span className="text-sm leading-snug break-words text-muted-foreground">
                              {i.sku && <span className="font-mono font-semibold text-foreground">{i.sku}</span>}
                              {i.sku && i.detalhe && " · "}
                              {i.detalhe}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end text-xs text-muted-foreground tabular-nums">
                          <span>{horaDoEvento(i.criado)}</span>
                          <span>{i.quem}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </RespDialog>
  )
}
