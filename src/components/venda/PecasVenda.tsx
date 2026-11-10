import { useState } from "react"
import { toast } from "sonner"
import { ClipboardPaste, Minus, Plus, Trash2, TriangleAlert } from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import Foto from "@/components/Foto"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { buscarVariantes, useAcoesItemVenda, useAdicionarItens, useAtualizarCatalogo, type PedidoDetalhe } from "@/lib/api"
import { lerLinkCarrinho } from "@/lib/carrinho"
import { lerNumero, numeroParaTexto } from "@/lib/formato"
import { itemDoSite } from "@/lib/itens"
import type { Item } from "@/lib/tipos"

function PrecoInput({ item, aoSalvar }: { item: Item; aoSalvar: (preco: number | null) => void }) {
  const [v, setV] = useState(numeroParaTexto(item.preco))
  return (
    <InputGroup className="h-8 w-28">
      <InputGroupAddon>R$</InputGroupAddon>
      <InputGroupInput
        inputMode="decimal"
        aria-label="Preço"
        className="text-right tabular-nums"
        value={v}
        placeholder="0,00"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = lerNumero(v)
          if (n !== item.preco) aoSalvar(n)
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </InputGroup>
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
  async function lerCarrinho(link: string, lidos = lerLinkCarrinho(link)) {
    if (!lidos) {
      if (link.trim()) toast.error("Não reconheci o carrinho. Cole o link completo, com /cart/…")
      return
    }
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Peças <span className="font-normal text-muted-foreground tabular-nums">({pedido.qtd_pecas})</span>
        </h2>
      </div>

      {itens.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma peça ainda. Adicione do site ou do Clube.
        </p>
      )}

      {itens.map((i) => (
        <div key={i.id} className="flex items-start gap-3 rounded-lg border bg-card p-2">
          <Foto url={i.foto_url} alt={i.nome} className="size-14 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div>
              <div className="truncate text-sm font-medium">{i.nome}</div>
              <div className="truncate text-xs text-muted-foreground">
                {i.variante}
                {i.sku && <span className="font-mono"> {i.variante ? "· " : ""}{i.sku}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PrecoInput key={`${i.id}-${i.preco}`} item={i} aoSalvar={(preco) => atualizar(i.id, { preco })} />
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Diminuir"
                  disabled={i.qtd <= 1}
                  onClick={() => atualizar(i.id, { qtd: i.qtd - 1 })}
                >
                  <Minus />
                </Button>
                <ButtonGroupText className="tabular-nums">{i.qtd}</ButtonGroupText>
                <Button variant="outline" size="icon" aria-label="Aumentar" onClick={() => atualizar(i.id, { qtd: i.qtd + 1 })}>
                  <Plus />
                </Button>
              </ButtonGroup>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remover peça"
            onClick={() => atualizar(i.id, { status: "removido" })}
          >
            <Trash2 />
          </Button>
        </div>
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
        <Button variant="outline" className="w-fit" onClick={() => setAdicionando(true)}>
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
        aberto={adicionando}
        aoMudar={setAdicionando}
        aoAdicionar={(novos) => adicionar.mutate({ pedidoId: pedido.id, itens: novos, somar: true })}
      />
    </div>
  )
}

