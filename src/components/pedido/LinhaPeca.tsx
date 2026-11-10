import type { ReactNode } from "react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import type { Item } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  item: Item
  compacta?: boolean
  saindo?: boolean
  entrando?: boolean
  esmaecida?: boolean
  children?: ReactNode // botões à direita
}

// Linha de peça da separação: foto, SKU, nome e variante em destaque.
export default function LinhaPeca({ item, compacta, saindo, entrando, esmaecida, children }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-2",
        entrando && "animate-in fade-in slide-in-from-left-2 duration-300",
        saindo && "animate-out fade-out slide-out-to-right-4 fill-mode-forwards duration-200",
        esmaecida && "bg-muted/40 text-muted-foreground",
      )}
    >
      <Foto
        url={item.foto_url}
        alt={item.nome}
        ampliar
        className={cn("shrink-0", compacta ? "size-10" : "size-[72px]", esmaecida && "opacity-70")}
      />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs text-muted-foreground">{item.sku ?? "sem código"}</div>
        <div className={cn("truncate text-sm", item.status === "removido" && "line-through")}>{item.nome}</div>
        {item.variante && (
          <div className={cn("font-semibold", compacta ? "text-sm" : "text-base leading-tight text-foreground")}>
            {item.variante}
          </div>
        )}
        {item.observacao && <div className="text-xs text-muted-foreground">{item.observacao}</div>}
        {(item.qtd > 1 || item.origem === "clube") && (
          <div className="mt-1 flex gap-1">
            {item.qtd > 1 && <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium tabular-nums">{item.qtd}×</Badge>}
            {item.origem === "clube" && <Badge variant="outline">Clube</Badge>}
          </div>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2 self-center">{children}</div>}
    </div>
  )
}
