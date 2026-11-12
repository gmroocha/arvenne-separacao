import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { ClipboardList, ExternalLink, FolderOpen, RotateCcw, XCircle } from "lucide-react"
import type { GrupoAcoes } from "@/components/MenuAcoes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMudarStatus, useReiniciar } from "@/lib/api"
import { ETAPAS_EXPEDICAO, ICONE_ETAPA, NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"
import { motivoEtapa } from "@/lib/regrasEtapas"

type Opcoes = {
  aoVerDados?: () => void // só nas etapas de foco, onde a lateral de dados some
  abrir?: boolean // inclui "Abrir pedido" (usado no cartão da esteira)
  aoCancelado?: () => void
}

// Ações do pedido num lugar só: servem ao "⋯" do cabeçalho e ao clique direito do cartão.
// Devolve os grupos do menu e os diálogos de confirmação (renderize `dialogos` uma vez).
export function useAcoesPedido(pedido: Pick<Pedido, "id" | "status" | "fase" | "shopify_url" | "etapas_permitidas">, opcoes: Opcoes = {}) {
  const navegar = useNavigate()
  const mudarStatus = useMudarStatus()
  const reiniciar = useReiniciar(pedido.id)
  const [cancelando, setCancelando] = useState(false)
  const [reiniciando, setReiniciando] = useState<boolean | null>(null) // true = pedido todo, false = só a etapa

  const grupos: GrupoAcoes[] = [
    {
      itens: [
        ...(opcoes.abrir ? [{ rotulo: "Abrir pedido", icone: FolderOpen, aoClicar: () => navegar(`/pedidos/${pedido.id}`) }] : []),
        ...(opcoes.aoVerDados ? [{ rotulo: "Ver dados do pedido", icone: ClipboardList, aoClicar: opcoes.aoVerDados }] : []),
      ],
    },
    {
      titulo: "Mover para outra etapa",
      estilo: "ghost",
      itens: ETAPAS_EXPEDICAO.map((e) => ({
        rotulo: NOME_ETAPA[e],
        icone: ICONE_ETAPA[e],
        atual: e === pedido.status,
        desabilitado: e !== pedido.status && motivoEtapa(pedido.etapas_permitidas, e) !== null,
        motivo: motivoEtapa(pedido.etapas_permitidas, e) ?? undefined,
        aoClicar: () => mudarStatus.mutate({ pedidoId: pedido.id, para: e as StatusPedido }),
      })),
    },
    {
      itens:
        pedido.fase === "expedicao"
          ? [
              { rotulo: "Reiniciar etapa", icone: RotateCcw, aoClicar: () => setReiniciando(false) },
              { rotulo: "Reiniciar pedido", icone: RotateCcw, aoClicar: () => setReiniciando(true) },
            ]
          : [],
    },
    {
      itens: pedido.shopify_url
        ? [{ rotulo: "Abrir na Shopify", icone: ExternalLink, aoClicar: () => window.open(pedido.shopify_url!, "_blank", "noreferrer") }]
        : [],
    },
    {
      itens: pedido.status !== "cancelado" ? [{ rotulo: "Cancelar pedido", icone: XCircle, destrutivo: true, aoClicar: () => setCancelando(true) }] : [],
    },
  ]

  const dialogos: ReactNode = (
    <>
      <Dialog open={reiniciando !== null} onOpenChange={(a) => !a && setReiniciando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reiniciando ? "Reiniciar o pedido do zero?" : `Reiniciar ${NOME_ETAPA[pedido.status]}?`}</DialogTitle>
            <DialogDescription>
              {reiniciando
                ? "Zera separação, conferência, etiquetagem, bipagem, nota e frete, embalagem e postagem, e volta o pedido para Novo. Peças removidas voltam ao pedido e a troca em andamento é cancelada."
                : "Zera só o que foi feito nesta etapa, para refazer. O pedido continua nela."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReiniciando(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                reiniciar.mutate({ tudo: reiniciando === true, etapa: pedido.status })
                setReiniciando(null)
              }}
            >
              Reiniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido?</DialogTitle>
            <DialogDescription>O pedido sai da expedição e vai para o Arquivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                mudarStatus.mutate({ pedidoId: pedido.id, para: "cancelado" })
                setCancelando(false)
                opcoes.aoCancelado?.()
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
  return { grupos, dialogos }
}
