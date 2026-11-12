import { useRef, useState } from "react"
import { toast } from "sonner"
import { ClipboardPaste, Plus, Trash2, TriangleAlert } from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import CampoReais from "@/components/CampoReais"
import { LinhaPeca } from "@/components/comum/Peca"
import { Quantidade } from "@/components/comum/Quantidade"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Vazio } from "@/components/comum/Vazio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { buscarVariantes, useAcoesItemVenda, useAdicionarItens, useAtualizarCatalogo, type PedidoDetalhe } from "@/lib/api"
import { lerLinkCarrinho } from "@/lib/carrinho"
import { numeroParaTexto } from "@/lib/formato"
import { itemDoSite } from "@/lib/itens"
import type { Item } from "@/lib/tipos"

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
  const atualizarCatalogo = useAtualizarCatalogo()
  const [colado, setColado] = useState("")
  const [lendo, setLendo] = useState(false)
  const [faltando, setFaltando] = useState<string[]>([])
  const [pendente, setPendente] = useState<{ variantId: string; qtd: number }[]>([])
  const itens = pedido.pedido_itens.filter((i) => i.status !== "removido")

  // Lê o carrinho colado e adiciona todas as peças sozinho, a partir do catálogo local.
  const lendoRef = useRef(false)
  async function lerCarrinho(link: string, lidos = lerLinkCarrinho(link)) {
    if (lendoRef.current) return // já está lendo: evita adicionar duas vezes
    if (!lidos) {
      if (link.trim()) toast.error("Não reconheci o carrinho. Cole o link completo, com /cart/…")
      return
    }
    lendoRef.current = true
    setLendo(true)
    try {
      const { variantes, faltando: sem } = await buscarVariantes(lidos.map((l) => l.variantId))
      const novos = variantes.map((v) =>
        itemDoSite(v, lidos.find((l) => String(l.variantId) === String(v.shopify_variant_id))?.qtd ?? 1),
      )
      if (novos.length) {
        await adicionar.mutateAsync({ pedidoId: pedido.id, itens: novos, somar: true })
        const total = novos.reduce((s, i) => s + i.qtd, 0)
        toast.success(`${total} ${total === 1 ? "peça adicionada" : "peças adicionadas"}`)
      }
      setFaltando(sem)
      setPendente(lidos.filter((l) => sem.includes(l.variantId)))
      setColado("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o carrinho")
    } finally {
      lendoRef.current = false
      setLendo(false)
    }
  }

  async function atualizarETentar() {
    const de = pendente
    try {
      await atualizarCatalogo.mutateAsync(undefined)
      toast.success("Catálogo atualizado")
    } catch {
      return
    }
    await lerCarrinho("", de)
  }

  return (
    <div className="flex flex-col gap-3">
      <TituloSecao contagem={pedido.qtd_pecas}>Peças</TituloSecao>

      {itens.length === 0 && <Vazio>Nenhuma peça ainda. Adicione do site ou do Clube.</Vazio>}

      {itens.map((i) => (
        <LinhaPeca
          key={i.id}
          tamanho="md"
          item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku, variante: i.variante }}
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
        <InputGroup>
          <InputGroupAddon>{lendo ? <Spinner /> : <ClipboardPaste />}</InputGroupAddon>
          <InputGroupInput
            aria-label="Colar carrinho da cliente"
            placeholder="Colar carrinho da cliente"
            value={colado}
            disabled={lendo}
            onChange={(e) => {
              setColado(e.target.value)
              if (lerLinkCarrinho(e.target.value)) void lerCarrinho(e.target.value)
            }}
            onBlur={() => colado.trim() && void lerCarrinho(colado)}
          />
        </InputGroup>
        <Button variant="outline" size="toque" className="w-fit" onClick={() => setAdicionando(true)}>
          <Plus /> Adicionar peça
        </Button>
        {faltando.length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>
              {faltando.length} {faltando.length === 1 ? "peça não encontrada" : "peças não encontradas"} no catálogo
            </AlertTitle>
            <AlertDescription>
              <span className="font-mono text-xs">{faltando.join(", ")}</span>
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={atualizarETentar} disabled={atualizarCatalogo.isPending || lendo}>
                  {atualizarCatalogo.isPending && <Spinner />} Atualizar catálogo e tentar de novo
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
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

