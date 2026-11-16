import { useMemo, useState } from "react"
import { BookOpen, Printer, RefreshCw, SearchX } from "lucide-react"
import CartaoCatalogo from "@/components/catalogo/CartaoCatalogo"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAtualizacaoAutomaticaCatalogo, useAtualizarCatalogo, useCatalogoCompleto, type PecaCatalogo } from "@/lib/api"
import { categoriaDoNome, paraBusca } from "@/lib/categoria"
import type { Etiqueta } from "@/lib/etiquetas"

const PASSO = 60

type Ordem = "nome" | "codigo" | "recentes"
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "nome", rotulo: "Nome (A–Z)" },
  { valor: "codigo", rotulo: "Código (A–Z)" },
  { valor: "recentes", rotulo: "Atualizadas há pouco" },
]
const COMPARAR: Record<Ordem, (a: PecaCatalogo, b: PecaCatalogo) => number> = {
  nome: (a, b) => a.produto.localeCompare(b.produto, "pt-BR") || (a.variante ?? "").localeCompare(b.variante ?? "", "pt-BR", { numeric: true }),
  codigo: (a, b) => (a.sku ?? "~").localeCompare(b.sku ?? "~", "pt-BR", { numeric: true }),
  recentes: (a, b) => (b.atualizado_em ?? "").localeCompare(a.atualizado_em ?? ""),
}

// Todas as peças da Shopify, para achar uma peça e imprimir etiquetas avulsas (repor etiqueta perdida,
// estoque novo). Selecione, ajuste quantas etiquetas de cada e imprima de uma vez.
export default function Catalogo() {
  const { data, isLoading, isError, isFetching, refetch } = useCatalogoCompleto()
  const atualizar = useAtualizarCatalogo()
  useAtualizacaoAutomaticaCatalogo(true)
  const { zebra, imprimindo, dialogo, imprimir } = useImprimirEtiquetas()
  const [busca, setBusca] = useState("")
  const [categoria, setCategoria] = useState("todas")
  const [ordem, setOrdem] = useState<Ordem>("nome")
  const [limite, setLimite] = useState(PASSO)
  // Peças escolhidas e quantas etiquetas de cada (variant_id → quantidade).
  const [escolhidas, setEscolhidas] = useState<Map<number, number>>(new Map())

  const categorias = useMemo(() => [...new Set((data ?? []).map((p) => categoriaDoNome(p.produto)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data])
  const filtradas = useMemo(() => {
    const termo = paraBusca(busca.trim())
    return (data ?? [])
      .filter((p) => categoria === "todas" || categoriaDoNome(p.produto) === categoria)
      .filter((p) => !termo || [p.sku, p.produto, p.variante].some((t) => paraBusca(t).includes(termo)))
      .sort(COMPARAR[ordem])
  }, [data, busca, categoria, ordem])
  const visiveis = filtradas.slice(0, limite)

  const mudarQtd = (id: number, qtd: number) =>
    setEscolhidas((atual) => {
      const novo = new Map(atual)
      if (qtd > 0) novo.set(id, qtd)
      else novo.delete(id)
      return novo
    })
  const filtrar = (f: () => void) => {
    f()
    setLimite(PASSO)
  }

  const porId = useMemo(() => new Map((data ?? []).map((p) => [p.variant_id, p])), [data])
  const etiquetas: Etiqueta[] = [...escolhidas].flatMap(([id, qtd]) => {
    const sku = porId.get(id)?.sku?.trim()
    return sku ? Array.from({ length: qtd }, () => ({ tipo: "peca" as const, sku })) : []
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-48 flex-1 text-sm text-muted-foreground">
          {data ? `${filtradas.length} de ${data.length} peças ativas da Shopify.` : "Peças ativas da Shopify."}
        </p>
        <Button variant="outline" size="toque" disabled={atualizar.isPending} onClick={() => atualizar.mutate(undefined)}>
          {atualizar.isPending ? <Spinner /> : <RefreshCw />} Atualizar da Shopify
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <CampoBusca valor={busca} aoMudar={(v) => filtrar(() => setBusca(v))} placeholder="Buscar peça ou código" className="sm:max-w-sm" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={categoria} onValueChange={(v) => filtrar(() => setCategoria(v))}>
            <SelectTrigger className="h-11 w-full sm:w-44 lg:h-9" aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ordem} onValueChange={(v) => filtrar(() => setOrdem(v as Ordem))}>
            <SelectTrigger className="h-11 w-full sm:w-48 lg:h-9" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDENS.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      ) : isError && !data ? null : !data?.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>Catálogo vazio</EmptyTitle>
            <EmptyDescription>Toque em "Atualizar da Shopify" para trazer as peças.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !filtradas.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça encontrada</EmptyTitle>
            <EmptyDescription>Mude a busca ou a categoria.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visiveis.map((p) => {
              const qtd = escolhidas.get(p.variant_id) ?? 0
              return (
                <CartaoCatalogo
                  key={p.variant_id}
                  foto={p.foto_url}
                  alt={p.produto}
                  codigo={p.sku ?? "sem código"}
                  variante={p.variante}
                  nome={p.produto}
                  selecionado={qtd > 0}
                  acao={p.sku ? { rotulo: "Selecionar", rotuloMarcado: "Selecionada" } : undefined}
                  onCard={p.sku ? () => mudarQtd(p.variant_id, 1) : undefined}
                  quantidade={qtd > 0 ? { valor: qtd, aoMudar: (n) => mudarQtd(p.variant_id, n) } : undefined}
                />
              )
            })}
          </div>
          {filtradas.length > limite && (
            <Button variant="outline" size="toque" className="self-center" onClick={() => setLimite((l) => l + PASSO)}>
              Mostrar mais ({filtradas.length - limite})
            </Button>
          )}
        </>
      )}

      {escolhidas.size > 0 && (
        // Barra presa no rodapé enquanto houver peça escolhida.
        <div className="sticky bottom-0 z-10 -mb-3 flex items-center gap-2 border-t bg-background py-3 sm:-mb-4 sm:pb-4">
          <span className="min-w-0 flex-1 text-sm tabular-nums">
            {escolhidas.size} {escolhidas.size === 1 ? "peça" : "peças"} · {etiquetas.length} {etiquetas.length === 1 ? "etiqueta" : "etiquetas"}
          </span>
          <Button variant="ghost" size="toque" onClick={() => setEscolhidas(new Map())}>
            Limpar
          </Button>
          <Button size="xl" disabled={!etiquetas.length || imprimindo} onClick={() => imprimir([{ numero: "Catálogo", cliente: null, etiquetas, itemIds: [] }])}>
            {imprimindo ? <Spinner /> : <Printer />} Imprimir{zebra && <span className="font-normal opacity-80"> · Zebra</span>}
          </Button>
        </div>
      )}
      {dialogo}
    </div>
  )
}
