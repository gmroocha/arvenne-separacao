import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useMemo, useState } from "react"
import { Link } from "react-router"
import { ChevronRight, ListChecks, PackageCheck, SearchX } from "lucide-react"
import Foto from "@/components/Foto"
import Prazo from "@/components/pedido/Prazo"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { usePedidosExpedicao, useRepetidas } from "@/lib/api"
import { formatarPrazo } from "@/lib/formato"
import { categoriaDoNome, paraBusca } from "@/lib/categoria"
import type { PecaRepetida, Pedido } from "@/lib/tipos"
import { cn } from "@/lib/utils"

// Seleção e destaques do dia ficam neste aparelho (conveniência): somem sozinhos quando os pedidos saem da separação.
const CHAVE = "repetidas:selecao"
const CHAVE_DESTAQUE = "repetidas:destaque"
function lerLista(chave: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}
function gravarLista(chave: string, ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(chave, JSON.stringify(ids))
    else localStorage.removeItem(chave)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}
const lerSelecao = () => lerLista(CHAVE)

type Ordem = "pedidos" | "prazo" | "unidades" | "codigo"
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: "pedidos", rotulo: "Mais pedidos" },
  { valor: "prazo", rotulo: "Prazo mais curto" },
  { valor: "unidades", rotulo: "Mais unidades" },
  { valor: "codigo", rotulo: "Código (A–Z)" },
]
// Prazo mais curto entre os pedidos da peça (sem prazo vai para o fim).
const prazoDe = (r: PecaRepetida) => Math.min(...r.pedidos.map((p) => (p.prazo ? Date.parse(p.prazo) : Infinity)))
const COMPARAR: Record<Ordem, (a: PecaRepetida, b: PecaRepetida) => number> = {
  pedidos: (a, b) => b.qtd_pedidos - a.qtd_pedidos || b.qtd_total - a.qtd_total,
  prazo: (a, b) => prazoDe(a) - prazoDe(b) || b.qtd_pedidos - a.qtd_pedidos,
  unidades: (a, b) => b.qtd_total - a.qtd_total || b.qtd_pedidos - a.qtd_pedidos,
  codigo: (a, b) => (a.sku ?? "~").localeCompare(b.sku ?? "~", "pt-BR", { numeric: true }),
}

const EM_SEPARACAO = new Set(["novo", "separacao"])
const atrasado = (p: Pick<Pedido, "prazo" | "prazo_horas_uteis">) => formatarPrazo(p.prazo, p.prazo_horas_uteis).atrasado

