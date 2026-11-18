import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useState } from "react"
import { Gem, Images, Pencil, Plus } from "lucide-react"
import ClubeEmMassa from "@/components/clube/ClubeEmMassa"
import { CampoBusca } from "@/components/comum/CampoBusca"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useAtivarPecaClube, useModelosClube, usePecasClube, usePecasDoModelo } from "@/lib/api"
import { agruparClube, rotulosDeVariantes, type GrupoClube } from "@/lib/clubeModelos"
import { reais } from "@/lib/formato"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

const PASSO = 30

type Peca = PecaClube & { ativo: boolean }

// Edita o produto inteiro (o pai e as variantes, ativas ou não): busca as variantes e abre o formulário.
function EditarProduto({ modelo, aoSalvar }: { modelo: ModeloClube; aoSalvar: () => void }) {
  const { data } = usePecasDoModelo(modelo.id)
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>
  return <PecaClubeForm key={modelo.id} produto={{ modelo, pecas: data }} aoSalvar={aoSalvar} />
}

// Cartão de um produto com variantes: o pai (foto, código, nome, preço) e uma linha por variante com o botão de ativar e o lápis.
function CartaoProduto({ grupo, aoEditarProduto, aoEditarPeca, aoAtivar }: { grupo: GrupoClube<Peca>; aoEditarProduto: () => void; aoEditarPeca: (p: Peca) => void; aoAtivar: (p: Peca, ativo: boolean) => void }) {
  const primeira = grupo.pecas[0]
  const rotulos = rotulosDeVariantes(grupo.pecas.map((p) => p.variante))
  const codigo = grupo.modelo?.codigo_base ?? primeira.codigo
  const preco = grupo.modelo?.preco ?? primeira.preco
  const todasInativas = grupo.pecas.every((p) => !p.ativo)
  return (
    <Card className={todasInativas ? "opacity-50" : ""} aria-label={`Produto ${codigo}`}>
      <CardContent className="flex flex-col gap-3">
        <Foto url={grupo.modelo?.foto_url ?? primeira.foto_url} alt={grupo.modelo?.nome ?? primeira.nome} ampliar />
        <div>
          <div className="font-mono text-sm font-semibold">{codigo}</div>
          <div className="text-sm">{grupo.modelo?.nome ?? primeira.nome}</div>
          <div className="text-sm font-medium tabular-nums">{reais(preco)}</div>
        </div>
        <ul className="flex flex-col gap-1.5" aria-label="Variantes">
          {grupo.pecas.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-2 ${p.ativo ? "" : "opacity-50"}`}>
              <Badge variant="outline" className="shrink-0">{rotulos[i]}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={p.codigo}>{p.codigo}</span>
              {p.preco != null && p.preco !== preco && <span className="text-xs font-medium tabular-nums">{reais(p.preco)}</span>}
              <Switch size="sm" checked={p.ativo} aria-label={`Ativa ${p.codigo}`} onCheckedChange={(a) => aoAtivar(p, a)} />
              <Button variant="ghost" size="icon-xs" aria-label={`Editar variante ${p.codigo}`} onClick={() => aoEditarPeca(p)}>
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>
        {grupo.modelo && (
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={aoEditarProduto}>
            <Pencil /> Editar produto e variantes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

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
              <Card key={g.chave} className={(g.pecas[0] as Peca).ativo ? "" : "opacity-50"}>
                <CardContent className="flex flex-col gap-3">
                  <Foto url={g.pecas[0].foto_url} alt={g.pecas[0].nome} ampliar />
                  <div>
                    <div className="font-mono text-sm font-semibold">{g.pecas[0].codigo}</div>
                    <div className="text-sm">{g.pecas[0].nome}</div>
                    {g.pecas[0].variante && <div className="text-sm font-medium">{g.pecas[0].variante}</div>}
                    <div className="text-sm font-medium tabular-nums">{reais(g.pecas[0].preco)}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" className="mr-auto -ml-2 text-muted-foreground" onClick={() => setEditando(g.pecas[0])}>
                      <Pencil /> Editar
                    </Button>
                    <Label htmlFor={`a-${g.pecas[0].id}`} className="text-xs">
                      Ativa
                    </Label>
                    <Switch id={`a-${g.pecas[0].id}`} checked={(g.pecas[0] as Peca).ativo} onCheckedChange={(ativo) => ativar.mutate({ id: g.pecas[0].id, ativo })} />
                  </div>
                </CardContent>
              </Card>
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
