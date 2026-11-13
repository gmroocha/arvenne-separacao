import { useState, type ReactNode } from "react"
import { Check, ChevronDown, MoreHorizontal, Printer, Undo2 } from "lucide-react"
import { MarcaCheck } from "@/components/comum/Bolha"
import { LinhaPeca } from "@/components/comum/Peca"
import Foto from "@/components/Foto"
import RespDialog from "@/components/RespDialog"
import MenuAcoes, { type GrupoAcoes, type ItemAcao } from "@/components/MenuAcoes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { useAlteracoesDoPedido } from "@/components/pedido/alteracoesContexto"
import { numeroTamanho, separarTamanho, codigoModelo } from "@/lib/variante"
import type { Item } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type TileProps = {
  item: Item
  instrucao?: ReactNode // faixa de destaque sob o código (ex.: "Separe 2")
  contador?: ReactNode // selo no canto inferior da foto (ex.: "1/2")
  piscando?: boolean
  esmaecida?: boolean
  children?: ReactNode // ações, em uma linha: botão principal (flex-1) + MenuPeca
}

// Selo no canto da foto: "Clube".
function SelosPeca({ item }: { item: Item }) {
  if (item.origem !== "clube") return null
  return (
    <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
      {item.origem === "clube" && (
        <Badge variant="outline" className="bg-background">
          Clube
        </Badge>
      )}
    </div>
  )
}

