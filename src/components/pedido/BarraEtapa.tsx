import { useState } from "react"
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMoverEtapa, type PedidoDetalhe } from "@/lib/api"
import { pendenciasDaEtapa } from "@/lib/etapa"
import { ehDesvio } from "@/lib/selo"
import { PASSOS, passoAtual, passoDe, type StatusPedido } from "@/lib/status"
import { useIrParaEtapa } from "./useIrParaEtapa"

type Props = {
  pedido: PedidoDetalhe
  vista: StatusPedido | null // etapa que está na tela (null = a atual)
  aoVer: (vista: StatusPedido | null) => void
}

// Barra fixa no rodapé do pedido (celular e PC): ‹ etapa anterior, Concluir etapa, próxima etapa ›.
// As setas só trocam a etapa que aparece na tela (nunca mudam o status). "Concluir etapa" leva o pedido para a próxima
// (mover_etapa: marca o que faltar e o banco recusa com falta, troca em andamento ou acerto pendente); o aviso de
// "Etapa concluída" vem do pedido, em qualquer avanço.
export default function BarraEtapa({ pedido, vista, aoVer }: Props) {
  const atual = passoAtual(pedido)
  const vistaIdx = vista ? passoDe(vista) : atual
  const { ir, dialogo } = useIrParaEtapa(atual, aoVer)
  const mover = useMoverEtapa(pedido.id, { avisar: false })
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (atual < 0) return null
  const concluido = atual === PASSOS.length - 1
  const proxima = PASSOS[atual + 1]
  const desvio = ehDesvio(pedido.status)
  const pend = pendenciasDaEtapa(PASSOS[atual].id, pedido.pedido_itens, pedido)

  const concluir = () => {
    setErro(null)
    mover.mutate({ destino: proxima.id }, { onSuccess: () => setConfirmando(false), onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível concluir a etapa.") })
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-3 -mb-3 border-t bg-background px-3 py-2 sm:-mx-4 sm:-mb-4 sm:px-4 sm:py-3">
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <Button
          variant="outline"
          size="icon-toque"
          className="shrink-0"
          aria-label={vistaIdx > 0 ? `Etapa anterior: ${PASSOS[vistaIdx - 1].nome}` : "Etapa anterior"}
          disabled={vistaIdx <= 0}
          onClick={() => ir(vistaIdx - 1)}
        >
          <ChevronLeft />
        </Button>
        {concluido ? (
          <div className="flex min-h-11 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">Pedido concluído</div>
        ) : (
          <Button
            size="xl"
            className="min-w-0 flex-1"
            disabled={desvio || mover.isPending}
            title={desvio ? "Resolva a peça em falta com a cliente antes de concluir a etapa" : undefined}
            onClick={() => { setErro(null); setConfirmando(true) }}
          >
            <Check /> Concluir etapa
          </Button>
        )}
        <Button
          variant="outline"
          size="icon-toque"
          className="shrink-0"
          aria-label={vistaIdx < PASSOS.length - 1 ? `Próxima etapa: ${PASSOS[vistaIdx + 1].nome}` : "Próxima etapa"}
          disabled={vistaIdx >= PASSOS.length - 1}
          onClick={() => ir(vistaIdx + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
      {dialogo}
      {!concluido && (
        <RespDialog
          aberto={confirmando}
          aoMudar={(a) => !mover.isPending && setConfirmando(a)}
          titulo={`Concluir ${PASSOS[atual].nome}?`}
          descricao={
            pend.qtd > 0
              ? `${pend.texto}. Será marcado como feito e o pedido vai para ${proxima.nome}.`
              : `Tudo desta etapa já está feito. O pedido vai para ${proxima.nome}.`
          }
        >
          {erro && (
            <Alert variant="destructive" className="mb-2">
              <TriangleAlert />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
            <Button size="toque" disabled={mover.isPending} onClick={concluir}>
              {mover.isPending ? <Spinner /> : <Check />} Concluir etapa
            </Button>
            <Button size="toque" variant="outline" disabled={mover.isPending} onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
          </div>
        </RespDialog>
      )}
    </div>
  )
}
