import { useState, type ReactNode } from "react"
import { Check, ChevronDown, MoreHorizontal } from "lucide-react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import type { Item } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type TileProps = {
  item: Item
  instrucao?: ReactNode // faixa de destaque sob o código (ex.: "Separe 2")
  contador?: ReactNode // selo no canto inferior da foto (ex.: "1/2")
  piscando?: boolean
  esmaecida?: boolean
  children?: ReactNode // ações, em largura total
}

// Peça em bloco: foto grande, código, variante e quantidade legíveis no celular. O nome fica pequeno.
export function TilePeca({ item, instrucao, contador, piscando, esmaecida, children }: TileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-2 transition-shadow duration-300",
        piscando && "ring-2 ring-primary",
        esmaecida && "bg-muted/40",
      )}
    >
      <div className="relative">
        <Foto url={item.foto_url} alt={item.nome} ampliar className={cn("w-full", esmaecida && "opacity-60")} />
        {item.qtd > 1 && (
          <Badge className="absolute top-1.5 right-1.5 h-7 px-2.5 text-base tabular-nums shadow-sm">{item.qtd}×</Badge>
        )}
        {item.origem === "clube" && (
          <Badge variant="outline" className="absolute top-1.5 left-1.5 bg-background">
            Clube
          </Badge>
        )}
        {contador && <div className="absolute right-1.5 bottom-1.5">{contador}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <div className="font-mono text-base leading-tight font-semibold break-all">{item.sku ?? "sem código"}</div>
        {item.variante && <div className="leading-tight font-bold">{item.variante}</div>}
        <div className="line-clamp-2 text-xs text-muted-foreground">{item.nome}</div>
        {item.observacao && <div className="text-xs text-muted-foreground">{item.observacao}</div>}
      </div>
      {instrucao}
      {children && <div className="mt-auto flex flex-col gap-1.5 pt-1">{children}</div>}
    </div>
  )
}

export function GradePecas({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

// Menu "…" do bloco, com alvo de toque de 44 px no celular.
export function MenuPeca({ children, rotulo = "Mais opções" }: { children: ReactNode; rotulo?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={rotulo} className="h-11 w-full sm:h-9">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProgressoEtapa({ titulo, feitas, total, unidade }: { titulo: string; feitas: number; total: number; unidade: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {feitas} de {total} {unidade}
        </span>
      </div>
      <Progress value={total ? (feitas / total) * 100 : 0} />
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>
}

type FaixaProps = {
  titulo: string
  itens: Item[]
  rotuloDesfazer?: string
  aoDesfazer: (item: Item) => void
  nota?: (item: Item) => string | null
  abertaInicial?: boolean
}

// Faixa recolhível das peças já feitas: miniaturas pequenas com Desfazer.
export function FaixaFeitas({ titulo, itens, rotuloDesfazer = "Desfazer", aoDesfazer, nota, abertaInicial = true }: FaixaProps) {
  const [aberta, setAberta] = useState(abertaInicial)
  if (itens.length === 0) return null
  return (
    <Collapsible open={aberta} onOpenChange={setAberta}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 h-9 text-muted-foreground">
          {titulo} ({itens.length}) <ChevronDown className={cn("transition-transform", aberta && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-1.5 pt-1 sm:grid-cols-2">
        {itens.map((i) => (
          <div
            key={i.id}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 animate-in fade-in zoom-in-95 duration-300"
          >
            <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <Foto url={i.foto_url} alt={i.nome} ampliar className="size-10 shrink-0" />
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <div className="truncate font-mono font-semibold">
                {i.qtd > 1 ? `${i.qtd}× ` : ""}
                {i.sku ?? "sem código"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[i.variante, nota?.(i)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button variant="ghost" className="h-11 shrink-0 px-3 sm:h-8" onClick={() => aoDesfazer(i)}>
              {rotuloDesfazer}
            </Button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
