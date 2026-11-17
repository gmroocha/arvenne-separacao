import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Hand, Plus, ShoppingBag, Trash2 } from "lucide-react"
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

// Grupo de peças da venda com um rótulo pequeno (ex.: "Do carrinho da cliente · 3").
function Grupo({ titulo, icone: Icone, pecas, children }: { titulo?: string; icone?: typeof Hand; pecas: Item[]; children: (i: Item) => ReactNode }) {
  if (pecas.length === 0) return null
  const qtd = pecas.reduce((n, i) => n + i.qtd, 0)
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      {titulo && Icone && (
        <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-muted-foreground">
          <Icone className="size-3.5" />
          {titulo}
          <span className="tabular-nums">· {qtd}</span>
        </div>
      )}
      {pecas.map(children)}
    </section>
  )
}

export default function PecasVenda({ pedido }: Props) {
  const atualizar = useAcoesItemVenda(pedido.id)
  const adicionar = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const itens = pedido.pedido_itens.filter((i) => i.status !== "removido")
  // Carrinho colado de um lado, peças adicionadas à mão do outro. Sem carrinho, a lista fica sem rótulos.
  const doCarrinho = itens.filter((i) => i.entrada === "carrinho")
  const aMao = itens.filter((i) => i.entrada !== "carrinho")
  const comGrupos = doCarrinho.length > 0

  // Carrinho colado: as peças entram direto no pedido, somando nas que já existem.
  async function adicionarLidas(novos: NovoItem[]) {
    await adicionar.mutateAsync({ pedidoId: pedido.id, itens: novos.map((i) => ({ ...i, entrada: "carrinho" as const })), somar: true })
    const total = novos.reduce((s, i) => s + i.qtd, 0)
    toast.success(`${total} ${total === 1 ? "peça adicionada" : "peças adicionadas"}`)
  }

  const linha = (i: Item) => (
    <LinhaPeca
      key={i.id}
      tamanho="md"
      emLinha
      extraAoLado
      item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku, variante: i.variante }}
      extra={
        <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-2 sm:mt-0">
          <PrecoInput key={`${i.id}-${i.preco}`} item={i} aoSalvar={(preco) => atualizar(i.id, { preco })} />
          <Quantidade valor={i.qtd} aoMudar={(qtd) => atualizar(i.id, { qtd })} />
        </div>
      }
    >
      <Button variant="ghost" size="icon-toque" aria-label="Remover peça" onClick={() => atualizar(i.id, { status: "removido", observacao: "removida na venda" })}>
        <Trash2 />
      </Button>
    </LinhaPeca>
  )

  return (
    <div className="flex flex-col gap-3">
      <TituloSecao contagem={pedido.qtd_pecas}>Peças</TituloSecao>

      {itens.length === 0 && <Vazio>Nenhuma peça ainda. Adicione do site ou do Clube.</Vazio>}

      <Grupo titulo={comGrupos ? "Do carrinho da cliente" : undefined} icone={ShoppingBag} pecas={doCarrinho}>
        {linha}
      </Grupo>
      <Grupo titulo={comGrupos ? "Adicionadas à mão" : undefined} icone={Hand} pecas={aMao}>
        {linha}
      </Grupo>

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
        aoAdicionar={(novos) => adicionar.mutate({ pedidoId: pedido.id, itens: novos.map((i) => ({ ...i, entrada: "manual" as const })), somar: true })}
      />
    </div>
  )
}

