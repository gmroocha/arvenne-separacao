import Foto from "@/components/Foto"
import { cn } from "@/lib/utils"

// Fileira de miniaturas das peças do pedido: sem sobreposição, com "+N" quando há mais linhas que fotos.
export default function Miniaturas({ fotos, total, className }: { fotos: string[]; total: number; className?: string }) {
  const extras = Math.max(0, total - fotos.length)
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {(fotos.length ? fotos : [null]).map((f, n) => (
          <Foto key={n} url={f} className="size-9 rounded-md bg-muted ring-1 ring-border" />
        ))}
      </div>
      {extras > 0 && <span className="text-xs text-muted-foreground tabular-nums">+{extras}</span>}
    </div>
  )
}
