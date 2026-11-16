import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { ExternalLink, FolderOpen, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { atualizarPedido } from "@/lib/api"
import type { Pedido } from "@/lib/tipos"

// Clique direito (ou toque longo) no cartão da venda: abrir e marcar como perdida, como na tela da venda.
export default function MenuContextoVenda({ pedido, children }: { pedido: Pick<Pedido, "id">; children: ReactNode }) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [perdendo, setPerdendo] = useState(false)
  const caminho = `/vendas/${pedido.id}`

  async function marcarPerdida() {
    setPerdendo(false)
    try {
      await atualizarPedido(pedido.id, { status: "perdida" })
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success("Venda marcada como perdida")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como perdida")
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          <ContextMenuItem onSelect={() => navegar(caminho)}>
            <FolderOpen /> Abrir venda
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(caminho, "_blank", "noopener")}>
            <ExternalLink /> Abrir em nova aba
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setPerdendo(true)}>
            <XCircle /> Marcar como perdida
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={perdendo} onOpenChange={setPerdendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida?</DialogTitle>
            <DialogDescription>A cliente desistiu. A venda vai para o Arquivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerdendo(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void marcarPerdida()}>
              Marcar como perdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