// Peça em bloco: foto grande, código, variante e quantidade legíveis no celular. O nome fica pequeno.
// Instrução e ações ficam juntas no rodapé (mt-auto), para os blocos da mesma linha alinharem por baixo.
export function TilePeca({ item, instrucao, contador, piscando, esmaecida, children }: TileProps) {
  const { abrir } = useAlteracoesDoPedido()
  return (
    <div
      style={{ viewTransitionName: `peca-${item.id}` }}
      className={cn(
        "flex flex-col gap-2 rounded-xl bg-card p-2 ring-(length:--traco) ring-foreground/10 transition-shadow duration-300",
        piscando && "ring-2 ring-primary",
        esmaecida && "bg-muted/40",
      )}
    >
      <div className="relative">
        <Foto url={item.foto_url} alt={item.nome} ampliar className={cn("w-full", esmaecida && "opacity-60")} />
        <SelosPeca item={item} />
        {contador && <div className="absolute right-1.5 bottom-1.5">{contador}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-mono text-lg leading-tight font-semibold break-all">{item.sku ?? "sem código"}</div>
          {item.qtd > 1 && <Badge variant="secondary" className="h-6 shrink-0 px-2 text-sm font-medium tabular-nums">{item.qtd}×</Badge>}
        </div>
        {item.variante && <div className="text-sm leading-tight font-medium">{item.variante}</div>}
        <div className="line-clamp-1 text-xs text-muted-foreground">{item.nome}</div>
        {item.observacao &&
          (abrir && item.troca_peca_origem_id ? (
            <button type="button" className="w-fit text-left text-xs text-muted-foreground underline underline-offset-4" onClick={() => abrir({ foco: item.id, comValores: false })}>
              {item.observacao}
            </button>
          ) : (
            <div className="text-xs text-muted-foreground">{item.observacao}</div>
          ))}
      </div>
      {(instrucao || children) && (
        <div className="mt-auto flex flex-col gap-2">
          {instrucao}
          {children && <div className="flex items-center gap-1.5">{children}</div>}
        </div>
      )}
    </div>
  )
}

// Vários tamanhos do mesmo modelo num bloco só: uma foto, o código do modelo e os tamanhos com a quantidade de cada.
// Na loja o modelo fica numa sacola só: achou o modelo, achou todos os tamanhos.
export function TileModelo({ itens, children }: { itens: Item[]; children?: ReactNode }) {
  const ordenados = [...itens].sort((a, b) => numeroTamanho(separarTamanho(a.variante).tamanho) - numeroTamanho(separarTamanho(b.variante).tamanho))
  const base = ordenados[0]
  const total = ordenados.reduce((n, i) => n + i.qtd, 0)
  const variacao = separarTamanho(base.variante).base
  return (
    <div style={{ viewTransitionName: `peca-${base.id}` }} className="flex flex-col gap-2 rounded-xl bg-card p-2 ring-(length:--traco) ring-foreground/10 transition-shadow duration-300">
      <div className="relative">
        <Foto url={base.foto_url} alt={base.nome} ampliar className="w-full" />
        <SelosPeca item={base} />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-mono text-lg leading-tight font-semibold break-all">{codigoModelo(ordenados.map((i) => i.sku)) ?? "sem código"}</div>
          <Badge variant="secondary" className="h-6 shrink-0 px-2 text-sm font-medium tabular-nums">{total}×</Badge>
        </div>
        {variacao && <div className="text-sm leading-tight font-medium">{variacao}</div>}
        <div className="flex flex-wrap gap-1">
          {/* Mesmo tamanho em duas linhas (sobra de uma falta parcial desfeita): um selo só, com a soma. */}
          {[...ordenados.reduce((m, i) => {
            const t = separarTamanho(i.variante).tamanho ?? ""
            return m.set(t, (m.get(t) ?? 0) + i.qtd)
          }, new Map<string, number>())].map(([t, qtd]) => (
            <Badge key={t} variant="outline" className="h-6 gap-1 px-2 text-sm font-medium tabular-nums">
              {t}
              <span className="text-muted-foreground">×{qtd}</span>
            </Badge>
          ))}
        </div>
        <div className="line-clamp-1 text-xs text-muted-foreground">{base.nome}</div>
      </div>
      {children && <div className="mt-auto flex items-center gap-1.5">{children}</div>}
    </div>
  )
}

// Faixa de instrução sob o código do bloco (ex.: "Separe 2").
export function InstrucaoTile({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-primary/10 px-2 py-1.5 text-center text-lg font-semibold text-primary tabular-nums">{children}</div>
}

export function GradePecas({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

// Menu "…" do bloco: quadrado sem borda, da mesma altura do botão principal (que é o destaque).
// itens: uma lista simples; grupos: seções com título (ex.: uma por tamanho no cartão do modelo).
export function MenuPeca({ itens = [], grupos, rotulo = "Mais opções" }: { itens?: ItemAcao[]; grupos?: GrupoAcoes[]; rotulo?: string }) {
  return (
    <MenuAcoes
      titulo={rotulo}
      grupos={grupos ?? [{ itens }]}
      gatilho={
        <Button variant="secondary" size="icon-bloco" aria-label={rotulo} className="shrink-0">
          <MoreHorizontal />
        </Button>
      }
    />
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
      <Progress aria-label={titulo} value={total ? (feitas / total) * 100 : 0} />
    </div>
  )
}

export { Vazio } from "@/components/comum/Vazio"

type FaixaProps = {
  titulo: string
  itens: Item[]
  rotuloDesfazer?: string
  aoDesfazer: (item: Item) => void
  aoReimprimir?: (item: Item) => void
  nota?: (item: Item) => string | null
  abertaInicial?: boolean
  // "Desfazer tudo" à direita do título: devolve todas as peças da faixa (pede confirmação antes).
  aoDesfazerTudo?: () => void
}

// Faixa recolhível das peças já feitas: miniaturas pequenas com Desfazer.
export function FaixaFeitas({ titulo, itens, rotuloDesfazer = "Desfazer", aoDesfazer, aoReimprimir, nota, abertaInicial = true, aoDesfazerTudo }: FaixaProps) {
  const { abrir } = useAlteracoesDoPedido()
  const [aberta, setAberta] = useState(abertaInicial)
  const [confirmarTudo, setConfirmarTudo] = useState(false)
  if (itens.length === 0) return null
  return (
    <Collapsible open={aberta} onOpenChange={setAberta}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 h-9 text-muted-foreground">
            {titulo} ({itens.length}) <ChevronDown className={cn("transition-transform", aberta && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        {aoDesfazerTudo && itens.length > 1 && (
          <Button variant="ghost" size="sm" className="-mr-2 h-9 text-muted-foreground" onClick={() => setConfirmarTudo(true)}>
            <Undo2 /> Desfazer tudo
          </Button>
        )}
      </div>
      {aoDesfazerTudo && (
        <RespDialog
          aberto={confirmarTudo}
          aoMudar={setConfirmarTudo}
          titulo={`Desfazer ${itens.length} peças?`}
          descricao={`Todas as peças de "${titulo}" voltam para a lista de cima.`}
        >
          <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
            <Button
              size="toque"
              onClick={() => {
                aoDesfazerTudo()
                setConfirmarTudo(false)
              }}
            >
              <Check /> Desfazer tudo
            </Button>
            <Button size="toque" variant="outline" onClick={() => setConfirmarTudo(false)}>
              Cancelar
            </Button>
          </div>
        </RespDialog>
      )}
      <CollapsibleContent className="grid gap-1.5 pt-1 sm:grid-cols-2">
        {itens.map((i) => (
          <LinhaPeca
            key={i.id}
            item={{ ...i, variante: [i.variante, nota?.(i)].filter(Boolean).join(" · ") || null }}
            tamanho="md"
            semBorda
            entrando
            className="gap-2 rounded-xl bg-success/5 p-2 ring-(length:--traco) ring-success/30"
            inicio={<MarcaCheck />}
            aoClicarObservacao={abrir && i.troca_peca_origem_id ? () => abrir({ foco: i.id, comValores: false }) : undefined}
          >
            {aoReimprimir && (
              <Button variant="ghost" size="toque" aria-label="Reimprimir" className="shrink-0" onClick={() => aoReimprimir(i)}>
                <Printer /> <span className="hidden sm:inline">Reimprimir</span>
              </Button>
            )}
            <Button variant="ghost" size="toque" className="shrink-0" onClick={() => aoDesfazer(i)}>
              {rotuloDesfazer}
            </Button>
          </LinhaPeca>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
