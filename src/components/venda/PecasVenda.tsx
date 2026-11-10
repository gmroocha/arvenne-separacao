import { useState } from "react"
import { toast } from "sonner"
import { Link2, Minus, Plus, Trash2 } from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import Foto from "@/components/Foto"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { buscarVariantes, useAdicionarItens, useAtualizarItem, type PedidoDetalhe } from "@/lib/api"
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

type Props = { pedido: PedidoDetalhe; aoLerCarrinho: (link: string) => void }

export default function PecasVenda({ pedido, aoLerCarrinho }: Props) {
  const atualizar = useAtualizarItem()
  const adicionar = useAdicionarItens()
  const [adicionando, setAdicionando] = useState(false)
  const [lendoLink, setLendoLink] = useState(false)
  const [link, setLink] = useState("")
  const [lendo, setLendo] = useState(false)
  const [formatoErrado, setFormatoErrado] = useState(false)
  const itens = pedido.pedido_itens.filter((i) => i.status !== "removido")

  async function lerLink() {
    setFormatoErrado(false)
    const lidos = lerLinkCarrinho(link)
    if (!lidos) return setFormatoErrado(true)
    setLendo(true)
    try {
      const variantes = await buscarVariantes(lidos.map((l) => l.variantId))
      const novos = variantes.map((v) =>
        itemDoSite(v, lidos.find((l) => String(l.variantId) === String(v.shopify_variant_id))?.qtd ?? 1),
      )
      adicionar.mutate({ pedidoId: pedido.id, itens: novos })
      aoLerCarrinho(link.trim())
      toast.success(`${novos.length} peças lidas do carrinho`)
      setLendoLink(false)
      setLink("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o carrinho")
    } finally {
      setLendo(false)
    }
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
              <PrecoInput key={`${i.id}-${i.preco}`} item={i} aoSalvar={(preco) => atualizar.mutate({ itemId: i.id, campos: { preco } })} />
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Diminuir"
                  disabled={i.qtd <= 1}
                  onClick={() => atualizar.mutate({ itemId: i.id, campos: { qtd: i.qtd - 1 } })}
                >
                  <Minus />
                </Button>
                <ButtonGroupText className="tabular-nums">{i.qtd}</ButtonGroupText>
                <Button variant="outline" size="icon" aria-label="Aumentar" onClick={() => atualizar.mutate({ itemId: i.id, campos: { qtd: i.qtd + 1 } })}>
                  <Plus />
                </Button>
              </ButtonGroup>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remover peça"
            onClick={() => atualizar.mutate({ itemId: i.id, campos: { status: "removido" } })}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setAdicionando(true)}>
          <Plus /> Adicionar peça
        </Button>
        <Button variant="outline" onClick={() => setLendoLink(true)}>
          <Link2 /> Ler link do carrinho
        </Button>
      </div>

      <AdicionarPecas
        aberto={adicionando}
        aoMudar={setAdicionando}
        aoAdicionar={(novos) => adicionar.mutate({ pedidoId: pedido.id, itens: novos })}
      />

      <RespDialog aberto={lendoLink} aoMudar={setLendoLink} titulo="Ler link do carrinho" descricao="Cole o link de carrinho da Shopify">
        <div className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupInput placeholder="https://loja.com.br/cart/..." value={link} onChange={(e) => setLink(e.target.value)} />
          </InputGroup>
          {formatoErrado && <p className="text-sm text-destructive">Formato de link não reconhecido.</p>}
          <Button className="h-11" onClick={lerLink} disabled={!link.trim() || lendo}>
            {lendo && <Spinner />} Ler peças
          </Button>
        </div>
      </RespDialog>
    </div>
  )
}

