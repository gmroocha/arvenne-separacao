import type { ReactNode } from "react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { fotoTamanho } from "@/lib/foto"
import { cn } from "@/lib/utils"

// Formato mínimo de uma peça: serve para item de pedido, linha de catálogo e opção de troca.
export type PecaBasica = {
  foto_url: string | null
  nome: string
  sku?: string | null
  variante?: string | null
  qtd?: number
  origem?: string | null
  observacao?: string | null
  status?: string | null
}

type Props = {
  item: PecaBasica
  tamanho?: "sm" | "md" | "lg"
  destaque?: boolean // variante maior, para a separação
  esmaecida?: boolean
  riscada?: boolean
  entrando?: boolean
  saindo?: boolean
  inicio?: ReactNode // marca à esquerda da foto (ex.: ✓ de feita)
  extra?: ReactNode // linha extra embaixo dos textos
  children?: ReactNode // ações à direita
  semBorda?: boolean
  className?: string
}

const FOTO = { sm: "size-10", md: "size-14", lg: "size-20" } as const
const PX = { sm: 200, md: 200, lg: 300 } as const

// Linha de peça padrão do app: foto, código (SKU), variante e nome, com quantidade e origem.
export function LinhaPeca({ item, tamanho = "md", destaque, esmaecida, riscada, entrando, saindo, inicio, extra, children, semBorda, className }: Props) {
  const qtd = item.qtd ?? 1
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        !semBorda && "rounded-lg border bg-card p-2",
        entrando && "animate-in fade-in slide-in-from-left-2 duration-300",
        saindo && "animate-out fade-out slide-out-to-right-4 fill-mode-forwards duration-200",
        esmaecida && !semBorda && "bg-muted/40 text-muted-foreground",
        esmaecida && semBorda && "text-muted-foreground",
        className,
      )}
    >
      {inicio}
      <Foto url={fotoTamanho(item.foto_url, PX[tamanho])} alt={item.nome} ampliar className={cn("shrink-0", FOTO[tamanho], esmaecida && "opacity-70")} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-mono font-semibold", tamanho === "sm" ? "text-xs" : "text-sm", riscada && "line-through")}>{item.sku ?? "sem código"}</div>
        {item.variante && (
          <div className={cn("font-medium", destaque ? "text-base leading-tight" : "text-sm", !esmaecida && "text-foreground", riscada && "line-through")}>{item.variante}</div>
        )}
        <div className={cn("truncate text-xs text-muted-foreground", riscada && "line-through")}>{item.nome}</div>
        {item.observacao && <div className="text-xs text-muted-foreground">{item.observacao}</div>}
        {(qtd > 1 || item.origem === "clube") && (
          <div className="mt-1 flex gap-1">
            {qtd > 1 && (
              <Badge variant="secondary" className="tabular-nums">
                {qtd}×
              </Badge>
            )}
            {item.origem === "clube" && <Badge variant="outline">Clube</Badge>}
          </div>
        )}
        {extra}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2 self-center">{children}</div>}
    </div>
  )
}
