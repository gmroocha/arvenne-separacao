import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Marca de "marcado" do app (peça escolhida, passo feito, peça concluída). Verde, do mesmo tamanho da
// bolinha com o número do passo (size-7).
// suave: em listas e cabeçalhos (fundo verde claro). solida: sobre fotos, que são claras (precisa contraste).
export function MarcaCheck({ solida, pequena, className }: { solida?: boolean; pequena?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "z-10 flex shrink-0 items-center justify-center rounded-full",
        pequena ? "size-6 [&>svg]:size-3.5" : "size-7 [&>svg]:size-4",
        solida ? "bg-success text-success-foreground shadow-sm ring-2 ring-card" : "bg-success/15 text-success ring-1 ring-success/30",
        className,
      )}
    >
      <Check strokeWidth={2.5} />
    </span>
  )
}

// Visto sobre a foto de um cartão escolhido (posicione com className, ex.: "absolute top-1.5 right-1.5").
export function BolhaCheck({ className }: { className?: string }) {
  return <MarcaCheck solida pequena className={className} />
}

// Bolinha com número (quantas unidades daquele tamanho foram escolhidas). Mesmo verde do "marcado".
export function BolhaContador({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1 text-xs font-semibold text-success-foreground tabular-nums ring-2 ring-card", className)}>
      {n}
    </span>
  )
}
