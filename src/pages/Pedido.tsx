import { useEffect, useRef, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { Navigate, useParams } from "react-router"
import AlteracoesDialog from "@/components/pedido/AlteracoesDialog"
import { AlteracoesContexto } from "@/components/pedido/alteracoesContexto"
import AcertoTroca from "@/components/pedido/AcertoTroca"
import AvisoCredito from "@/components/pedido/AvisoCredito"
import BarraEtapa from "@/components/pedido/BarraEtapa"
import CartaoOcorrencias from "@/components/pedido/CartaoOcorrencias"
import Responsaveis from "@/components/pedido/Responsaveis"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { quemAvisar } from "@/lib/equipe"
import { contextoDaEtapa } from "@/lib/etapaVista"
import Cabecalho from "@/components/pedido/Cabecalho"
import EtapaConcluida, { type Concluida } from "@/components/pedido/EtapaConcluida"
import DadosCliente from "@/components/pedido/DadosCliente"
import Etapas from "@/components/pedido/Etapas"
import PainelEtapa from "@/components/pedido/PainelEtapa"
import AdicionarPecas from "@/components/AdicionarPecas"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAcoesItem, useEquipe, useMeuMembro, useSubstituirItem, usePatchPedido, useAlteracoes, usePedido, useRecalcularEtapa, type PedidoDetalhe } from "@/lib/api"
import { ETAPAS_DE_PECAS, statusPelasPecas } from "@/lib/etapa"
import { haMarcasNaFila } from "@/lib/lotePecas"
import { passoAtual, passoDe, passosDe, type StatusPedido } from "@/lib/status"
import { useQueryClient } from "@tanstack/react-query"
import type { Item, NovoItem } from "@/lib/tipos"

