import { Gem, X } from "lucide-react"
import FotoGrande from "@/components/FotoGrande"
import { NotaNaPeca } from "@/components/pedido/NotaNaPeca"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { fotoTamanho } from "@/lib/foto"
import type { PecaDetalhe } from "@/lib/detalhePeca"
import { reais } from "@/lib/formato"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  foto: string | null // foto já no tamanho grande
  previa?: string | null // miniatura já carregada: aparece na hora enquanto a grande chega
  proporcao?: number // largura ÷ altura da foto
  peca?: PecaDetalhe | null // sem ela, só a foto
  alt?: string // nome da foto quando não há detalhe
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 font-medium tabular-nums">{children}</dd>
    </>
  )
}

// Detalhe da peça: a foto no centro (mesma moldura da foto ampliada) e, embaixo, código, nome, variante, quantidade, preço,
// nota e quantas faltam. Abre ao tocar na foto ou no cartão da peça (todas as etapas, troca e faltas).
export default function DetalhePeca({ aberto, aoMudar, foto, previa = null, proporcao = 1, peca, alt = "" }: Props) {
  // Com texto embaixo, a foto usa menos da altura da tela para sobrar espaço.
  const altura = peca ? "58svh" : "85svh"
  const largura = `min(calc(100vw - 3rem), 40.5rem, calc((${altura} - 1.5rem) * ${proporcao}))`
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      {/* Moldura do tema (contorno + espaço) do tamanho da foto; o X fica preso no canto da própria foto, sem sombra. */}
      <DialogContent showCloseButton={false} className="max-h-[96dvh] w-fit max-w-[calc(100%-2rem)] grid-cols-none gap-3 overflow-y-auto p-2 sm:max-w-2xl sm:p-3">
        <DialogTitle className="sr-only">{peca ? (peca.sku ?? peca.nome) : alt || "Foto da peça"}</DialogTitle>
        <DialogDescription className="sr-only">{peca ? "Detalhe da peça" : "Foto ampliada"}</DialogDescription>
        <div className="relative mx-auto w-fit">
          {foto ? (
            <FotoGrande url={fotoTamanho(foto, 1200) ?? foto} previa={previa} proporcao={proporcao} alt={peca?.nome ?? alt} style={{ width: largura }} />
          ) : (
            <div className="flex items-center justify-center rounded-lg bg-muted text-muted-foreground" style={{ width: largura, aspectRatio: 1 }}>
              <Gem className="size-1/4" />
            </div>
          )}
          <DialogClose asChild>
            <Button size="icon" variant="ghost" className="absolute top-2 right-2 rounded-full bg-background/80 text-foreground backdrop-blur hover:bg-background">
              <X />
              <span className="sr-only">Fechar</span>
            </Button>
          </DialogClose>
        </div>
        {peca && (
          // w-0 + min-w-full: o texto acompanha a largura da foto e não alarga a janela.
          <div className="mx-auto flex w-0 min-w-full flex-col gap-2 px-1 pb-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-mono text-lg leading-tight font-semibold break-all">{peca.sku ?? "sem código"}</div>
              {peca.faltam ? <Badge variant="destructive" size="lg" className="shrink-0 tabular-nums">Faltam {peca.faltam}</Badge> : null}
            </div>
            <div className="text-sm break-words">{peca.nome}</div>
            {peca.variante && <div className="text-sm font-medium break-words">{peca.variante}</div>}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              {peca.qtd != null && <Linha rotulo="Quantidade do pedido">{peca.qtd}</Linha>}
              {peca.preco != null && <Linha rotulo="Preço">{reais(peca.preco)}</Linha>}
              {peca.preco_pago != null && peca.preco_pago !== peca.preco && <Linha rotulo="Preço pago">{reais(peca.preco_pago)}</Linha>}
            </dl>
            {peca.nota && <NotaNaPeca nota={peca.nota} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
