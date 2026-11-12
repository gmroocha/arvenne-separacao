import { useState } from "react"
import { toast } from "sonner"
import { Check } from "lucide-react"
import { Quantidade } from "@/components/comum/Quantidade"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { useMudarQtd, useMudarStatus, type PedidoDetalhe } from "@/lib/api"
import type { Item } from "@/lib/tipos"

// Etapas depois da Separação: lá só aparecem peças já achadas.
const DEPOIS_DA_SEPARACAO = ["conferencia", "etiquetagem", "bipagem"]

// As unidades a mais viram uma linha pendente à parte (mesma regra da função mudar_qtd no banco)?
const criaLinha = (item: Item, pago: boolean) => item.status !== "pendente" || (pago && !item.adicional)

// Frase que explica o efeito da nova quantidade. "Pago" = pedido com pago_em: aí o que passa da
// quantidade original vira peça adicional (a cobrar). Unidade a mais sempre precisa ser separada.
function frase(item: Item, nova: number, pago: boolean, depois: boolean): string {
  const dif = nova - item.qtd
  if (dif === 0) return "Escolha a nova quantidade."
  if (dif < 0) return `${-dif} ${-dif === 1 ? "sai" : "saem"} do pedido (fica no histórico).`
  if (!criaLinha(item, pago)) return `${dif} a mais.`
  const vai = dif === 1 ? "vai" : "vão"
  const texto = pago && !item.adicional ? `${dif} a mais ${vai} para Peças adicionais (a cobrar), para separar.` : `${dif} a mais ${vai} para separar.`
  return depois ? `${texto} O pedido volta para a Separação.` : texto
}

// Diálogo "Mudar quantidade" (mesmo desenho do "Quantas faltam?"). Devolve `pedir(item)` para o menu da
// peça e o `dialogo` para ficar na tela da etapa.
export function useMudarQtdDialogo(pedido: PedidoDetalhe) {
  const mudar = useMudarQtd(pedido.id)
  const [item, setItem] = useState<Item | null>(null)
  const [qtd, setQtd] = useState(1)
  const mudarStatus = useMudarStatus()
  const pago = !!pedido.pago_em
  const depois = DEPOIS_DA_SEPARACAO.includes(pedido.status)

  const pedir = (i: Item) => {
    setQtd(i.qtd)
    setItem(i)
  }
  const confirmar = () => {
    if (!item || qtd === item.qtd) return
    // Unidade a mais nasce pendente: depois da Separação o pedido volta para lá (as outras peças ficam como estão).
    const voltar = depois && qtd > item.qtd && criaLinha(item, pago)
    mudar.mutate(
      { item, qtd },
      {
        onSuccess: () => {
          if (!voltar) return
          mudarStatus.mutate({ pedidoId: pedido.id, para: "separacao", silencioso: true })
          toast.info("Separe as unidades a mais: o pedido voltou para a Separação")
        },
      },
    )
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
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">{frase(item, qtd, pago, depois)}</p>
          <Button size="xl" disabled={qtd === item.qtd} onClick={confirmar}>
            <Check /> Confirmar {qtd}
          </Button>
        </div>
      )}
    </RespDialog>
  )
  return { pedir, dialogo }
}
