import { SeloQtd } from "@/components/comum/SeloQtd"
import type { ReactNode } from "react"
import Foto from "@/components/Foto"
import { detalheDoItem } from "@/lib/detalhePeca"
import { NotaNaPeca } from "@/components/pedido/NotaNaPeca"
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
  nota?: string | null // nota da peça (menu "…" → Nota)
  preco?: number | null // só o detalhe da foto mostra (valores do banco)
  preco_pago?: number | null
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
  aoClicarObservacao?: () => void // observação vira botão (ex.: "troca de X" abre a troca)
  semNome?: boolean // só código (SKU) e variante: para listas onde o nome do produto só polui
  emLinha?: boolean // variante ao lado do código, não embaixo (linhas mais baixas, foto alinhada)
  extraAoLado?: boolean // no PC a linha extra vai à direita dos textos (no celular continua embaixo)
  className?: string
}

const FOTO = { sm: "size-10", md: "size-14", lg: "size-20" } as const
const PX = { sm: 200, md: 200, lg: 300 } as const

// Linha de peça padrão do app: foto, código (SKU, o destaque), variante e nome, com quantidade e origem.
export function LinhaPeca({ item, tamanho = "md", destaque, esmaecida, riscada, entrando, saindo, inicio, extra, children, semBorda, semNome, emLinha, extraAoLado, aoClicarObservacao, className }: Props) {
  const qtd = item.qtd ?? 1
  const codigo = <div className={cn("truncate font-mono font-semibold", tamanho === "sm" ? "text-sm" : "text-base leading-tight", emLinha && "shrink-0", riscada && "line-through")}>{item.sku ?? "sem código"}</div>
  const variante = item.variante && (
    <div className={cn(destaque ? "text-base leading-tight font-medium" : "text-sm", emLinha && "min-w-0 leading-tight font-medium break-words", !esmaecida && "text-foreground", riscada && "line-through")}>{item.variante}</div>
  )
  const textos = (
    <div className="min-w-0 flex-1">
      {emLinha ? (
        // Variante ao lado do código; sem espaço (celular, código longo), desce para a linha de baixo.
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          {codigo}
          {variante}
        </div>
      ) : (
        <>
          {codigo}
          {variante}
        </>
      )}
      {!semNome && <div className={cn("truncate text-xs text-muted-foreground", riscada && "line-through")}>{item.nome}</div>}
      {item.observacao &&
        (aoClicarObservacao ? (
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-4" onClick={aoClicarObservacao}>
            {item.observacao}
          </button>
        ) : (
          <div className="text-xs text-muted-foreground">{item.observacao}</div>
        ))}
      {item.nota && <NotaNaPeca nota={item.nota} />}
      {(qtd > 1 || item.origem === "clube") && (
        <div className="mt-1 flex gap-1">
          {qtd > 1 && (
            <SeloQtd qtd={qtd} className="h-6 px-2 text-sm" />
          )}
          {item.origem === "clube" && <Badge variant="outline">Clube</Badge>}
        </div>
      )}
      {!extraAoLado && extra}
    </div>
  )
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
      <Foto url={fotoTamanho(item.foto_url, PX[tamanho])} alt={item.nome} ampliar peca={detalheDoItem(item)} className={cn("shrink-0", FOTO[tamanho], esmaecida && "opacity-70")} />
      {extraAoLado ? (
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
          {textos}
          {extra}
        </div>
      ) : (
        textos
      )}
      {children && <div className="flex shrink-0 items-center gap-2 self-center">{children}</div>}
    </div>
  )
}
