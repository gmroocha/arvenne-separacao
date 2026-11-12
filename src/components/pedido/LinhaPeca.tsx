import type { ReactNode } from "react"
import { LinhaPeca as LinhaPecaComum } from "@/components/comum/Peca"
import type { Item } from "@/lib/tipos"

type Props = {
  item: Item
  compacta?: boolean
  saindo?: boolean
  entrando?: boolean
  esmaecida?: boolean
  children?: ReactNode // botões à direita
}

// Linha de peça da separação: usa a linha comum (compacta = foto pequena; padrão = foto grande, variante em destaque).
export default function LinhaPeca({ item, compacta, saindo, entrando, esmaecida, children }: Props) {
  return (
    <LinhaPecaComum
      item={item}
      tamanho={compacta ? "sm" : "lg"}
      destaque={!compacta}
      riscada={item.status === "removido"}
      saindo={saindo}
      entrando={entrando}
      esmaecida={esmaecida}
    >
      {children}
    </LinhaPecaComum>
  )
}
