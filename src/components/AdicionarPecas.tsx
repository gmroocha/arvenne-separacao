import { useState } from "react"
import { ChevronUp, Trash2, TriangleAlert } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { AreaRolavel } from "@/components/comum/AreaRolavel"
import { ColarCarrinho } from "@/components/comum/ColarCarrinho"
import { LinhaPeca } from "@/components/comum/Peca"
import { Quantidade } from "@/components/comum/Quantidade"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Vazio } from "@/components/comum/Vazio"
import { BuscaPecas } from "@/components/BuscaPecas"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { igual } from "@/lib/itens"
import type { NovoItem } from "@/lib/tipos"

type Carrinho = NovoItem[]

// Peça que já está no pedido (itens vivos, passados por quem abre este diálogo).
export type PecaNoPedido = { sku: string | null; shopify_variant_id: number | string | null; peca_clube_id: string | null; qtd: number }

// Quantas unidades da peça já estão no pedido: casa por variante da Shopify, senão pelo Clube, senão pelo código.
function qtdNoPedido(item: NovoItem, lista: PecaNoPedido[] | undefined): number {
  if (!lista?.length) return 0
  const casa = (p: PecaNoPedido) => {
    if (item.shopify_variant_id != null) return p.shopify_variant_id != null && String(p.shopify_variant_id) === String(item.shopify_variant_id)
    if (item.peca_clube_id) return p.peca_clube_id === item.peca_clube_id
    return !!item.sku && !!p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()
  }
  return lista.filter(casa).reduce((n, p) => n + (p.qtd || 1), 0)
}

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  aoAdicionar: (itens: NovoItem[]) => void
  comPreco?: boolean // só a venda mostra preço na busca
  // Itens vivos do pedido: avisa quando a peça escolhida já está nele (evita linha duplicada sem querer).
  jaNoPedido?: PecaNoPedido[]
  // Mostra o campo "Colar carrinho" em cima das abas; as peças lidas entram no carrinho do diálogo.
  comLink?: boolean
}

// Peças escolhidas: muda a quantidade ou tira antes de salvar.
function ListaCarrinho({
  carrinho,
  aoMudarQtd,
  aoRemover,
  noPedido,
}: {
  carrinho: Carrinho
  aoMudarQtd: (chave: string, qtd: number) => void
  aoRemover: (chave: string) => void
  noPedido: (item: NovoItem) => number
}) {
  if (carrinho.length === 0)
    return <Vazio>Toque numa peça para adicionar.</Vazio>
  return (
    <div className="flex flex-col gap-2">
      {carrinho.map((i) => (
        <LinhaPeca
          key={i.chave}
          tamanho="md"
          item={{ foto_url: i.foto_url, nome: i.nome, sku: i.sku, variante: i.variante }}
          extra={
            <>
              {noPedido(i) > 0 && (
                <div className="mt-1 flex items-start gap-1 text-xs text-warning">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  <span>Já está no pedido ({noPedido(i)}×). Vai entrar mais uma linha.</span>
                </div>
              )}
              <div className="mt-1.5">
                <Quantidade valor={i.qtd} aoMudar={(n) => aoMudarQtd(i.chave, n)} />
              </div>
            </>
          }
        >
          <Button variant="ghost" size="icon-toque" aria-label="Tirar do carrinho" onClick={() => aoRemover(i.chave)}>
            <Trash2 />
          </Button>
        </LinhaPeca>
      ))}
    </div>
  )
}

export default function AdicionarPecas({ aberto, aoMudar, aoAdicionar, comPreco, jaNoPedido, comLink }: Props) {
  const celular = useIsMobile()
  const [carrinho, setCarrinho] = useState<Carrinho>([])
  const [verCarrinho, setVerCarrinho] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [duplicadas, setDuplicadas] = useState(false)
  const noPedido = (item: NovoItem) => qtdNoPedido(item, jaNoPedido)
  const repetidas = carrinho.filter((i) => noPedido(i) > 0)
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
    setDuplicadas(false)
    aoMudar(false)
  }
  function confirmar() {
    aoAdicionar(carrinho)
    fechar()
  }
  function salvar() {
    if (!carrinho.length) return
    if (repetidas.length) return setDuplicadas(true)
    confirmar()
  }
  function mudou(a: boolean) {
    if (a) aoMudar(true)
    else if (carrinho.length) setDescartando(true)
    else fechar()
  }

  const busca = aberto && <BuscaPecas comPreco={comPreco} aoEscolher={tocar} quantidade={(item) => carrinho.find((x) => igual(x, item))?.qtd ?? 0} qtdNoPedido={noPedido} selecionada={(item) => carrinho.some((x) => igual(x, item))} />
  const abas = (
    <div className="flex flex-col gap-3">
      {aberto && comLink && <ColarCarrinho aoLer={(itens) => itens.forEach(tocar)} />}
      {busca}
    </div>
  )
  const lista = <ListaCarrinho carrinho={carrinho} aoMudarQtd={mudarQtd} aoRemover={remover} noPedido={noPedido} />

  return (
    <>
      <RespDialog aberto={aberto} aoMudar={mudou} titulo="Adicionar peça" descricao="Busque no site ou no catálogo do Clube e monte o carrinho" largo>
        {celular ? (
          <div className="flex flex-col gap-3">
            {abas}
            <Collapsible open={verCarrinho} onOpenChange={setVerCarrinho} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3">
              <CollapsibleContent>
                <AreaRolavel className="max-h-[40svh] pb-3">{lista}</AreaRolavel>
              </CollapsibleContent>
              <div className="flex items-center gap-2 pb-1">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="xl" className="flex-1 justify-between" disabled={!carrinho.length}>
                    {rotuloPecas}
                    <ChevronUp className={verCarrinho ? "rotate-180" : ""} />
                  </Button>
                </CollapsibleTrigger>
                <Button size="xl" className="flex-1" disabled={!carrinho.length} onClick={salvar}>
                  Salvar
                </Button>
              </div>
            </Collapsible>
          </div>
        ) : (
          <div className="grid h-[calc(min(90svh,780px)-10rem)] grid-cols-[minmax(0,1fr)_320px]">
            {/* Divisória no lado esquerdo: a barra de rolagem fica colada nela e os dois lados têm o mesmo respiro. */}
            <AreaRolavel className="min-w-0 border-r pr-4">{abas}</AreaRolavel>
            <div className="flex min-h-0 min-w-0 flex-col gap-3 pl-4">
              <TituloSecao as="h3">Carrinho{pecas > 0 && <span className="font-normal text-muted-foreground"> ({rotuloPecas})</span>}</TituloSecao>
              <AreaRolavel className="flex-1">{lista}</AreaRolavel>
              <Button size="xl" disabled={!carrinho.length} onClick={salvar}>
                Salvar {rotuloPecas}
              </Button>
            </div>
          </div>
        )}
      </RespDialog>

      <Dialog open={duplicadas} onOpenChange={setDuplicadas}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Peças já no pedido</DialogTitle>
            <DialogDescription>
              Estas peças já estão no pedido: {repetidas.map((i) => `${i.sku ?? i.nome} (${noPedido(i)}×)`).join(", ")}. Adicionar mesmo assim?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicadas(false)}>
              Voltar
            </Button>
            <Button onClick={confirmar}>Adicionar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
