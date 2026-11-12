import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import { Navigate, useParams } from "react-router"
import AcertoTroca from "@/components/pedido/AcertoTroca"
import Cabecalho from "@/components/pedido/Cabecalho"
import DadosCliente from "@/components/pedido/DadosCliente"
import Etapas from "@/components/pedido/Etapas"
import DialogEtapa from "@/components/pedido/DialogEtapa"
import PainelEtapa from "@/components/pedido/PainelEtapa"
import AdicionarPecas from "@/components/AdicionarPecas"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAcoesItem, useAdicionarItens, useMudarStatus, usePatchPedido, usePedido, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { ETAPAS_DE_PECAS } from "@/lib/etapa"
import { PASSOS, passoDe, type StatusPedido } from "@/lib/status"
import type { Item, NovoItem } from "@/lib/tipos"

function Conteudo({ pedido }: { pedido: PedidoDetalhe }) {
  const qc = useQueryClient()
  const mudarStatus = useMudarStatus()
  const patch = usePatchPedido(pedido.id)
  const [concluida, setConcluida] = useState<StatusPedido | null>(null) // etapa que abriu o Dialog
  const [verDados, setVerDados] = useState(false)
  const [vista, setVista] = useState<StatusPedido | null>(null) // etapa vista na esteira (null = a atual)
  const vistaRef = useRef(vista)
  useEffect(() => {
    vistaRef.current = vista
  }, [vista])
  // O Dialog de concluir só abre a partir da etapa atual: vendo outra, as ações das peças não o disparam.
  const acaoBase = useAcoesItem(pedido.id, (e) => {
    if (vistaRef.current === null) setConcluida(e)
  })
  // Falta/defeito marcada na Conferência ou na Etiquetagem leva o pedido a "avisar cliente" (passo da
  // Separação). A tela fica na etapa onde a pessoa estava, com o cartão da falta em cima e as outras
  // peças como estavam; antes ela pulava para a Separação, com tudo verde, e parecia que tinha conferido tudo.
  const [manter, setManter] = useState<StatusPedido | null>(null)
  const acao: AcaoItem = (item, campos, ...resto) => {
    const passo = PASSOS[passoDe(pedido.status)]?.id
    if ((campos.status === "falta" || campos.status === "defeito") && vista === null && passo && passo !== "separacao") {
      setVista(passo)
      setManter(passo)
    }
    return acaoBase(item, campos, ...resto)
  }
  // Mudou a etapa do pedido: volta a mostrar a atual (ajuste durante a renderização, sem efeito).
  const [statusVisto, setStatusVisto] = useState(pedido.status)
  if (statusVisto !== pedido.status) {
    setStatusVisto(pedido.status)
    setVista(manter)
    setManter(null)
  }
  const foco = ETAPAS_DE_PECAS.includes(pedido.status)
  const adicionarItens = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const [trocando, setTrocando] = useState<Item | null>(null)

  const aoAdicionar = (novos: NovoItem[]) => {
    const velha = trocando
    // Depois da separação a peça nova já entra como encontrada (as etapas só mostram essas).
    const jaEncontradas = ["conferencia", "etiquetagem", "bipagem"].includes(pedido.status)
    adicionarItens.mutate(
      { pedidoId: pedido.id, itens: novos, jaEncontradas },
      {
        // A peça antiga só sai depois que a nova entrou de verdade. Recarrega antes, para a checagem de
        // etapa completa enxergar a peça nova (e não abrir o Dialog antes da hora).
        onSuccess: async () => {
          if (!velha) return
          await qc.refetchQueries({ queryKey: ["pedido", pedido.id] })
          const dados = novos[0]
          acao(velha, {
            status: "removido",
            observacao: `trocada por ${[dados.sku, dados.nome].filter(Boolean).join(" · ")}`,
          })
        },
      },
    )
    if (velha) {
      setTrocando(null)
      setAdicionando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecalho
        pedido={pedido}
        aoVerDados={foco ? () => setVerDados(true) : undefined}
      />
      {pedido.pedido_eventos.some((e) => e.tipo === "shopify_alterado") && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>As peças mudaram na Shopify</AlertTitle>
          <AlertDescription>Confira o pedido na Shopify antes de seguir: as quantidades não batem mais com as peças daqui.</AlertDescription>
        </Alert>
      )}
      <Etapas status={pedido.status} eventos={pedido.pedido_eventos} vista={vista} aoVer={setVista} />
      {/* Etapas de peças não mostram dinheiro: o acerto e o "a devolver" aparecem de Nota e frete em diante. */}
      {!foco && <AcertoTroca pedidoId={pedido.id} aDevolver={pedido.a_devolver} />}
      <div className={foco ? "flex flex-col" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"}>
        <PainelEtapa
          pedido={pedido}
          vista={vista}
          aoVoltar={() => setVista(null)}
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
        comLink
        aberto={adicionando}
        aoMudar={(a) => {
          setAdicionando(a)
          if (!a) setTrocando(null)
        }}
        aoAdicionar={aoAdicionar}
        jaNoPedido={pedido.pedido_itens
          .filter((i) => i.status !== "removido")
          .map((i) => ({ sku: i.sku, shopify_variant_id: i.shopify_variant_id, peca_clube_id: i.peca_clube_id, qtd: i.qtd }))}
      />
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
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ? "Não foi possível carregar o pedido. Tente de novo." : "Pedido não encontrado."}</AlertDescription>
      </Alert>
    )
  if (data.fase === "venda") return <Navigate to={`/vendas/${data.id}`} replace />
  return (
    <>
      {error && <p className="mb-2 text-xs text-muted-foreground">Sem conexão com o servidor: mostrando o último dado carregado.</p>}
      <Conteudo key={data.id} pedido={data} />
    </>
  )
}
