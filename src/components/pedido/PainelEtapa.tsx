import { Alert, AlertDescription } from "@/components/ui/alert"
import type { PedidoDetalhe } from "@/lib/api"
import { NOME_ETAPA } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import Checklist, { CampoRastreio } from "./Checklist"
import Conferencia from "./Conferencia"
import Separacao from "./Separacao"

type Props = {
  pedido: PedidoDetalhe
  aoTrocar: (item: Item) => void
  aoAdicionar: () => void
}

// O painel muda conforme a etapa atual do pedido.
export default function PainelEtapa({ pedido, aoTrocar, aoAdicionar }: Props) {
  switch (pedido.status) {
    case "novo":
    case "separacao":
    case "aguardando_cliente":
      return <Separacao pedido={pedido} aoTrocar={aoTrocar} aoAdicionar={aoAdicionar} />
    case "conferencia":
      return <Conferencia pedido={pedido} />
    case "faturamento":
    case "embalagem":
    case "pronto_envio":
      return <Checklist pedido={pedido} />
    case "enviado":
      return (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Enviado</h3>
          <CampoRastreio pedido={pedido} />
        </div>
      )
    default:
      return (
        <Alert>
          <AlertDescription>Pedido {NOME_ETAPA[pedido.status].toLowerCase()}. Use o menu "…" para movê-lo de etapa.</AlertDescription>
        </Alert>
      )
  }
}
