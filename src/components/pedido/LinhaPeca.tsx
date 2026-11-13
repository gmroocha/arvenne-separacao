import type { ReactNode } from "react"
import { LinhaPeca as LinhaPecaComum } from "@/components/comum/Peca"
import { useAlteracoesDoPedido } from "@/components/pedido/alteracoesContexto"
import type { Item } from "@/lib/tipos"

type Props = {
  item: Item
  compacta?: boolean
  saindo?: boolean
  entrando?: boolean
  esmaecida?: boolean
  semNome?: boolean
  children?: ReactNode // botões à direita
}

// Linha de peça da separação: usa a linha comum (compacta = foto pequena; padrão = foto grande, variante em destaque).
export default function LinhaPeca({ item, compacta, saindo, entrando, esmaecida, semNome, children }: Props) {
  const { abrir } = useAlteracoesDoPedido()
  const aoClicarObservacao = abrir && item.troca_peca_origem_id ? () => abrir({ foco: item.id, comValores: false }) : undefined
  return (
    <LinhaPecaComum
      item={item}
      tamanho={compacta ? "sm" : "lg"}
      destaque={!compacta}
      riscada={item.status === "removido"}
      saindo={saindo}
      entrando={entrando}
      esmaecida={esmaecida}
      semNome={semNome}
      aoClicarObservacao={aoClicarObservacao}
    >
      {children}
    </LinhaPecaComum>
  )
}
