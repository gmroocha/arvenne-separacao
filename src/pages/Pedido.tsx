import { useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import Cabecalho from "@/components/pedido/Cabecalho"
import DadosCliente from "@/components/pedido/DadosCliente"
import Etapas from "@/components/pedido/Etapas"
import DialogEtapa from "@/components/pedido/DialogEtapa"
import PainelEtapa from "@/components/pedido/PainelEtapa"
import AdicionarPecas from "@/components/AdicionarPecas"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAcoesItem, useAdicionarItens, useMudarStatus, usePatchPedido, usePedido, useReiniciar, type PedidoDetalhe } from "@/lib/api"
import { ETAPAS_DE_PECAS } from "@/lib/etapa"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Item, NovoItem } from "@/lib/tipos"

function Conteudo({ pedido }: { pedido: PedidoDetalhe }) {
  const navegar = useNavigate()
  const mudarStatus = useMudarStatus()
  const patch = usePatchPedido(pedido.id)
  const [concluida, setConcluida] = useState<StatusPedido | null>(null) // etapa que abriu o Dialog
  const [verDados, setVerDados] = useState(false)
  const acao = useAcoesItem(pedido.id, setConcluida)
  const foco = ETAPAS_DE_PECAS.includes(pedido.status)
  const adicionarItens = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const [trocando, setTrocando] = useState<Item | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const reiniciar = useReiniciar(pedido.id)
  const [reiniciando, setReiniciando] = useState<boolean | null>(null) // true = pedido todo, false = só a etapa

  const aoAdicionar = (novos: NovoItem[]) => {
    adicionarItens.mutate({ pedidoId: pedido.id, itens: novos })
    if (trocando) {
      const dados = novos[0]
      acao(trocando, {
        status: "removido",
        observacao: `trocada por ${[dados.sku, dados.nome].filter(Boolean).join(" · ")}`,
      })
      setTrocando(null)
      setAdicionando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho
        pedido={pedido}
        aoMover={(para) => mudarStatus.mutate({ pedidoId: pedido.id, para })}
        aoCancelar={() => setCancelando(true)}
        aoReiniciar={setReiniciando}
        aoVerDados={foco ? () => setVerDados(true) : undefined}
      />
      <Etapas status={pedido.status} eventos={pedido.pedido_eventos} />
      <div className={foco ? "flex flex-col" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"}>
        <PainelEtapa
          pedido={pedido}
          acao={acao}
          patch={patch.mutate}
          aoConcluir={() => setConcluida(pedido.status)}
          aoAdicionar={() => setAdicionando(true)}
          aoTrocar={(item) => {
            setTrocando(item)
            setAdicionando(true)
          }}
        />
        {!foco && <DadosCliente pedido={pedido} />}
      </div>

      <DialogEtapa
        etapa={concluida}
        aoFechar={() => setConcluida(null)}
        aoConfirmar={(para) => {
          mudarStatus.mutate({ pedidoId: pedido.id, para, silencioso: true })
          setConcluida(null)
        }}
      />

      <Sheet open={verDados} onOpenChange={setVerDados}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Dados do pedido</SheetTitle>
            <SheetDescription>Cliente, valores e histórico.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <DadosCliente pedido={pedido} semRecolher />
          </div>
        </SheetContent>
      </Sheet>

      <AdicionarPecas
        aberto={adicionando}
        aoMudar={(a) => {
          setAdicionando(a)
          if (!a) setTrocando(null)
        }}
        aoAdicionar={aoAdicionar}
      />

      <Dialog open={reiniciando !== null} onOpenChange={(a) => !a && setReiniciando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reiniciando ? "Reiniciar o pedido do zero?" : `Reiniciar ${NOME_ETAPA[pedido.status]}?`}</DialogTitle>
            <DialogDescription>
              {reiniciando
                ? "Zera separação, conferência, etiquetagem, bipagem, nota e frete, embalagem e postagem, e volta o pedido para Novo. Peças removidas continuam removidas."
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
