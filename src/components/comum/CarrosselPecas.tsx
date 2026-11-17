import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Gem, X } from "lucide-react"
import FotoGrande from "@/components/FotoGrande"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { fotoTamanho } from "@/lib/foto"
import { reais } from "@/lib/formato"
import type { PecaRomaneio } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  pecas: PecaRomaneio[]
  // Peça aberta (índice em pecas); null = fechado.
  aberta: number | null
  aoFechar: () => void
}

function Slide({ peca }: { peca: PecaRomaneio }) {
  const foto = fotoTamanho(peca.foto_url, 1200)
  return (
    <div className="flex flex-col gap-4">
      {foto ? (
        <FotoGrande url={foto} previa={fotoTamanho(peca.foto_url, 600)} alt={peca.nome} className="w-full" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Gem className="size-1/4" />
        </div>
      )}
      <div className="flex flex-col gap-0.5 px-1">
        <div className="font-mono text-lg leading-tight font-semibold break-all">{peca.sku?.trim() || peca.nome}</div>
        {peca.variante && <div className="text-base leading-tight font-medium">{peca.variante}</div>}
        <div className="text-sm text-muted-foreground">{peca.nome}</div>
      </div>
      <div className="flex flex-col gap-1.5 px-1">
        <LinhaValor rotulo="Quantidade" valor={String(peca.qtd)} />
        {peca.preco != null && <LinhaValor rotulo="Valor unitário" valor={reais(peca.preco)} />}
        {peca.total != null && <LinhaValor forte rotulo="Total da peça" valor={reais(peca.total)} />}
      </div>
    </div>
  )
}

// Peças do pedido em tela cheia: foto grande e os dados de cada uma. Arrasta para o lado (ou setas no PC)
// para ver as outras. Rolagem nativa com encaixe: leve no celular, sem biblioteca.
export default function CarrosselPecas({ pecas, aberta, aoFechar }: Props) {
  return (
    <Dialog open={aberta != null} onOpenChange={(a) => !a && aoFechar()}>
      {/* O conteúdo nasce a cada abertura (o diálogo desmonta ao fechar): começa na peça tocada. */}
      {aberta != null && <Conteudo pecas={pecas} inicio={aberta} />}
    </Dialog>
  )
}

function Conteudo({ pecas, inicio }: { pecas: PecaRomaneio[]; inicio: number }) {
  const trilho = useRef<HTMLDivElement>(null)
  const [atual, setAtual] = useState(inicio)

  // Abre já na peça tocada, sem animar a rolagem até ela.
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      const el = trilho.current
      if (el) el.scrollTo({ left: inicio * el.clientWidth, behavior: "instant" })
    })
    return () => cancelAnimationFrame(t)
  }, [inicio])

  const ir = (n: number) => {
    const el = trilho.current
    if (!el) return
    const alvo = Math.max(0, Math.min(pecas.length - 1, n))
    el.scrollTo({ left: alvo * el.clientWidth, behavior: "smooth" })
  }
  const aoRolar = () => {
    const el = trilho.current
    if (el && el.clientWidth > 0) setAtual(Math.round(el.scrollLeft / el.clientWidth))
  }
  const peca = pecas[atual]

  return (
    <DialogContent
      showCloseButton={false}
      className="flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-md flex-col gap-3 overflow-hidden p-3 sm:p-4"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") ir(atual + 1)
        if (e.key === "ArrowLeft") ir(atual - 1)
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {atual + 1} de {pecas.length}
        </span>
        <DialogClose asChild>
          <Button size="icon" variant="ghost" className="rounded-full">
            <X />
            <span className="sr-only">Fechar</span>
          </Button>
        </DialogClose>
      </div>
      <DialogTitle className="sr-only">{peca ? `Peça ${peca.sku?.trim() || peca.nome}` : "Peças do pedido"}</DialogTitle>
      <DialogDescription className="sr-only">Arraste para o lado para ver as outras peças do pedido.</DialogDescription>
      <div className="relative min-h-0 flex-1">
        <div
          ref={trilho}
          onScroll={aoRolar}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pecas.map((p, n) => (
            <section
              key={n}
              aria-label={`Peça ${n + 1} de ${pecas.length}`}
              aria-hidden={n !== atual}
              className="w-full shrink-0 snap-center snap-always overflow-y-auto px-0.5"
            >
              {/* Só monta as fotos perto da peça vista: pedido grande não baixa tudo de uma vez. */}
              {Math.abs(n - atual) <= 1 ? <Slide peca={p} /> : <div className="aspect-square w-full rounded-lg bg-muted" />}
            </section>
          ))}
        </div>
        {pecas.length > 1 && (
          <>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Peça anterior"
              disabled={atual === 0}
              onClick={() => ir(atual - 1)}
              className="absolute top-[calc(50%-4rem)] left-2 hidden rounded-full shadow sm:inline-flex"
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              aria-label="Próxima peça"
              disabled={atual === pecas.length - 1}
              onClick={() => ir(atual + 1)}
              className="absolute top-[calc(50%-4rem)] right-2 hidden rounded-full shadow sm:inline-flex"
            >
              <ChevronRight />
            </Button>
          </>
        )}
      </div>
      {pecas.length > 1 && pecas.length <= 12 && (
        <div className="flex justify-center gap-1.5" aria-hidden>
          {pecas.map((_, n) => (
            <span key={n} className={cn("size-1.5 rounded-full transition-colors", n === atual ? "bg-foreground" : "bg-foreground/20")} />
          ))}
        </div>
      )}
    </DialogContent>
  )
}
