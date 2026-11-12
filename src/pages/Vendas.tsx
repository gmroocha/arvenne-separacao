import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Plus, Receipt } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import LinhaPedido from "@/components/LinhaPedido"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ItemGroup } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebounce } from "@/lib/useDebounce"
import { LIMITE_LISTA, usePedidosFase } from "@/lib/api"
import { digitos } from "@/lib/formato"

export default function Vendas() {
  const [params, setParams] = useSearchParams()
  const aba = params.get("aba") === "aguardando" ? "aguardando_pagamento" : "em_aberto"
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca, 300)
  const { data, isLoading } = usePedidosFase("venda", termo)

  const filtradas = useMemo(() => {
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
  const da = (status: string) => filtradas.filter((p) => p.status === status)
  const lista = da(aba)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca className="min-w-48 flex-1" valor={busca} aoMudar={setBusca} placeholder="Número, cliente ou telefone" />
        <Button asChild size="toque">
          <Link to="/vendas/nova">
            <Plus /> Nova venda
          </Link>
        </Button>
      </div>

      <Tabs value={aba} onValueChange={(v) => setParams(v === "em_aberto" ? {} : { aba: "aguardando" }, { replace: true })}>
        <TabsList variant="line" className="max-w-full overflow-x-auto sem-barra justify-start">
          <TabsTrigger value="em_aberto">
            Em aberto <Badge variant="secondary">{da("em_aberto").length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="aguardando_pagamento">
            Aguardando pagamento <Badge variant="secondary">{da("aguardando_pagamento").length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {(data?.length ?? 0) >= LIMITE_LISTA && (
        <p className="text-xs text-muted-foreground">Mostrando as {LIMITE_LISTA} vendas mais recentes: pode haver mais. Use a busca.</p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>Nenhuma venda aqui</EmptyTitle>
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