function Conteudo({ pedido }: { pedido: PedidoDetalhe }) {
  const patch = usePatchPedido(pedido.id)
  const [verDados, setVerDados] = useState(false)
  const [vistaEscolhida, setVista] = useState<StatusPedido | null>(null) // etapa vista na esteira (null = a atual)
  // V61: "Ver mesmo assim" numa etapa à frente que, nesse meio-tempo, virou a atual é a própria etapa atual.
  // Tratada como "outra etapa", ela escondia o diálogo de concluir.
  const vista = vistaEscolhida !== null && passoDe(vistaEscolhida, pedido.origem) === passoAtual(pedido) ? null : vistaEscolhida
  const acao = useAcoesItem(pedido.id)
  // Mudou a etapa do pedido: volta a mostrar a atual (ajuste durante a renderização, sem efeito). Falta marcada
  // na Conferência ou na Etiquetagem não muda a etapa que a tela mostra: o desvio guarda a etapa de origem (V37).
  const [statusVisto, setStatusVisto] = useState(pedido.status)
  if (statusVisto !== pedido.status) {
    setStatusVisto(pedido.status)
    setVista(null)
  }
  // Qualquer avanço de etapa (botão da barra, última peça marcada, botão do documento, menu) mostra "Etapa X concluída →
  // agora Y". Só para frente: voltar de etapa ou reiniciar não avisa.
  const idxAtual = passoAtual(pedido)
  const passos = passosDe(pedido.origem)
  const membros = useEquipe().data ?? []
  const meuMembro = useMeuMembro()
  const [idxVisto, setIdxVisto] = useState(idxAtual)
  const [concluida, setConcluida] = useState<Concluida | null>(null)
  if (idxVisto !== idxAtual) {
    setIdxVisto(idxAtual)
    if (idxAtual > idxVisto && idxVisto >= 0)
      setConcluida({
        de: passos[idxVisto].nome,
        ate: passos[idxAtual - 1].nome,
        agora: passos[idxAtual].nome,
        pedidoConcluido: pedido.status === "enviado",
        avisar: quemAvisar(passos[idxAtual].id, pedido.responsaveis, membros, meuMembro?.id),
      })
  }
  // O pedido muda de etapa sozinho quando a última peça termina (o banco calcula na mesma gravação). Um pedido que
  // já estava com a etapa completa antes desta versão (ou mexido por outra tela) fica parado: ao abrir, pede o
  // recálculo uma vez por estado, sem fila de peças pendente.
  const qc = useQueryClient()
  const { mutate: recalcularEtapa } = useRecalcularEtapa(pedido.id)
  const tentado = useRef<string | null>(null)
  const devia = statusPelasPecas(pedido.status, pedido.pedido_itens)
  useEffect(() => {
    const chaveEstado = `${pedido.status}>${devia}`
    if (!devia || devia === pedido.status || tentado.current === chaveEstado || haMarcasNaFila(qc, pedido.id)) return
    tentado.current = chaveEstado
    recalcularEtapa()
  }, [devia, pedido.status, pedido.id, qc, recalcularEtapa])
  const foco = ETAPAS_DE_PECAS.includes(pedido.status)
  const [busca, setBusca] = useState("")
  const { mostraBusca } = contextoDaEtapa(pedido, vista)
  const substituirItem = useSubstituirItem()
  const [adicionando, setAdicionando] = useState(false)
  const [trocando, setTrocando] = useState<Item | null>(null)
  const alteracoes = useAlteracoes(pedido.id).data ?? []
  const [verAlteracoes, setVerAlteracoes] = useState<{ foco: string | null; comValores: boolean } | null>(null)

  const aoAdicionar = (novos: NovoItem[]) => {
    if (!trocando) return
    // Substitutas, retirada, acerto e retorno à Separação são uma única operação do banco.
    substituirItem.mutate({ itemId: trocando.id, itens: novos })
  }

  return (
    <AlteracoesContexto.Provider
      value={{ alteracoes, abrir: (o) => setVerAlteracoes({ foco: o?.foco ?? null, comValores: o?.comValores ?? true }) }}
    >
    <div className="flex flex-col gap-4">
      <Cabecalho
        pedido={pedido}
        aoVerDados={foco ? () => setVerDados(true) : undefined}
        semValores={foco}
      >
        <Etapas origem={pedido.origem} status={pedido.status} etapaAntesDesvio={pedido.etapa_antes_desvio} eventos={pedido.pedido_eventos} responsaveis={pedido.responsaveis} vista={vista} aoVer={setVista} pecas={pedido.pedido_itens} />
        {/* Busca de peça e responsável da etapa, na mesma linha; o responsável aparece mesmo sem busca. */}
        <div className="flex items-center gap-2 empty:hidden">
          {mostraBusca && <CampoBusca className="flex-1" valor={busca} aoMudar={setBusca} placeholder="Buscar peça: código, nome ou variante" />}
          <Responsaveis pedido={pedido} className={mostraBusca ? undefined : "ml-auto"} />
        </div>
      </Cabecalho>
      {pedido.pedido_eventos.some((e) => e.tipo === "shopify_alterado") && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>As peças mudaram na Shopify</AlertTitle>
          <AlertDescription>Confira o pedido na Shopify antes de seguir: as quantidades não batem mais com as peças daqui.</AlertDescription>
        </Alert>
      )}
      <CartaoOcorrencias pedidoId={pedido.id} />
      {/* Etapas de peças não mostram dinheiro: o acerto e o "a devolver" aparecem de Nota fiscal em diante. */}
      {!foco && <AcertoTroca pedidoId={pedido.id} aDevolver={pedido.a_devolver} />}
      {!foco && <AvisoCredito pedidoId={pedido.id} />}
      <div className={foco ? "flex flex-col" : "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"}>
        <PainelEtapa
          pedido={pedido}
          vista={vista}
          aoVoltar={() => setVista(null)}
          acao={acao}
          busca={busca}
          patch={patch.mutate}
          aoTrocar={(item) => {
            setTrocando(item)
            setAdicionando(true)
          }}
        />
        {!foco && <DadosCliente pedido={pedido} />}
      </div>

      <BarraEtapa pedido={pedido} vista={vista} aoVer={setVista} />
      <EtapaConcluida dados={concluida} aoContinuar={() => { setConcluida(null); setVista(null) }} />

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
        jaNoPedido={pedido.pedido_itens
          .filter((i) => i.status !== "removido")
          .map((i) => ({ sku: i.sku, shopify_variant_id: i.shopify_variant_id, peca_clube_id: i.peca_clube_id, qtd: i.qtd }))}
      />
      <AlteracoesDialog
        aberto={!!verAlteracoes}
        aoMudar={(a) => !a && setVerAlteracoes(null)}
        alteracoes={alteracoes}
        foco={verAlteracoes?.foco}
        semValores={verAlteracoes ? !verAlteracoes.comValores : false}
      />
    </div>
    </AlteracoesContexto.Provider>
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
  // O banco só mostra o pedido a quem cuida da etapa dele: depois de concluir a etapa, ele segue para a próxima pessoa.
  const foiEmbora = (error as { code?: string } | null)?.code === "PGRST116"
  if (!data)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {foiEmbora ? "Este pedido não está com você. Ele segue com quem cuida da etapa dele." : error ? "Não foi possível carregar o pedido. Tente de novo." : "Pedido não encontrado."}
        </AlertDescription>
      </Alert>
    )
  if (data.fase === "venda") return <Navigate to={`/vendas/${data.id}`} replace />
  // Venda somada: o que importa agora está no pedido principal.
  if (data.status === "somada" && data.somar_em) return <Navigate to={`/pedidos/${data.somar_em}`} replace />
  return (
    <>
      {error && <p className="mb-2 text-xs text-muted-foreground">{foiEmbora ? "Este pedido já seguiu para a próxima etapa e não está mais com você." : "Sem conexão com o servidor: mostrando o último dado carregado."}</p>}
      <Conteudo key={data.id} pedido={data} />
    </>
  )
}
