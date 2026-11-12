import { Check, Undo2 } from "lucide-react"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { reais } from "@/lib/formato"
import type { Pedido } from "@/lib/tipos"

type Props = {
  pedido: Pedido
  // Grava adicionais_recebido_em: data ISO ao marcar, null ao desfazer.
  aoMudar: (recebidoEm: string | null) => void
}

// Peças que entraram depois do pagamento: mostra o que falta cobrar (valor calculado pelo banco) e deixa
// marcar "Recebido". Não aparece quando não há peças adicionais.
export function AdicionaisACobrar({ pedido, aoMudar }: Props) {
  const valor = pedido.valor_adicionais ?? 0
  if (valor <= 0) return null
  const recebido = !!pedido.adicionais_recebido_em
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <LinhaValor
        forte
        rotulo={`Peças adicionais · ${recebido ? "recebido" : "a cobrar"}`}
        valor={reais(recebido ? valor : (pedido.adicionais_a_cobrar ?? valor))}
      />
      {recebido ? (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="gap-1">
            <Check /> Recebido
          </Badge>
          <Button variant="ghost" size="toque" onClick={() => aoMudar(null)}>
            <Undo2 /> Desfazer
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="xl" onClick={() => aoMudar(new Date().toISOString())}>
          <Check /> Recebido
        </Button>
      )}
    </div>
  )
}
