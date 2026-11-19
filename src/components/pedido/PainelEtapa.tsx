import { Eye } from "lucide-react"
import { Vazio } from "@/components/comum/Vazio"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AcaoItem, CamposPedido, PedidoDetalhe } from "@/lib/api"
import { ehDesvio } from "@/lib/selo"
import { contextoDaEtapa } from "@/lib/etapaVista"
import { NOME_ETAPA, passosDe, type StatusPedido } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import Bipagem from "./Bipagem"
import Conferencia from "./Conferencia"
import Problemas from "./Problemas"
import EmbalagemFrete from "./EmbalagemFrete"
import { EnviarRastreio, Enviado, Postagem } from "./Fechamento"
import NotaFrete from "./NotaFrete"
import Separacao from "./Separacao"
import { BuscaPecaContexto } from "./buscaPecaContexto"
import { combinaBusca } from "@/lib/buscaPeca"

type Props = {
  pedido: PedidoDetalhe
  vista: StatusPedido | null // etapa vista na esteira (null = a atual)
  aoVoltar: () => void
  acao: AcaoItem
  patch: (campos: CamposPedido) => void
  aoTrocar: (item: Item) => void
  busca: string // texto do campo de busca (fica no cabeçalho fixo da página)
}

// O painel muda conforme a etapa vista. O pedido muda de etapa sozinho quando a etapa termina; nas etapas
// de peça as ações valem em qualquer uma delas, nas de documentos só a etapa atual trabalha.
export default function PainelEtapa({ pedido, vista, aoVoltar, acao, patch, aoTrocar, busca }: Props) {
  const { atualIdx, vistaIdx, etapa, somenteVer, cartaoDoDesvio, comBusca } = contextoDaEtapa(pedido, vista)
  const PASSOS = passosDe(pedido.origem)

  const painel = () => {
    switch (etapa) {
      case "separacao":
        return <Separacao pedido={pedido} acao={acao} aoTrocar={aoTrocar} />
      case "conferencia":
        return <Conferencia pedido={pedido} acao={acao} aoTrocar={aoTrocar} />
      case "bipagem":
        return <Bipagem pedido={pedido} acao={acao} />
      case "faturamento":
        return <NotaFrete pedido={pedido} patch={patch} />
      case "embalagem":
        return <EmbalagemFrete pedido={pedido} patch={patch} />
      case "pronto_envio":
        return <Postagem pedido={pedido} patch={patch} />
      case "enviar_rastreio":
        return <EnviarRastreio pedido={pedido} patch={patch} />
      case "enviado":
        return <Enviado pedido={pedido} patch={patch} />
      default:
        return (
          <Alert>
            <AlertDescription>Pedido {NOME_ETAPA[pedido.status].toLowerCase()}. Use o menu "…" para movê-lo de etapa.</AlertDescription>
          </Alert>
        )
    }
  }

  const nenhuma = comBusca && busca.trim() !== "" && !pedido.pedido_itens.some((i) => combinaBusca(i, busca))

  return (
    <BuscaPecaContexto.Provider value={comBusca ? busca : ""}>
    <div className="flex flex-col gap-4">
      {nenhuma && <Vazio>Nenhuma peça com “{busca.trim()}” neste pedido.</Vazio>}
      {cartaoDoDesvio && <Problemas pedido={pedido} acao={acao} aoTrocar={aoTrocar} />}
      {somenteVer && (
        <Alert className="sm:items-center sm:*:[svg]:translate-y-0">
          <Eye />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {ehDesvio(pedido.status) && vistaIdx > atualIdx
                ? `Peça em falta: o pedido espera em ${PASSOS[atualIdx].nome} até resolver com a cliente. As outras peças continuam como estão.`
                : `Você está vendo ${PASSOS[vistaIdx].nome}. O pedido está em ${PASSOS[atualIdx].nome}.`}
            </span>
            <Button size="toque" variant="outline" className="shrink-0" onClick={aoVoltar}>
              Voltar para {PASSOS[atualIdx].nome}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {painel()}
    </div>
    </BuscaPecaContexto.Provider>
  )
}
