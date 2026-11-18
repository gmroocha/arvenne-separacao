import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { CheckCheck, ExternalLink, MessageCircle, PackageCheck, Send, Undo2 } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Vazio } from "@/components/comum/Vazio"
import { OrigemBadge } from "@/components/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LIMITE_LISTA, useAtualizarPedido, useConcluidos, type PedidoConcluido } from "@/lib/api"
import { textoRastreio } from "@/lib/agente"
import { linkWhatsApp, quando } from "@/lib/formato"
import { useDebounce } from "@/lib/useDebounce"

type Aba = "rastreio" | "caminho" | "entregues"
const ABAS: { id: Aba; nome: string }[] = [
  { id: "rastreio", nome: "Enviar rastreio" },
  { id: "caminho", nome: "A caminho" },
  { id: "entregues", nome: "Entregues" },
]

// Cada pedido cai numa aba só. Pedido da Shopify não precisa de mensagem: a loja avisa a cliente.
const pendenteDeRastreio = (p: PedidoConcluido) => p.origem !== "shopify" && !p.rastreio_enviado_em
function abaDe(p: PedidoConcluido): Aba {
  if (p.entregue_em) return "entregues"
  return pendenteDeRastreio(p) ? "rastreio" : "caminho"
}

function Cartao({ p, aba }: { p: PedidoConcluido; aba: Aba }) {
  const atualizar = useAtualizarPedido()
  const gravar = (campos: Parameters<typeof atualizar.mutate>[0]["campos"]) => atualizar.mutate({ pedidoId: p.id, campos })
  const link = p.rastreio_url ?? p.rastreio
  const wa = link ? linkWhatsApp(p.cliente_telefone, textoRastreio(p)) : null
  const agora = () => new Date().toISOString()
  return (
    <li>
      <Item variant="outline" className="flex-col items-stretch">
        <ItemContent>
          <ItemTitle className="min-w-0">
            <Link to={`/pedidos/${p.id}`} className="truncate underline-offset-4 hover:underline">
              {p.cliente_nome ?? "Sem nome"}
            </Link>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tabular-nums">{p.numero.replace(/^#/, "")}</span>
            <OrigemBadge origem={p.origem} />
            <span>{p.postado_em ? `postado ${quando(p.postado_em)}` : `concluído ${quando(p.status_desde)}`}</span>
            {p.rastreio_enviado_em && p.origem !== "shopify" && <Badge variant="success">Rastreio enviado {quando(p.rastreio_enviado_em)}</Badge>}
            {p.entregue_em && <Badge variant="success">Entregue {quando(p.entregue_em)}</Badge>}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full flex-wrap justify-start gap-2">
          {aba === "rastreio" && (
            <>
              {wa ? (
                <Button variant="outline" size="toque" asChild>
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> Abrir WhatsApp com a mensagem
                  </a>
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {link ? "Sem telefone válido para o WhatsApp." : "Sem link de rastreio: cole no pedido."}{" "}
                  <Link to={`/pedidos/${p.id}`} className="underline underline-offset-4">Abrir pedido</Link>
                </span>
              )}
              <Button size="toque" disabled={atualizar.isPending} onClick={() => gravar({ rastreio_enviado_em: agora() })}>
                <Send /> Mensagem enviada
              </Button>
            </>
          )}
          {aba === "caminho" && (
            <>
              {p.rastreio_url && (
                <Button variant="outline" size="toque" asChild>
                  <a href={p.rastreio_url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Abrir rastreio
                  </a>
                </Button>
              )}
              <Button size="toque" disabled={atualizar.isPending} onClick={() => gravar({ entregue_em: agora() })}>
                <PackageCheck /> Marcar entregue
              </Button>
              {p.rastreio_enviado_em && p.origem !== "shopify" && (
                <Button variant="ghost" size="toque" disabled={atualizar.isPending} onClick={() => gravar({ rastreio_enviado_em: null })}>
                  <Undo2 /> Desfazer mensagem enviada
                </Button>
              )}
            </>
          )}
          {aba === "entregues" && (
            <Button variant="ghost" size="toque" disabled={atualizar.isPending} onClick={() => gravar({ entregue_em: null })}>
              <Undo2 /> Desfazer entrega
            </Button>
          )}
        </ItemActions>
      </Item>
    </li>
  )
}

// Pedidos que já saíram: enviar o rastreio à cliente (WhatsApp), acompanhar o que está a caminho e marcar o que chegou.
export default function Concluidos() {
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca, 300)
  const { data, isLoading, isError, isFetching, refetch } = useConcluidos(termo)
  const aba = ABAS.some((a) => a.id === params.get("aba")) ? (params.get("aba") as Aba) : "rastreio"
  const porAba = useMemo(() => {
    const r: Record<Aba, PedidoConcluido[]> = { rastreio: [], caminho: [], entregues: [] }
    for (const p of data ?? []) r[abaDe(p)].push(p)
    // Rastreio pendente: o mais antigo primeiro (quem espera há mais tempo).
    r.rastreio.reverse()
    return r
  }, [data])
  const lista = porAba[aba]

  return (
    <div className="flex flex-col gap-4">
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número, cliente ou telefone" />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList className="grid h-auto w-full grid-cols-3">
          {ABAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="h-auto min-w-0 flex-col gap-1 px-1.5 py-1.5 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              {a.nome}
              <Badge variant={a.id === "rastreio" && porAba.rastreio.length > 0 ? "default" : "secondary"} className="tabular-nums">
                {porAba[a.id].length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {(data?.length ?? 0) >= LIMITE_LISTA && <p className="text-xs text-muted-foreground">Mostrando os {LIMITE_LISTA} mais recentes. Use a busca para achar os outros.</p>}
      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError && !data ? null : lista.length === 0 ? (
        <Vazio icone={CheckCheck} titulo={aba === "rastreio" ? "Nenhum rastreio para enviar" : aba === "caminho" ? "Nada a caminho" : "Nenhum pedido entregue ainda"}>
          {aba === "rastreio" ? "Os pedidos do WhatsApp que acabam de ser postados aparecem aqui." : undefined}
        </Vazio>
      ) : (
        <ItemGroup className="gap-2">
          {lista.map((p) => (
            <Cartao key={p.id} p={p} aba={aba} />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
