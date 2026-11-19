import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { CheckCheck, ExternalLink, ListChecks, MoreHorizontal, PackageCheck, Undo2 } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Vazio } from "@/components/comum/Vazio"
import DetalheConcluido from "@/components/concluidos/DetalheConcluido"
import MenuAcoes from "@/components/MenuAcoes"
import { useReabrirConcluido } from "@/components/pedido/useReabrirConcluido"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LIMITE_LISTA, useAtualizarPedido, useConcluidos, type PedidoConcluido } from "@/lib/api"
import { tempoDesde } from "@/lib/status"
import { useDebounce } from "@/lib/useDebounce"

type Aba = "caminho" | "entregues"
const ABAS: { id: Aba; nome: string }[] = [
  { id: "caminho", nome: "A caminho" },
  { id: "entregues", nome: "Entregues" },
]

// Cada pedido cai numa aba só. O rastreio à cliente (WhatsApp) é enviado antes, na etapa "Enviar rastreio" da Expedição.
const abaDe = (p: PedidoConcluido): Aba => (p.entregue_em ? "entregues" : "caminho")

function Cartao({ p, aba }: { p: PedidoConcluido; aba: Aba }) {
  const atualizar = useAtualizarPedido()
  const reabrir = useReabrirConcluido({ id: p.id, origem: p.origem, status: "enviado" }) // só gestor
  const [detalhe, setDetalhe] = useState(false)
  const gravar = (campos: Parameters<typeof atualizar.mutate>[0]["campos"]) => atualizar.mutate({ pedidoId: p.id, campos })
  const local = [p.entrega_cidade, p.entrega_uf].filter(Boolean).join("/")
  const quando = aba === "entregues" && p.entregue_em ? `entregue há ${tempoDesde(p.entregue_em)}` : `postado há ${tempoDesde(p.postado_em ?? p.status_desde)}`
  return (
    <li>
      {/* Tocar na linha abre o detalhe; links, botões e menus continuam com a própria ação (o menu também tem "Ver detalhes"). */}
      <Item
        variant="outline"
        className="cursor-pointer gap-3"
        onClick={(e) => {
          if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest("a, button")) return
          setDetalhe(true)
        }}
      >
        <ItemContent className="min-w-0 flex-1 basis-56">
          <ItemTitle className="min-w-0">
            <Link to={`/pedidos/${p.id}`} className="truncate underline-offset-4 hover:underline">
              {p.cliente_nome ?? "Sem nome"}
            </Link>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tabular-nums">{p.numero.replace(/^#/, "")}</span>
            <span aria-hidden>·</span>
            <OrigemBadge origem={p.origem} />
            {local && (
              <>
                <span aria-hidden>·</span>
                <span>{local}</span>
              </>
            )}
          </ItemDescription>
          <ItemDescription className="text-xs">{quando}</ItemDescription>
        </ItemContent>
        <ItemActions className="w-full gap-2 sm:w-auto">
          {p.rastreio_url && (
            <Button variant="outline" size="toque" className="min-w-0 flex-1 sm:flex-none" asChild>
              <a href={p.rastreio_url} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir rastreio
              </a>
            </Button>
          )}
          {aba === "caminho" && (
            <Button size="toque" className="min-w-0 flex-1 sm:flex-none" disabled={atualizar.isPending} onClick={() => gravar({ entregue_em: new Date().toISOString() })}>
              <PackageCheck /> Marcar entregue
            </Button>
          )}
          <MenuAcoes
            titulo="Ações do pedido"
            grupos={[
              { itens: [{ rotulo: "Ver detalhes", icone: ListChecks, aoClicar: () => setDetalhe(true) }] },
              ...(aba === "entregues"
                ? [{ itens: [{ rotulo: "Desfazer entrega", icone: Undo2, desabilitado: atualizar.isPending, aoClicar: () => gravar({ entregue_em: null }) }] }]
                : []),
              reabrir.grupo,
            ]}
            gatilho={
              <Button variant="outline" size="icon-toque" aria-label="Mais ações" className="ml-auto shrink-0">
                <MoreHorizontal />
              </Button>
            }
          />
        </ItemActions>
      </Item>
      {reabrir.dialogo}
      <DetalheConcluido p={p} aberto={detalhe} aoMudar={setDetalhe} />
    </li>
  )
}

// Pedidos que já saíram: acompanhar o que está a caminho e marcar o que chegou.
export default function Concluidos() {
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca, 300)
  const { data, isLoading, isError, isFetching, refetch } = useConcluidos(termo)
  const aba = ABAS.some((a) => a.id === params.get("aba")) ? (params.get("aba") as Aba) : "caminho"
  const porAba = useMemo(() => {
    const r: Record<Aba, PedidoConcluido[]> = { caminho: [], entregues: [] }
    for (const p of data ?? []) r[abaDe(p)].push(p)
    return r
  }, [data])
  const lista = porAba[aba]

  return (
    <div className="flex flex-col gap-4">
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número, cliente ou telefone" />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList>
          {ABAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id}>
              {a.nome} ({porAba[a.id].length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {(data?.length ?? 0) >= LIMITE_LISTA && <p className="text-xs text-muted-foreground">Mostrando os {LIMITE_LISTA} mais recentes. Use a busca para achar os outros.</p>}
      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : lista.length === 0 ? (
        <Vazio icone={CheckCheck} titulo={aba === "caminho" ? "Nada a caminho" : "Nenhum pedido entregue ainda"} />
      ) : (
        <ItemGroup className="gap-3">
          {lista.map((p) => (
            <Cartao key={p.id} p={p} aba={aba} />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
