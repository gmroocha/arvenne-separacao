import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { PackageOpen, RefreshCw, Search } from "lucide-react"
import LinhaPedido from "@/components/LinhaPedido"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ItemGroup } from "@/components/ui/item"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePedidosFase, useSincronizarShopify } from "@/lib/api"
import { digitos } from "@/lib/formato"
import { useAgora } from "@/lib/useAgora"
import { NOME_ETAPA, type StatusPedido } from "@/lib/status"

const ABAS: { id: string; nome: string; statuses: StatusPedido[] | null }[] = [
  { id: "todos", nome: "Todos", statuses: null },
  { id: "separacao", nome: "Separação", statuses: ["novo", "separacao"] },
  { id: "aguardando_cliente", nome: NOME_ETAPA.aguardando_cliente, statuses: ["aguardando_cliente"] },
  { id: "conferencia", nome: "Conferência", statuses: ["conferencia"] },
  { id: "faturamento", nome: "Nota/Bling/frete", statuses: ["faturamento"] },
  { id: "embalagem", nome: NOME_ETAPA.embalagem, statuses: ["embalagem"] },
  { id: "pronto_envio", nome: NOME_ETAPA.pronto_envio, statuses: ["pronto_envio"] },
]

export default function Expedicao() {
  const [params, setParams] = useSearchParams()
  const aba = params.get("etapa") ?? "todos"
  const soAtrasados = params.get("atrasados") === "1"
  const [busca, setBusca] = useState("")
  const { data, isLoading } = usePedidosFase("expedicao")
  const sincronizar = useSincronizarShopify()
  const agora = useAgora()

  const atualizar = (mudanca: Record<string, string | null>) => {
    const n = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) n.set(k, v)
      else n.delete(k)
    }
    setParams(n, { replace: true })
  }

  const atrasado = (prazo: string | null) => prazo !== null && new Date(prazo).getTime() < agora

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = digitos(busca)
    return (data ?? []).filter(
      (p) =>
        !t ||
        p.numero.toLowerCase().includes(t) ||
        (p.cliente_nome ?? "").toLowerCase().includes(t) ||
        (d.length >= 3 && digitos(p.cliente_telefone).includes(d)),
    )
  }, [data, busca])

  const dentro = (id: string) => {
    const a = ABAS.find((x) => x.id === id)!
    return filtrados.filter((p) => (a.statuses ? a.statuses.includes(p.status) : true))
  }
  const lista = dentro(aba).filter((p) => !soAtrasados || atrasado(p.prazo))
  const totalAtrasados = filtrados.filter((p) => atrasado(p.prazo)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Número, cliente ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </InputGroup>
        <Button variant={soAtrasados ? "destructive" : "outline"} onClick={() => atualizar({ atrasados: soAtrasados ? null : "1" })}>
          Atrasados <Badge variant={totalAtrasados ? "destructive" : "secondary"}>{totalAtrasados}</Badge>
        </Button>
        <Button variant="outline" onClick={() => sincronizar.mutate(undefined)} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? <Spinner /> : <RefreshCw />} Sincronizar
        </Button>
      </div>

      <Tabs value={aba} onValueChange={(v) => atualizar({ etapa: v === "todos" ? null : v })}>
        <ScrollArea className="w-full">
          <TabsList variant="line" className="w-max">
            {ABAS.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.nome}
                <Badge variant="secondary">{dentro(a.id).length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>Nenhum pedido nesta etapa</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {lista.map((p) => (
            <LinhaPedido key={p.id} p={p} />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
