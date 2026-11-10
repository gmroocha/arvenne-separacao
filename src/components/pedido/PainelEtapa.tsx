import { Alert, AlertDescription } from "@/components/ui/alert"
import type { AcaoItem, CamposPedido, PedidoDetalhe } from "@/lib/api"
import { NOME_ETAPA } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import Bipagem from "./Bipagem"
import Conferencia from "./Conferencia"
import Etiquetagem from "./Etiquetagem"
import { Embalagem, Enviado, Postagem } from "./Fechamento"
import NotaFrete from "./NotaFrete"
import Separacao from "./Separacao"

type Props = {
  pedido: PedidoDetalhe
  acao: AcaoItem
  patch: (campos: CamposPedido) => void
  aoConcluir: () => void
  aoTrocar: (item: Item) => void
  aoAdicionar: () => void
}

// O painel muda conforme a etapa atual do pedido.
export default function PainelEtapa({ pedido, acao, patch, aoConcluir, aoTrocar, aoAdicionar }: Props) {
  switch (pedido.status) {
    case "novo":
    case "separacao":
    case "avisar_cliente":
    case "aguardando_cliente":
      return <Separacao pedido={pedido} acao={acao} aoTrocar={aoTrocar} aoAdicionar={aoAdicionar} aoConcluir={aoConcluir} />
    case "conferencia":
      return <Conferencia pedido={pedido} acao={acao} aoConcluir={aoConcluir} />
    case "etiquetagem":
      return <Etiquetagem pedido={pedido} acao={acao} aoConcluir={aoConcluir} />
    case "bipagem":
      return <Bipagem pedido={pedido} acao={acao} aoConcluir={aoConcluir} />
    case "faturamento":
      return <NotaFrete pedido={pedido} patch={patch} aoConcluir={aoConcluir} />
    case "embalagem":
      return <Embalagem pedido={pedido} patch={patch} aoConcluir={aoConcluir} />
    case "pronto_envio":
      return <Postagem pedido={pedido} patch={patch} aoConcluir={aoConcluir} />
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
