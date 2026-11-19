import { useState, type ReactNode } from "react"
import type { GrupoAcoes } from "@/components/MenuAcoes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMoverEtapa, useSouGestor } from "@/lib/api"
import { ETAPAS_MOVER, ICONE_ETAPA, NOME_ETAPA, passoDe, passosDe, temEnviarRastreio, type StatusPedido } from "@/lib/status"

// Reabrir pedido concluído: só o gestor volta um pedido de Concluídos para uma etapa anterior (o banco confere de novo).
// Serve ao "⋯" da tela do pedido e ao menu de cada linha de Concluídos. Renderize `dialogo` uma vez.
type PedidoConcluidoMenu = { id: string; origem?: string | null; status: StatusPedido }

// O que o diálogo avisa: tudo do destino até a etapa antes de Concluído é desfeito; a entrega marcada também.
export function textoReabrir(destino: StatusPedido, origem?: string | null): string {
  const nomes = passosDe(origem).map((p) => p.nome)
  const idx = passoDe(destino, origem)
  if (idx < 0) return ""
  const desfeitas = nomes.slice(idx, nomes.length - 1).join(", ")
  return `O que foi feito desta etapa em diante será desfeito (${desfeitas}), e a entrega marcada também. As etapas anteriores continuam como estão. O pedido sai de Concluídos e volta para a Expedição, em ${nomes[idx]}.`
}

export function useReabrirConcluido(pedido: PedidoConcluidoMenu): { grupo: GrupoAcoes; dialogo: ReactNode } {
  const gestor = useSouGestor()
  const mover = useMoverEtapa(pedido.id)
  const [destino, setDestino] = useState<StatusPedido | null>(null)
  const pode = pedido.status === "enviado" && gestor === true
  const etapas = ETAPAS_MOVER.filter((e) => e !== "enviado" && (e !== "enviar_rastreio" || temEnviarRastreio(pedido.origem)))

  const grupo: GrupoAcoes = {
    titulo: "Mover para outra etapa",
    estilo: "ghost",
    itens: pode ? etapas.map((e) => ({ rotulo: NOME_ETAPA[e], icone: ICONE_ETAPA[e], aoClicar: () => setDestino(e) })) : [],
  }

  const dialogo = (
    <Dialog open={destino !== null} onOpenChange={(a) => !a && setDestino(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{destino ? `Reabrir em ${NOME_ETAPA[destino]}?` : ""}</DialogTitle>
          <DialogDescription>{destino ? textoReabrir(destino, pedido.origem) : ""}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDestino(null)}>
            Voltar
          </Button>
          <Button
            onClick={() => {
              if (destino) mover.mutate({ destino })
              setDestino(null)
            }}
          >
            Reabrir pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { grupo, dialogo }
}
