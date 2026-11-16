import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useMemo, useState } from "react"
import { Link } from "react-router"
import { ChevronRight, ListChecks, PackageCheck } from "lucide-react"
import Foto from "@/components/Foto"
import Prazo from "@/components/pedido/Prazo"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { usePedidosFase, useRepetidas } from "@/lib/api"
import { formatarPrazo } from "@/lib/formato"
import type { Pedido } from "@/lib/tipos"

// Seleção do dia fica neste aparelho (conveniência): some sozinha quando os pedidos saem da separação.
const CHAVE = "repetidas:selecao"
function lerSelecao(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}
function gravarSelecao(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(CHAVE, JSON.stringify(ids))
    else localStorage.removeItem(CHAVE)
  } catch {
    /* sem armazenamento: a seleção vale só nesta visita */
  }
}

const EM_SEPARACAO = new Set(["novo", "separacao"])
const atrasado = (p: Pick<Pedido, "prazo" | "prazo_horas_uteis">) => formatarPrazo(p.prazo, p.prazo_horas_uteis).atrasado

// Peças pendentes que estão em mais de um pedido: pega o saco uma vez e separa para todas.
// O que importa para achar no estoque é foto, código, variante e quantidade; o nome fica pequeno.
export default function Repetidas() {
  const [selecao, setSelecao] = useState<string[]>(lerSelecao)
  const [escolhendo, setEscolhendo] = useState(false)
  const expedicao = usePedidosFase("expedicao")
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

  function mudar(ids: string[]) {
    setSelecao(ids)
    gravarSelecao(ids)
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
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((r) => (
            <Card key={r.chave} size="sm">
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
                  {r.pedidos.map((p) => (
                    <li key={p.pedido_id}>
                    <Item variant="outline" size="sm" asChild>
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
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