// Peças pendentes que estão em mais de um pedido: pega o saco uma vez e separa para todas.
// O que importa para achar no estoque é foto, código, variante e quantidade; o nome fica pequeno.
export default function Repetidas() {
  const [selecao, setSelecao] = useState<string[]>(lerSelecao)
  const [escolhendo, setEscolhendo] = useState(false)
  const expedicao = usePedidosExpedicao()
  // Pedidos que podem ser separados, do prazo mais curto ao mais longo (a consulta já vem nessa ordem).
  const candidatos = useMemo(() => (expedicao.data ?? []).filter((p) => EM_SEPARACAO.has(p.status)), [expedicao.data])
  // Só vale o que ainda está na separação; se nada sobrar, volta a mostrar todos.
  const efetiva = useMemo(() => {
    if (!expedicao.data) return selecao.length ? [...selecao].sort() : null
    const ids = new Set(candidatos.map((p) => p.id))
    const validos = selecao.filter((id) => ids.has(id)).sort()
    return validos.length ? validos : null
  }, [selecao, candidatos, expedicao.data])
  const { data, isLoading, isError, isFetching, refetch } = useRepetidas(efetiva, !selecao.length || !expedicao.isLoading)
  const [busca, setBusca] = useState("")
  const [categoria, setCategoria] = useState("todas")
  const [ordem, setOrdem] = useState<Ordem>("pedidos")
  // Pedidos destacados: as peças dessas clientes ficam marcadas em todos os cartões.
  const [destaque, setDestaque] = useState<string[]>(() => lerLista(CHAVE_DESTAQUE))
  const destacados = new Set(destaque)
  function destacar(id: string, sim: boolean) {
    const ids = sim ? [...new Set([...destaque, id])] : destaque.filter((x) => x !== id)
    setDestaque(ids)
    gravarLista(CHAVE_DESTAQUE, ids)
  }
  const categorias = useMemo(() => [...new Set((data ?? []).map((r) => categoriaDoNome(r.nome)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data])
  const visiveis = useMemo(() => {
    const termo = paraBusca(busca.trim())
    return (data ?? [])
      .filter((r) => categoria === "todas" || categoriaDoNome(r.nome) === categoria)
      .filter((r) => !termo || [r.sku, r.nome, r.variante, ...r.pedidos.map((p) => p.cliente)].some((t) => paraBusca(t).includes(termo)))
      .sort(COMPARAR[ordem])
  }, [data, busca, categoria, ordem])

  function mudar(ids: string[]) {
    setSelecao(ids)
    gravarLista(CHAVE, ids)
  }
  const marcado = new Set(efetiva ?? [])
  const qtdAtrasados = candidatos.filter(atrasado).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-48 flex-1 text-sm text-muted-foreground">
          {efetiva
            ? `Repetidas entre ${efetiva.length} de ${candidatos.length} pedidos.`
            : "Pegue o saco uma vez e separe para todos os pedidos."}
        </p>
        {efetiva && (
          <Button variant="ghost" size="toque" onClick={() => mudar([])}>
            Ver todos
          </Button>
        )}
        <Button variant="outline" size="toque" onClick={() => setEscolhendo(true)}>
          <ListChecks /> Selecionar pedidos
          {efetiva && <Badge variant="secondary" className="tabular-nums">{efetiva.length}</Badge>}
        </Button>
      </div>

      <RespDialog
        aberto={escolhendo}
        aoMudar={setEscolhendo}
        titulo="Pedidos para separar"
        descricao="Marque os pedidos que vão ser separados agora. Só as peças repetidas entre eles aparecem."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => mudar(candidatos.map((p) => p.id))}>
              Todos
            </Button>
            <Button variant="outline" size="sm" disabled={!qtdAtrasados} onClick={() => mudar(candidatos.filter(atrasado).map((p) => p.id))}>
              Atrasados <Badge variant="secondary" className="tabular-nums">{qtdAtrasados}</Badge>
            </Button>
            <Button variant="ghost" size="sm" disabled={!marcado.size} onClick={() => mudar([])}>
              Limpar
            </Button>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {marcado.size ? `${marcado.size} marcados` : "Nenhum marcado: mostra todos"}
            </span>
          </div>
          {expedicao.isError && <ErroConsulta aoTentar={() => void expedicao.refetch()} carregando={expedicao.isFetching} comDados={!!expedicao.data} />}
          {expedicao.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !candidatos.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum pedido esperando separação.</p>
          ) : (
            // Só a lista rola: filtros em cima e "Pronto" embaixo ficam sempre à vista.
            <ul className="-mx-0.5 flex max-h-[calc(80svh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto overscroll-contain p-0.5 sm:max-h-[calc(94svh-15rem)]">
              {candidatos.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 has-data-checked:bg-muted/60 has-data-checked:ring-foreground/25">
                    <Checkbox
                      checked={marcado.has(p.id)}
                      onCheckedChange={(c) => mudar(c ? [...marcado, p.id] : [...marcado].filter((id) => id !== p.id))}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{p.cliente_nome ?? "Sem nome"}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {p.numero.replace(/^#/, "")} · {p.qtd_pecas} {p.qtd_pecas === 1 ? "peça" : "peças"}
                      </span>
                      <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} className="mt-1 self-start" />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button size="toque" onClick={() => setEscolhendo(false)}>
            Pronto
          </Button>
        </div>
      </RespDialog>

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {!!data?.length && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar peça, código ou cliente" className="sm:max-w-sm" />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={categoria} onValueChange={setCategoria}>
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
            <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
              <SelectTrigger className="h-11 w-full sm:w-44 lg:h-9" aria-label="Ordenar">
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
      )}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : !data?.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageCheck />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça repetida</EmptyTitle>
            <EmptyDescription>
              {efetiva
                ? "Nenhuma peça se repete entre os pedidos escolhidos."
                : "Aparecem aqui peças pendentes que estão em mais de um pedido."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !visiveis.length ? (
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((r) => (
            <Card key={r.chave} size="sm" className={cn(r.pedidos.some((p) => destacados.has(p.pedido_id)) && "ring-2 ring-primary")}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Foto url={r.foto_url} alt={r.nome} ampliar className="size-28 shrink-0 sm:size-32" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-mono text-lg leading-tight font-semibold break-all">{r.sku ?? "sem código"}</span>
                    {r.variante && <span className="text-base leading-tight font-semibold">{r.variante}</span>}
                    <span className="line-clamp-2 text-xs text-muted-foreground">{r.nome}</span>
                    <div className="mt-auto flex items-baseline gap-1.5 pt-1">
                      <span className="text-2xl leading-none font-semibold tabular-nums">{r.qtd_total}</span>
                      <span className="text-sm text-muted-foreground">un. · {r.qtd_pedidos} pedidos</span>
                    </div>
                  </div>
                </div>
                <ItemGroup className="gap-2">
                  {r.pedidos.map((p) => {
                    const marcado = destacados.has(p.pedido_id)
                    return (
                      <li key={p.pedido_id} className="flex items-center gap-1">
                        {/* Destacar: marca as peças desta cliente em todos os cartões da página. */}
                        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center" title="Destacar as peças desta cliente">
                          <Checkbox
                            checked={marcado}
                            aria-label={`Destacar peças de ${p.cliente ?? p.numero}`}
                            onCheckedChange={(c) => destacar(p.pedido_id, c === true)}
                          />
                        </label>
                        <Item variant="outline" size="sm" asChild className={cn("min-w-0 flex-1", marcado && "bg-muted ring-2 ring-primary")}>
                          <Link to={`/pedidos/${p.pedido_id}`}>
                            <ItemContent>
                              <ItemTitle>{p.cliente ?? "Sem nome"}</ItemTitle>
                              <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                                {p.numero.replace(/^#/, "")}
                                <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} />
                              </ItemDescription>
                            </ItemContent>
                            <span className="text-sm text-muted-foreground tabular-nums">{p.qtd}×</span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </Item>
                      </li>
                    )
                  })}
                </ItemGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
