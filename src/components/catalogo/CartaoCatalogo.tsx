import type { ReactNode } from "react"
import { Check } from "lucide-react"
import Foto from "@/components/Foto"
import { fotoTamanho } from "@/lib/foto"
import { cn } from "@/lib/utils"

// Botão de tamanho do cartão. contagem = quantas já estão no carrinho; tracejado = já está no pedido.
export type ChipCatalogo = {
  id: string
  rotulo: string
  contagem?: number
  selecionado?: boolean
  desabilitado?: boolean
  tracejado?: boolean
  titulo?: string
}

type Props = {
  foto: string | null
  alt: string
  // Código (SKU ou código do modelo), em destaque.
  codigo: string
  // Variante que não é tamanho (pedra, cor, mm); fica visível porque muda a foto.
  variante?: string | null
  nome?: string | null
  // Selos sobre a foto, no canto de cima à esquerda (ex.: "Já no pedido", ×2).
  selo?: ReactNode
  // Destaque do cartão (peça escolhida): borda, fundo e check na foto.
  selecionado?: boolean
  // Preço, diferença etc.
  preco?: ReactNode
  // Tamanhos (3 por linha). Sem chips, o cartão inteiro é tocável (onCard).
  chips?: ChipCatalogo[]
  onChip?: (id: string) => void
  onCard?: () => void
  rotuloChips?: string
  // Ações extras no pé do cartão.
  children?: ReactNode
  className?: string
}

// Cartão único de catálogo: foto quadrada (com ampliar), código, variante, nome, preço e tamanhos.
// Só apresenta; quem usa decide o que cada toque faz.
export default function CartaoCatalogo({ foto, alt, codigo, variante, nome, selo, selecionado, preco, chips, onChip, onCard, rotuloChips = "Tamanho", children, className }: Props) {
  const comChips = !!chips?.length
  const dados = (
    <>
      <span className="font-mono text-sm leading-tight font-semibold break-all">{codigo}</span>
      {variante && <span className="text-sm leading-tight">{variante}</span>}
      {nome && <span className="line-clamp-2 text-xs leading-tight text-muted-foreground">{nome}</span>}
    </>
  )
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-1.5 text-left transition-colors", selecionado && "border-primary bg-primary/5", className)}>
      <div className="relative">
        <Foto ampliar url={fotoTamanho(foto, 300)} alt={alt} className="w-full" />
        {selo && <div className="pointer-events-none absolute top-1.5 left-1.5 flex flex-col items-start gap-1">{selo}</div>}
        {selecionado && (
          <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-0.5 pb-0.5">
        {onCard && !comChips ? (
          <button type="button" aria-pressed={!!selecionado} onClick={onCard} className="flex min-w-0 flex-col gap-0.5 rounded-sm text-left">
            {dados}
          </button>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5">{dados}</div>
        )}
        {preco && <div className="flex min-w-0 flex-col gap-0.5">{preco}</div>}
        {comChips && (
          <div className="mt-1 grid grid-cols-3 gap-1" role="group" aria-label={rotuloChips}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={!!c.selecionado}
                disabled={c.desabilitado}
                title={c.titulo}
                onClick={() => onChip?.(c.id)}
                className={cn(
                  "relative h-9 min-w-0 rounded-md border px-1 text-xs font-medium tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
                  c.tracejado && "border-dashed",
                  c.selecionado && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {c.rotulo}
                {!!c.contagem && c.contagem > 0 && (
                  <span className="absolute -top-1.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-primary bg-background px-1 text-[10px] leading-none font-semibold text-primary">
                    ×{c.contagem}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  )
}
