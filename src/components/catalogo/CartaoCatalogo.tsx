import type { ReactNode } from "react"
import { Check, Plus } from "lucide-react"
import Foto from "@/components/Foto"
import { BolhaCheck, BolhaContador } from "@/components/comum/Bolha"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
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
  // Destaque do cartão (peça escolhida): anel verde suave e check na foto.
  selecionado?: boolean
  // Preço, diferença etc.
  preco?: ReactNode
  // Tamanhos (3 por linha). Sem chips, o cartão inteiro é tocável (onCard).
  chips?: ChipCatalogo[]
  onChip?: (id: string) => void
  onCard?: () => void
  // Botão explícito no pé do cartão sem tamanhos (a foto abre o zoom, então o toque no texto não bastava).
  acao?: { rotulo: string; rotuloMarcado: string }
  rotuloChips?: string
  // Ações extras no pé do cartão.
  children?: ReactNode
  className?: string
}

// Cartão único de catálogo: foto quadrada (com ampliar), código, variante, nome, preço e tamanhos.
// Só apresenta; quem usa decide o que cada toque faz.
export default function CartaoCatalogo({ foto, alt, codigo, variante, nome, selo, selecionado, preco, chips, onChip, onCard, acao, rotuloChips = "Tamanho", children, className }: Props) {
  const comChips = !!chips?.length
  const dados = (
    <>
      <span className="font-mono text-sm leading-tight font-semibold break-all">{codigo}</span>
      {variante && <span className="text-sm leading-tight">{variante}</span>}
      {nome && <span className="line-clamp-2 text-xs leading-tight text-muted-foreground">{nome}</span>}
    </>
  )
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-xl bg-card p-1.5 text-left ring-1 ring-foreground/10 transition-colors", selecionado && "bg-success/5 ring-success/40", className)}>
      <div className="relative">
        <Foto ampliar url={fotoTamanho(foto, 300)} alt={alt} className="w-full" />
        {selo && <div className="pointer-events-none absolute top-1.5 left-1.5 flex flex-col items-start gap-1">{selo}</div>}
        {selecionado && (
          <BolhaCheck className="pointer-events-none absolute top-1.5 right-1.5" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-0.5 pb-0.5">
        {onCard && !comChips && !acao ? (
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
              <Toggle
                key={c.id}
                variant="outline"
                pressed={!!c.selecionado}
                disabled={c.desabilitado}
                title={c.titulo}
                onPressedChange={() => onChip?.(c.id)}
                className={cn("relative h-9 min-w-0 px-1 text-xs tabular-nums", c.tracejado && "border-dashed")}
              >
                {c.rotulo}
                {!!c.contagem && c.contagem > 0 && <BolhaContador n={c.contagem} className="absolute -top-1.5 -right-1 border border-background" />}
              </Toggle>
            ))}
          </div>
        )}
        {acao && !comChips && (
          <Button
            type="button"
            size="bloco"
            variant="outline"
            aria-pressed={!!selecionado}
            onClick={onCard}
            className={cn("mt-1 w-full", selecionado && "border-success/60 bg-success/10 text-foreground hover:bg-success/15")}
          >
            {selecionado ? <Check className="text-success" /> : <Plus />}
            {selecionado ? acao.rotuloMarcado : acao.rotulo}
          </Button>
        )}
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  )
}
