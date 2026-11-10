import { useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import Cabecalho from "@/components/pedido/Cabecalho"
import DadosCliente from "@/components/pedido/DadosCliente"
import Etapas from "@/components/pedido/Etapas"
import PainelEtapa from "@/components/pedido/PainelEtapa"
import AdicionarPecas from "@/components/AdicionarPecas"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useAcaoItem, useAdicionarItens, useMudarStatus, usePedido, type PedidoDetalhe } from "@/lib/api"
import type { Item, NovoItem } from "@/lib/tipos"

function Conteudo({ pedido }: { pedido: PedidoDetalhe }) {
  const navegar = useNavigate()
  const mudarStatus = useMudarStatus()
  const acaoItem = useAcaoItem(pedido)
  const adicionarItens = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const [trocando, setTrocando] = useState<Item | null>(null)
  const [cancelando, setCancelando] = useState(false)

  const aoAdicionar = (novos: NovoItem[]) => {
    adicionarItens.mutate({ pedidoId: pedido.id, itens: novos })
    if (trocando) {
      const dados = novos[0]
      acaoItem.mutate({
        item: trocando,
        para: "removido",
        observacao: `trocada por ${[dados.sku, dados.nome].filter(Boolean).join(" · ")}`,
      })
      setTrocando(null)
      setAdicionando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho pedido={pedido} aoMover={(para) => mudarStatus.mutate({ pedidoId: pedido.id, para })} aoCancelar={() => setCancelando(true)} />
      <Etapas status={pedido.status} eventos={pedido.pedido_eventos} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <PainelEtapa
          pedido={pedido}
          aoAdicionar={() => setAdicionando(true)}
          aoTrocar={(item) => {
            setTrocando(item)
            setAdicionando(true)
          }}
        />
        <DadosCliente pedido={pedido} />
      </div>

      <AdicionarPecas
        aberto={adicionando}
        aoMudar={(a) => {
          setAdicionando(a)
          if (!a) setTrocando(null)
        }}
        aoAdicionar={aoAdicionar}
      />

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
                navegar("/")
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function Pedido() {
  const { id } = useParams()
  const { data, isLoading, error } = usePedido(id)
  if (isLoading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertDescription>Pedido não encontrado.</AlertDescription>
      </Alert>
    )
  if (data.fase === "venda") return <Navigate to={`/vendas/${data.id}`} replace />
  return <Conteudo key={data.id} pedido={data} />
}
