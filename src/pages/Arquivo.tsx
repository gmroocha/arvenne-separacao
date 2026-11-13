import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { useState } from "react"
import { Archive } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import LinhaPedido from "@/components/LinhaPedido"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ItemGroup } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { useArquivo } from "@/lib/api"
import { useDebounce } from "@/lib/useDebounce"

const PASSO = 50

// Pedidos enviados, cancelados e vendas perdidas. Nunca somem: a busca olha tudo.
export default function Arquivo() {
  const [busca, setBusca] = useState("")
  const [limite, setLimite] = useState(PASSO)
  const termo = useDebounce(busca, 300)
  const { data, isLoading, isError, isFetching, refetch } = useArquivo(termo, limite)

  return (
    <div className="flex flex-col gap-4">
      <CampoBusca
        valor={busca}
        aoMudar={(v) => {
          setBusca(v)
          setLimite(PASSO)
        }}
        placeholder="Número, cliente ou telefone"
      />
      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] w-full" />
          ))}
        </div>
      ) : isError && !data ? null : !data || data.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Archive />
            </EmptyMedia>
            <EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ItemGroup className="gap-2">
            {data.map((p) => (
              <LinhaPedido key={p.id} p={p} />
            ))}
          </ItemGroup>
          {data.length >= limite && (
            <Button variant="outline" size="toque" className="w-fit self-center" onClick={() => setLimite(limite + PASSO)}>
              Carregar mais
            </Button>
          )}
        </>
      )}
    </div>
  )
}
