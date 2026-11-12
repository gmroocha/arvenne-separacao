import { useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import CampoReais from "@/components/CampoReais"
import { ColarCarrinho } from "@/components/comum/ColarCarrinho"
import { LinhaPeca } from "@/components/comum/Peca"
import { Quantidade } from "@/components/comum/Quantidade"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Vazio } from "@/components/comum/Vazio"
import { Button } from "@/components/ui/button"
import { useAcoesItemVenda, useAdicionarItens, type PedidoDetalhe } from "@/lib/api"
import { numeroParaTexto } from "@/lib/formato"
import type { Item, NovoItem } from "@/lib/tipos"

function PrecoInput({ item, aoSalvar }: { item: Item; aoSalvar: (preco: number | null) => void }) {
  const [v, setV] = useState(numeroParaTexto(item.preco))
  return (
    <CampoReais
      className="h-8 w-28"
      aria-label="Preço"
      inputClassName="text-right"
      value={v}
      onValueChange={setV}
      onCommit={(n) => {
        if (n !== item.preco) aoSalvar(n)
      }}
    />
  )
}

type Props = { pedido: PedidoDetalhe }

export default function PecasVenda({ pedido }: Props) {
  const atualizar = useAcoesItemVenda(pedido.id)
  const adicionar = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const itens = pedido.pedido_itens.filter((i) => i.status !== "removido")

  // Carrinho colado: as peças entram direto no pedido, somando nas que já existem.
  async function adicionarLidas(novos: NovoItem[]) {
    await adicionar.mutateAsync({ pedidoId: pedido.id, itens: novos, somar: true })
    const total = novos.reduce((s, i) => s + i.qtd, 0)
    toast.success(`${total} ${total === 1 ? "peça adicionada" : "peças adicionadas"}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <TituloSecao contagem={pedido.qtd_pecas}>Peças</TituloSecao>

      {itens.length === 0 && <Vazio>Nenhuma peça ainda. Adicione do site ou do Clube.</Vazio>}

      {itens.map((i) => (
        <LinhaPeca
          key={i.id}
          tamanho="md"
          item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku, variante: i.variante, adicional: i.adicional }}
          extra={
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PrecoInput key={`${i.id}-${i.preco}`} item={i} aoSalvar={(preco) => atualizar(i.id, { preco })} />
              <Quantidade valor={i.qtd} aoMudar={(qtd) => atualizar(i.id, { qtd })} />
            </div>
          }
        >
          <Button
            variant="ghost"
            size="icon-toque"
            aria-label="Remover peça"
            onClick={() => atualizar(i.id, { status: "removido", observacao: "removida na venda" })}
          >
            <Trash2 />
          </Button>
        </LinhaPeca>
      ))}

      <div className="flex flex-col gap-2">
        <ColarCarrinho aoLer={adicionarLidas} />
        <Button variant="outline" size="toque" className="w-fit" onClick={() => setAdicionando(true)}>
          <Plus /> Adicionar peça
        </Button>
      </div>

      <AdicionarPecas
        comPreco
        aberto={adicionando}
        aoMudar={setAdicionando}
        aoAdicionar={(novos) => adicionar.mutate({ pedidoId: pedido.id, itens: novos, somar: true })}
      />
    </div>
  )
}

