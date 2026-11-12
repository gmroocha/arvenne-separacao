import { useRef, useState } from "react"
import { toast } from "sonner"
import { ClipboardPaste, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useAtualizarCatalogo, useLerCarrinho, type CarrinhoLido } from "@/lib/api"
import { lerLinkCarrinho, motivoLinkRecusado, type LidoCarrinho } from "@/lib/carrinho"
import type { NovoItem } from "@/lib/tipos"

type Props = {
  // Recebe as peças lidas (já com preço e foto do catálogo). Quem usa decide o que fazer com elas.
  aoLer: (itens: NovoItem[]) => void | Promise<void>
  className?: string
}

// Campo "Colar carrinho da cliente": aceita o link do site (/cart/ID:QTD,...) e o de checkout
// (/checkouts/.../recover). Lê sozinho ao colar e avisa as peças que o catálogo ainda não tem.
export function ColarCarrinho({ aoLer, className }: Props) {
  const ler = useLerCarrinho()
  const atualizarCatalogo = useAtualizarCatalogo()
  const [colado, setColado] = useState("")
  const [lendo, setLendo] = useState(false)
  const [faltando, setFaltando] = useState<string[]>([])
  const [pendente, setPendente] = useState<LidoCarrinho[]>([])
  const lendoRef = useRef(false)

  async function lerCarrinho(entrada: string | LidoCarrinho[]) {
    if (lendoRef.current) return // já está lendo: evita adicionar duas vezes
    if (typeof entrada === "string" && !lerLinkCarrinho(entrada)) {
      if (entrada.trim()) toast.error(motivoLinkRecusado(entrada))
      return
    }
    lendoRef.current = true
    setLendo(true)
    try {
      const r: CarrinhoLido | null = await ler(entrada)
      if (!r) return
      if (r.itens.length) await aoLer(r.itens)
      setFaltando(r.faltando)
      setPendente(r.lidos.filter((l) => r.faltando.includes(l.variantId)))
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
    await lerCarrinho(de)
  }

  return (
    <div className={className ?? "flex flex-col gap-2"}>
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
  )
}
