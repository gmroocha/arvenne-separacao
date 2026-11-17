import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Copy, ExternalLink, FolderOpen, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { atualizarPedido, duplicarVenda, excluirPedido } from "@/lib/api"
import type { Pedido } from "@/lib/tipos"

type Props = { pedido: Pick<Pedido, "id" | "numero" | "origem" | "fase" | "status">; children: ReactNode }

// Clique direito (ou toque longo) no cartão da venda (lista de Vendas) ou do pedido (Arquivo):
// abrir, duplicar a venda, marcar como perdida (venda em aberto) e excluir.
// Excluir: some de todas as telas; o banco guarda os dados e recusa o que não pode (pago na esteira, troca).
export default function MenuContextoVenda({ pedido, children }: Props) {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [dialogo, setDialogo] = useState<"perdida" | "excluir" | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const caminho = pedido.fase === "venda" ? `/vendas/${pedido.id}` : `/pedidos/${pedido.id}`
  const numero = `#${pedido.numero.replace(/^#/, "")}`
  const ehVenda = pedido.fase === "venda"
  const podeDuplicar = pedido.origem === "whatsapp"
  const podeExcluir = ehVenda || (pedido.fase === "arquivo" && pedido.status !== "somada")

  async function marcarPerdida() {
    setDialogo(null)
    try {
      await atualizarPedido(pedido.id, { status: "perdida" })
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success("Venda marcada como perdida")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar como perdida")
    }
  }

  // Sem hooks de mutação por cartão: a lista pode ter centenas de cartões.
  async function executar(acao: () => Promise<void>, erro: string) {
    setOcupado(true)
    try {
      await acao()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erro)
    } finally {
      setOcupado(false)
    }
  }

  const aoDuplicar = () =>
    executar(async () => {
      const nova = await duplicarVenda(pedido.id)
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success(`Venda ${numero} duplicada: #${nova.numero}`)
      navegar(`/vendas/${nova.id}`)
    }, "Não foi possível duplicar a venda")

  const aoExcluir = () =>
    executar(async () => {
      await excluirPedido(pedido.id)
      setDialogo(null)
      await qc.invalidateQueries({ queryKey: ["pedidos"] })
      toast.success(`${ehVenda ? "Venda" : "Pedido"} ${numero} excluído`)
    }, "Não foi possível excluir")

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          <ContextMenuItem onSelect={() => navegar(caminho)}>
            <FolderOpen /> {ehVenda ? "Abrir venda" : "Abrir pedido"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(caminho, "_blank", "noopener")}>
            <ExternalLink /> Abrir em nova aba
          </ContextMenuItem>
          {podeDuplicar && (
            <ContextMenuItem disabled={ocupado} onSelect={() => void aoDuplicar()}>
              <Copy /> Duplicar venda
            </ContextMenuItem>
          )}
          {(ehVenda || podeExcluir) && <ContextMenuSeparator />}
          {ehVenda && (
            <ContextMenuItem variant="destructive" onSelect={() => setDialogo("perdida")}>
              <XCircle /> Marcar como perdida
            </ContextMenuItem>
          )}
          {podeExcluir && (
            <ContextMenuItem variant="destructive" onSelect={() => setDialogo("excluir")}>
              <Trash2 /> {ehVenda ? "Excluir venda" : "Excluir pedido"}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={dialogo === "perdida"} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida?</DialogTitle>
            <DialogDescription>A cliente desistiu. A venda vai para o Arquivo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void marcarPerdida()}>
              Marcar como perdida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialogo === "excluir"} onOpenChange={(a) => !a && !ocupado && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir {ehVenda ? "a venda" : "o pedido"} {numero}?
            </DialogTitle>
            <DialogDescription>
              Some de todas as telas, das buscas e do link da cliente. Não dá para desfazer pelo app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={ocupado} onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button variant="destructive" disabled={ocupado} onClick={() => void aoExcluir()}>
              {ocupado && <Spinner />} Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
