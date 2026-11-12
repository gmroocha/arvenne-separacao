import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useMudarStatus, type PedidoDetalhe } from "@/lib/api"

// Peça ainda pendente (não achada) num pedido que já passou da Separação: ela não aparece nesta etapa e
// a etapa nunca completa. Avisa e oferece voltar o pedido para a Separação (o que já foi feito continua).
export default function AvisoPendentes({ pedido }: { pedido: PedidoDetalhe }) {
  const mudarStatus = useMudarStatus()
  const n = pedido.pedido_itens.filter((i) => i.status === "pendente").length
  if (n === 0 || !["conferencia", "etiquetagem", "bipagem"].includes(pedido.status)) return null
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>
        {n === 1 ? "1 peça ainda não foi separada" : `${n} peças ainda não foram separadas`}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>Ela{n === 1 ? "" : "s"} não aparece{n === 1 ? "" : "m"} aqui. Volte para a Separação para achá-la{n === 1 ? "" : "s"}; o que já foi feito continua.</span>
        <Button
          size="toque"
          variant="outline"
          className="shrink-0 text-foreground"
          disabled={mudarStatus.isPending}
          onClick={() => mudarStatus.mutate({ pedidoId: pedido.id, para: "separacao", silencioso: true })}
        >
          Voltar para a Separação
        </Button>
      </AlertDescription>
    </Alert>
  )
}
