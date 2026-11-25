import { useState } from "react"
import { Gem, Images, Plus } from "lucide-react"
import ClubeEmMassa from "@/components/clube/ClubeEmMassa"
import { CartaoProduto, CartaoSimples, EditarProduto, type Peca } from "@/components/clube/CartoesClube"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import PecaClubeForm from "@/components/PecaClubeForm"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAtivarPecaClube, useModelosClube, usePecasClube } from "@/lib/api"
import { agruparClube, type GrupoClube } from "@/lib/clubeModelos"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

const PASSO = 30

export default function Clube() {
  const [busca, setBusca] = useState("")
  const [novo, setNovo] = useState(false)
  const [emMassa, setEmMassa] = useState(false)
  const [inativas, setInativas] = useState(false)
  const [limite, setLimite] = useState(PASSO)
  const { data, isLoading, isError, isFetching, refetch } = usePecasClube(busca, inativas, limite)
  const modelos = useModelosClube().data ?? []
  const ativar = useAtivarPecaClube()
  const [editando, setEditando] = useState<PecaClube | null>(null)
  const [editandoProduto, setEditandoProduto] = useState<ModeloClube | null>(null)
  const grupos = agruparClube(data ?? [], modelos)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca
          className="min-w-48 flex-1"
          valor={busca}
          aoMudar={(v) => {
            setBusca(v)
            setLimite(PASSO)
          }}
          placeholder="Código ou nome"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="inativas"
            checked={inativas}
            onCheckedChange={(v) => {
              setInativas(v)
              setLimite(PASSO)
            }}
          />
          <Label htmlFor="inativas">Mostrar desativadas</Label>
        </div>
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
              <Gem />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça do Clube</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g) =>
            g.modelo || g.pecas[0].modelo_id ? (
              <CartaoProduto
                key={g.chave}
                grupo={g as GrupoClube<Peca>}
                aoEditarProduto={() => g.modelo && setEditandoProduto(g.modelo)}
                aoEditarPeca={setEditando}
                aoAtivar={(p, ativo) => ativar.mutate({ id: p.id, ativo })}
              />
            ) : (
              <CartaoSimples key={g.chave} peca={g.pecas[0] as Peca} aoEditar={() => setEditando(g.pecas[0])} aoAtivar={(ativo) => ativar.mutate({ id: g.pecas[0].id, ativo })} />
            ),
          )}
        </div>
      )}
      {data && data.length >= limite && (
        <Button variant="outline" size="toque" className="w-fit self-center" onClick={() => setLimite(limite + PASSO)}>
          Carregar mais
        </Button>
      )}

      <RespDialog aberto={novo} aoMudar={setNovo} titulo="Nova peça do Clube" largo teclado>
        <PecaClubeForm aoSalvar={() => setNovo(false)} />
      </RespDialog>

      <RespDialog aberto={emMassa} aoMudar={setEmMassa} titulo="Adicionar peças em massa" descricao="Escolha várias fotos de uma vez e preencha uma linha para cada peça." largo teclado>
        <ClubeEmMassa aoSalvar={() => setEmMassa(false)} />
      </RespDialog>

      <RespDialog aberto={!!editando} aoMudar={(a) => !a && setEditando(null)} titulo="Editar peça do Clube" largo teclado>
        {editando && <PecaClubeForm key={editando.id} peca={editando} aoSalvar={() => setEditando(null)} />}
      </RespDialog>

      <RespDialog aberto={!!editandoProduto} aoMudar={(a) => !a && setEditandoProduto(null)} titulo="Editar produto do Clube" largo teclado>
        {editandoProduto && <EditarProduto modelo={editandoProduto} aoSalvar={() => setEditandoProduto(null)} />}
      </RespDialog>
    </div>
  )
}
