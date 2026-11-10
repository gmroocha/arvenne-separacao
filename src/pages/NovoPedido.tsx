import { useState } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { Minus, Plus, Trash2, TriangleAlert } from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import { itemDoSite } from "@/lib/itens"
import Foto from "@/components/Foto"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { buscarVariantes, useCriarPedidoWhatsApp } from "@/lib/api"
import { reais } from "@/lib/formato"
import { lerLinkCarrinho } from "@/lib/carrinho"
import type { NovoItem } from "@/lib/tipos"

export default function NovoPedido() {
  const navegar = useNavigate()
  const criar = useCriarPedidoWhatsApp()
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [link, setLink] = useState("")
  const [obs, setObs] = useState("")
  const [itens, setItens] = useState<NovoItem[]>([])
  const [adicionando, setAdicionando] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [formatoErrado, setFormatoErrado] = useState(false)

  const adicionar = (novos: NovoItem[]) => setItens((atual) => [...atual, ...novos])
  const mudarQtd = (chave: string, d: number) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, qtd: Math.max(1, i.qtd + d) } : i)))
  const pecas = itens.reduce((s, i) => s + i.qtd, 0)
  const total = itens.reduce((s, i) => s + (i.preco ?? 0) * i.qtd, 0)

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
      adicionar(novos)
      toast.success(`${novos.length} peças lidas do carrinho`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o carrinho")
    } finally {
      setLendo(false)
    }
  }

  async function enviar() {
    if (!nome.trim()) return toast.error("Informe o nome da cliente")
    if (!itens.length) return toast.error("Adicione ao menos uma peça")
    const r = await criar.mutateAsync({
      cliente_nome: nome.trim(),
      cliente_telefone: telefone.trim(),
      carrinho_url: link.trim() || null,
      observacoes: obs.trim() || null,
      itens,
    })
    navegar(`/pedidos/${r.id}`)
  }

  return (
    <div className="flex flex-col gap-6 pb-24 sm:pb-0">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="nome">Nome da cliente</FieldLabel>
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tel">Telefone</FieldLabel>
          <Input id="tel" type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="link">Link do carrinho</FieldLabel>
          <InputGroup>
            <InputGroupInput id="link" placeholder="https://loja.com.br/cart/..." value={link} onChange={(e) => setLink(e.target.value)} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton variant="secondary" onClick={lerLink} disabled={!link.trim() || lendo}>
                {lendo && <Spinner />} Ler
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        {formatoErrado && (
          <Alert>
            <TriangleAlert />
            <AlertDescription>
              Formato de link não reconhecido — guardei o link; adicione as peças pela busca.
            </AlertDescription>
          </Alert>
        )}
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <ItemGroup className="gap-2">
          {itens.map((i) => (
            <Item key={i.chave} variant="outline" size="sm">
              <ItemMedia variant="image">
                <Foto url={i.foto_url} className="size-10" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{i.nome}</ItemTitle>
                <ItemDescription>{[i.variante, i.sku].filter(Boolean).join(" · ")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ButtonGroup>
                  <Button variant="outline" size="icon" aria-label="Diminuir" onClick={() => mudarQtd(i.chave, -1)}>
                    <Minus />
                  </Button>
                  <ButtonGroupText>{i.qtd}</ButtonGroupText>
                  <Button variant="outline" size="icon" aria-label="Aumentar" onClick={() => mudarQtd(i.chave, 1)}>
                    <Plus />
                  </Button>
                </ButtonGroup>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover"
                  onClick={() => setItens((a) => a.filter((x) => x.chave !== i.chave))}
                >
                  <Trash2 />
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        <Button variant="outline" onClick={() => setAdicionando(true)}>
          <Plus /> Adicionar peça
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor="obs">Observações</FieldLabel>
        <Textarea id="obs" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-background p-3 sm:static sm:border-0 sm:p-0">
        <span className="text-sm">
          {pecas} {pecas === 1 ? "peça" : "peças"} · {reais(total)}
        </span>
        <Button onClick={enviar} disabled={criar.isPending}>
          {criar.isPending && <Spinner />} Criar pedido
        </Button>
      </div>

      <AdicionarPecas aberto={adicionando} aoMudar={setAdicionando} aoAdicionar={adicionar} />
    </div>
  )
}
