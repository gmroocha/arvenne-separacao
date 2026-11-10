import { useState } from "react"
import { ChevronUp, Minus, Plus, Trash2 } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import Foto from "@/components/Foto"
import { BuscaPecas } from "@/components/BuscaPecas"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { fotoTamanho } from "@/lib/foto"
import { igual } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"

type Carrinho = NovoItem[]

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoAdicionar: (itens: NovoItem[]) => void
}

// Peças escolhidas: muda a quantidade ou tira antes de salvar.
function ListaCarrinho({
  carrinho,
  aoMudarQtd,
  aoRemover,
}: {
  carrinho: Carrinho
  aoMudarQtd: (chave: string, qtd: number) => void
  aoRemover: (chave: string) => void
}) {
  if (carrinho.length === 0)
    return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Toque numa peça para adicionar.</p>
  return (
    <div className="flex flex-col gap-2">
      {carrinho.map((i) => (
        <div key={i.chave} className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <Foto url={fotoTamanho(i.foto_url, 200)} alt={i.nome} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm font-semibold">{i.sku ?? "sem código"}</div>
            <div className="truncate text-xs text-muted-foreground">{i.variante ?? i.nome}</div>
          </div>
          <ButtonGroup>
            <Button variant="outline" size="icon" aria-label="Diminuir" disabled={i.qtd <= 1} onClick={() => aoMudarQtd(i.chave, i.qtd - 1)}>
              <Minus />
            </Button>
            <ButtonGroupText className="tabular-nums">{i.qtd}</ButtonGroupText>
            <Button variant="outline" size="icon" aria-label="Aumentar" onClick={() => aoMudarQtd(i.chave, i.qtd + 1)}>
              <Plus />
            </Button>
          </ButtonGroup>
          <Button variant="ghost" size="icon" aria-label="Tirar do carrinho" onClick={() => aoRemover(i.chave)}>
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function AdicionarPecas({ aberto, aoMudar, aoAdicionar }: Props) {
  const celular = useIsMobile()
  const [carrinho, setCarrinho] = useState<Carrinho>([])
  const [verCarrinho, setVerCarrinho] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const pecas = carrinho.reduce((s, i) => s + i.qtd, 0)
  const rotuloPecas = `${pecas} ${pecas === 1 ? "peça" : "peças"}`

  const tocar = (item: NovoItem) =>
    setCarrinho((c) => (c.some((x) => igual(x, item)) ? c.map((x) => (igual(x, item) ? { ...x, qtd: x.qtd + item.qtd } : x)) : [...c, item]))
  const mudarQtd = (chave: string, qtd: number) => setCarrinho((c) => c.map((x) => (x.chave === chave ? { ...x, qtd: Math.max(1, qtd) } : x)))
  const remover = (chave: string) => setCarrinho((c) => c.filter((x) => x.chave !== chave))

  function fechar() {
    setCarrinho([])
    setVerCarrinho(false)
    setDescartando(false)
    aoMudar(false)
  }
  function salvar() {
    if (!carrinho.length) return
    aoAdicionar(carrinho)
    fechar()
  }
  function mudou(a: boolean) {
    if (a) aoMudar(true)
    else if (carrinho.length) setDescartando(true)
    else fechar()
  }

  const abas = aberto && <BuscaPecas aoEscolher={tocar} quantidade={(item) => carrinho.find((x) => igual(x, item))?.qtd ?? 0} selecionada={(item) => carrinho.some((x) => igual(x, item))} />
  const lista = <ListaCarrinho carrinho={carrinho} aoMudarQtd={mudarQtd} aoRemover={remover} />

  return (
    <>
      <RespDialog aberto={aberto} aoMudar={mudou} titulo="Adicionar peça" descricao="Busque no site ou no catálogo do Clube e monte o carrinho" largo>
        {celular ? (
          <div className="flex flex-col gap-3">
            {abas}
            <Collapsible open={verCarrinho} onOpenChange={setVerCarrinho} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3">
              <CollapsibleContent className="max-h-[40svh] overflow-y-auto pb-3">{lista}</CollapsibleContent>
              <div className="flex items-center gap-2 pb-1">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-between" disabled={!carrinho.length}>
                    {rotuloPecas}
                    <ChevronUp className={verCarrinho ? "rotate-180" : ""} />
                  </Button>
                </CollapsibleTrigger>
                <Button className="flex-1" disabled={!carrinho.length} onClick={salvar}>
                  Salvar
                </Button>
              </div>
            </Collapsible>
          </div>
        ) : (
          <div className="grid h-[calc(min(90svh,780px)-10rem)] grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div className="min-h-0 overflow-y-auto pr-1">{abas}</div>
            <div className="flex min-h-0 flex-col gap-3 rounded-xl bg-muted/50 p-3">
              <h3 className="text-sm font-semibold">
                Carrinho {pecas > 0 && <span className="font-normal text-muted-foreground">({rotuloPecas})</span>}
              </h3>
              <div className="min-h-0 flex-1 overflow-y-auto">{lista}</div>
              <Button className="h-10" disabled={!carrinho.length} onClick={salvar}>
                Salvar {rotuloPecas}
              </Button>
            </div>
          </div>
        )}
      </RespDialog>

      <Dialog open={descartando} onOpenChange={setDescartando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar {rotuloPecas}?</DialogTitle>
            <DialogDescription>As peças do carrinho ainda não foram salvas no pedido.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescartando(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={fechar}>
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
