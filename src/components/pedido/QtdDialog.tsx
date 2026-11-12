import { useState } from "react"
import { Check } from "lucide-react"
import { Quantidade } from "@/components/comum/Quantidade"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { useMudarQtd, type PedidoDetalhe } from "@/lib/api"
import type { Item } from "@/lib/tipos"

// Frase que explica o efeito da nova quantidade. "Pago" = pedido com pago_em: aí o que passa da
// quantidade original vira peça adicional (a cobrar).
function frase(item: Item, nova: number, pago: boolean): string {
  const dif = nova - item.qtd
  if (dif === 0) return "Escolha a nova quantidade."
  if (dif < 0) return `${-dif} ${-dif === 1 ? "sai" : "saem"} do pedido (fica no histórico).`
  if (pago && !item.adicional) return `${dif} a mais ${dif === 1 ? "vai" : "vão"} para Peças adicionais (a cobrar).`
  return `${dif} a mais.`
}

// Diálogo "Mudar quantidade" (mesmo desenho do "Quantas faltam?"). Devolve `pedir(item)` para o menu da
// peça e o `dialogo` para ficar na tela da etapa.
export function useMudarQtdDialogo(pedido: PedidoDetalhe) {
  const mudar = useMudarQtd(pedido.id)
  const [item, setItem] = useState<Item | null>(null)
  const [qtd, setQtd] = useState(1)
  const pago = !!pedido.pago_em
  // Depois da separação a peça nova já entra como encontrada (mesma regra de jaEncontradas em Pedido.tsx).
  const encontrada = ["conferencia", "etiquetagem", "bipagem"].includes(pedido.status)

  const pedir = (i: Item) => {
    setQtd(i.qtd)
    setItem(i)
  }
  const confirmar = () => {
    if (!item || qtd === item.qtd) return
    mudar.mutate({ item, qtd, encontrada })
    setItem(null)
  }

  const dialogo = (
    <RespDialog
      aberto={!!item}
      aoMudar={(a) => !a && setItem(null)}
      titulo="Mudar quantidade"
      descricao={item ? `${item.sku ?? item.nome} · o pedido tem ${item.qtd}` : undefined}
    >
      {item && (
        <div className="flex flex-col gap-5 pt-2">
          <Quantidade tamanho="grande" valor={qtd} min={1} max={99} rotulo="uma" aoMudar={setQtd} />
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">{frase(item, qtd, pago)}</p>
          <Button size="xl" disabled={qtd === item.qtd} onClick={confirmar}>
            <Check /> Confirmar {qtd}
          </Button>
        </div>
      )}
    </RespDialog>
  )
  return { pedir, dialogo }
}
