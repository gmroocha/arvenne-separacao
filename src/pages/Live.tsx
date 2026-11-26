import { useState } from "react"
import { Images, Plus, Printer, Video } from "lucide-react"
import ClubeEmMassa from "@/components/clube/ClubeEmMassa"
import { CartaoProduto, CartaoSimples, EditarProduto, type Peca } from "@/components/clube/CartoesClube"
import { useExcluirPeca } from "@/components/clube/useExcluirPeca"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import PecaClubeForm from "@/components/PecaClubeForm"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useLives, useModelosClube, usePecasClube } from "@/lib/api"
import { agruparClube, type GrupoClube } from "@/lib/clubeModelos"
import type { Etiqueta } from "@/lib/etiquetas"
import { diaMes } from "@/lib/formato"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

const PASSO = 30

// Peças da Live: o catálogo das peças vendidas nas lives, por data. Todos (gestor e funcionárias) veem, cadastram
// e imprimem etiquetas; é o mesmo cadastro do Clube (pecas_clube), com catalogo 'live' e a data da live.
export default function Live() {
  const lives = useLives()
  const datas = lives.data?.lives ?? []
  const [escolhida, setEscolhida] = useState<string | null>(null)
  // Sem escolha ainda: a live mais recente (ou todas, se não houver nenhuma).
  const liveEm = escolhida ?? datas[0]?.live_em ?? "todas"
  const filtroLive = liveEm === "todas" ? null : liveEm
  const [busca, setBusca] = useState("")
  const [novo, setNovo] = useState(false)
  const [emMassa, setEmMassa] = useState(false)
  const [limite, setLimite] = useState(PASSO)
  const { data, isLoading, isError, isFetching, refetch } = usePecasClube(busca, false, limite, { catalogo: "live", liveEm: filtroLive })
  // Todas as peças ativas da live escolhida, para "Imprimir todas desta live".
  const todasDaLive = usePecasClube("", false, 1000, { catalogo: "live", liveEm: filtroLive })
  const modelos = useModelosClube("live").data ?? []
  const excluir = useExcluirPeca()
  const [editando, setEditando] = useState<PecaClube | null>(null)
  const [editandoProduto, setEditandoProduto] = useState<ModeloClube | null>(null)
  const grupos = agruparClube(data ?? [], modelos)
  const { zebra, imprimindo, dialogo, imprimir } = useImprimirEtiquetas()
  // Peças escolhidas para etiqueta: id -> código e quantidade.
  const [escolhidas, setEscolhidas] = useState<Map<string, { codigo: string; qtd: number }>>(new Map())
  const etiquetas = {
    qtd: (id: string) => escolhidas.get(id)?.qtd ?? 0,
    aoMudar: (peca: PecaClube, n: number) =>
      setEscolhidas((atual) => {
        const novoMapa = new Map(atual)
        if (n > 0) novoMapa.set(peca.id, { codigo: peca.codigo, qtd: n })
        else novoMapa.delete(peca.id)
        return novoMapa
      }),
  }
  const listaEtiquetas: Etiqueta[] = [...escolhidas.values()].flatMap(({ codigo, qtd }) => Array.from({ length: qtd }, () => ({ tipo: "peca" as const, sku: codigo.trim() })))
  const daLive = todasDaLive.data ?? []
  const filtrar = (f: () => void) => {
    f()
    setLimite(PASSO)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={liveEm} onValueChange={(v) => filtrar(() => setEscolhida(v))}>
          <SelectTrigger className="h-11 w-full sm:w-64 lg:h-9" aria-label="Data da live">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as lives</SelectItem>
            {datas.map((d) => (
              <SelectItem key={d.live_em} value={d.live_em}>
                Live {diaMes(d.live_em)}/{d.live_em.slice(0, 4)} · {d.pecas} {d.pecas === 1 ? "peça" : "peças"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CampoBusca className="min-w-48 flex-1" valor={busca} aoMudar={(v) => filtrar(() => setBusca(v))} placeholder="Código ou nome" />
      </div>
      {lives.data?.semBanco && <p className="text-sm text-muted-foreground">Atualize o banco para usar esta função</p>}

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="toque"
          disabled={!filtroLive || daLive.length === 0 || imprimindo}
          onClick={() => imprimir([{ numero: `Live ${diaMes(filtroLive)}`, cliente: null, etiquetas: daLive.map((p) => ({ tipo: "peca" as const, sku: p.codigo.trim() })), itemIds: [] }])}
        >
          {imprimindo ? <Spinner /> : <Printer />} Imprimir todas desta live
        </Button>
        <Button variant="outline" size="toque" onClick={() => setEmMassa(true)}>
          <Images /> Adicionar em massa
        </Button>
        <Button size="toque" onClick={() => setNovo(true)}>
          <Plus /> Nova peça
        </Button>
      </div>

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Video />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça da Live</EmptyTitle>
            <EmptyDescription>Toque em "Nova peça" para cadastrar a primeira desta live.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g) =>
            g.modelo || g.pecas[0].modelo_id ? (
              <CartaoProduto
                key={g.chave}
                grupo={g as GrupoClube<Peca>}
                etiquetas={etiquetas}
                aoEditarProduto={() => g.modelo && setEditandoProduto(g.modelo)}
                aoEditarPeca={setEditando}
                aoExcluir={excluir.pedir}
              />
            ) : (
              <CartaoSimples key={g.chave} peca={g.pecas[0] as Peca} etiquetas={etiquetas} aoEditar={() => setEditando(g.pecas[0])} aoExcluir={() => excluir.pedir(g.pecas[0])} />
            ),
          )}
        </div>
      )}
      {data && data.length >= limite && (
        <Button variant="outline" size="toque" className="w-fit self-center" onClick={() => setLimite(limite + PASSO)}>
          Carregar mais
        </Button>
      )}

      {escolhidas.size > 0 && (
        // Barra presa no rodapé enquanto houver peça escolhida (igual ao Catálogo).
        <div className="sticky bottom-0 z-10 -mb-3 flex items-center gap-2 border-t bg-background py-3 sm:-mb-4 sm:pb-4">
          <span className="min-w-0 flex-1 text-sm tabular-nums">
            {escolhidas.size} {escolhidas.size === 1 ? "peça" : "peças"} · {listaEtiquetas.length} {listaEtiquetas.length === 1 ? "etiqueta" : "etiquetas"}
          </span>
          <Button variant="ghost" size="toque" onClick={() => setEscolhidas(new Map())}>
            Limpar
          </Button>
          <Button size="xl" disabled={!listaEtiquetas.length || imprimindo} onClick={() => imprimir([{ numero: "Live", cliente: null, etiquetas: listaEtiquetas, itemIds: [] }])}>
            {imprimindo ? <Spinner /> : <Printer />} Imprimir{zebra && <span className="font-normal opacity-80"> · Zebra</span>}
          </Button>
        </div>
      )}
      {dialogo}

      <RespDialog aberto={novo} aoMudar={setNovo} titulo="Nova peça da Live" largo teclado>
        <PecaClubeForm catalogo="live" liveInicial={filtroLive ?? undefined} aoSalvar={() => setNovo(false)} />
      </RespDialog>

      <RespDialog aberto={emMassa} aoMudar={setEmMassa} titulo="Adicionar peças da Live em massa" descricao="Escolha várias fotos de uma vez e preencha uma linha para cada peça." largo teclado>
        <ClubeEmMassa catalogo="live" liveInicial={filtroLive ?? undefined} aoSalvar={() => setEmMassa(false)} />
      </RespDialog>

      <RespDialog aberto={!!editando} aoMudar={(a) => !a && setEditando(null)} titulo="Editar peça da Live" largo teclado>
        {editando && <PecaClubeForm key={editando.id} peca={editando} aoSalvar={() => setEditando(null)} />}
      </RespDialog>

      {excluir.dialogo}

      <RespDialog aberto={!!editandoProduto} aoMudar={(a) => !a && setEditandoProduto(null)} titulo="Editar produto da Live" largo teclado>
        {editandoProduto && <EditarProduto modelo={editandoProduto} aoSalvar={() => setEditandoProduto(null)} />}
      </RespDialog>
    </div>
  )
}
