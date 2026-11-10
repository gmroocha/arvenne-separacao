import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import AvisoConferencia from "./AvisoConferencia"
import { DESCRICAO_ETAPA, ICONE_ETAPA, NOME_ETAPA, destinoAoConcluir, type StatusPedido } from "@/lib/status"

type Props = {
  etapa: StatusPedido | null // etapa que acabou de ser concluída
  aoConfirmar: (destino: StatusPedido) => void
  aoFechar: () => void
}

const nomeConcluida = (e: StatusPedido) => (e === "novo" || e === "aguardando_cliente" ? "Separação" : NOME_ETAPA[e])

// Abre ao concluir uma etapa. O pedido só muda de etapa se a pessoa confirmar.
export default function DialogEtapa({ etapa, aoConfirmar, aoFechar }: Props) {
  const destino = etapa ? destinoAoConcluir(etapa) : null
  const Icone = destino ? ICONE_ETAPA[destino] : null
  return (
    <Dialog open={!!etapa && !!destino} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        {etapa && destino && Icone && (
          <>
            <DialogHeader className="items-center text-center sm:items-start sm:text-left">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icone className="size-6" />
              </div>
              <DialogTitle className="text-lg">{nomeConcluida(etapa)} concluída</DialogTitle>
              <DialogDescription>Próxima: {NOME_ETAPA[destino]}</DialogDescription>
            </DialogHeader>
            {destino === "conferencia" && <AvisoConferencia />}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {(DESCRICAO_ETAPA[destino] ?? []).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" className="h-11" onClick={aoFechar}>
                Ficar aqui
              </Button>
              <Button className="h-11" onClick={() => aoConfirmar(destino)}>
                Ir para {NOME_ETAPA[destino]} <ArrowRight />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
