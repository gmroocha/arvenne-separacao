import { Eye } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AcaoItem, CamposPedido, PedidoDetalhe } from "@/lib/api"
import { ehDesvio } from "@/lib/selo"
import { NOME_ETAPA, PASSOS, passoDe, type StatusPedido } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import Bipagem from "./Bipagem"
import Conferencia from "./Conferencia"
import Etiquetagem from "./Etiquetagem"
import { Embalagem, Enviado, Postagem } from "./Fechamento"
import NotaFrete from "./NotaFrete"
import Separacao from "./Separacao"

type Props = {
  pedido: PedidoDetalhe
  vista: StatusPedido | null // etapa vista na esteira (null = a atual)
  aoVoltar: () => void
  acao: AcaoItem
  patch: (campos: CamposPedido) => void
  aoConcluir: () => void
  aoTrocar: (item: Item) => void
}

// O painel muda conforme a etapa vista. Vendo outra etapa que não a atual, o botão de concluir some
// (quem decide mudar de etapa é a atual), mas as ações das peças continuam valendo.
export default function PainelEtapa({ pedido, vista, aoVoltar, acao, patch, aoConcluir, aoTrocar }: Props) {
  const atualIdx = passoDe(pedido.status)
  const vistaIdx = vista ? passoDe(vista) : atualIdx
  const somenteVer = vista !== null && vistaIdx !== atualIdx
  const concluir = somenteVer ? undefined : aoConcluir
  const etapa = vistaIdx >= 0 ? PASSOS[vistaIdx].id : null

  const painel = () => {
    switch (etapa) {
      case "separacao":
        return <Separacao pedido={pedido} acao={acao} aoTrocar={aoTrocar} aoConcluir={concluir} />
      case "conferencia":
        return <Conferencia pedido={pedido} acao={acao} aoTrocar={aoTrocar} aoConcluir={concluir} />
      case "etiquetagem":
        return <Etiquetagem pedido={pedido} acao={acao} aoTrocar={aoTrocar} aoConcluir={concluir} />
      case "bipagem":
        return <Bipagem pedido={pedido} acao={acao} aoConcluir={concluir} />
      case "faturamento":
        return <NotaFrete pedido={pedido} patch={patch} aoConcluir={concluir} />
      case "embalagem":
        return <Embalagem pedido={pedido} patch={patch} aoConcluir={concluir} />
      case "pronto_envio":
        return <Postagem pedido={pedido} patch={patch} aoConcluir={concluir} />
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

  return (
    <div className="flex flex-col gap-4">
      {somenteVer && (
        <Alert>
          <Eye />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {ehDesvio(pedido.status) && vistaIdx > atualIdx
                ? `Peça em falta: o pedido volta para ${PASSOS[atualIdx].nome} até resolver com a cliente. As outras peças continuam como estão.`
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
  )
}
