import { useState } from "react"
import { Gem, Plus } from "lucide-react"
import { CampoBusca } from "@/components/comum/CampoBusca"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAtivarPecaClube, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"

export default function Clube() {
  const [busca, setBusca] = useState("")
  const [novo, setNovo] = useState(false)
  const [inativas, setInativas] = useState(false)
  const { data, isLoading } = usePecasClube(busca, inativas)
  const ativar = useAtivarPecaClube()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca className="min-w-48 flex-1" valor={busca} aoMudar={setBusca} placeholder="Buscar por código ou nome" />
        <div className="flex items-center gap-2">
          <Switch id="inativas" checked={inativas} onCheckedChange={setInativas} />
          <Label htmlFor="inativas">Mostrar desativadas</Label>
        </div>
        <Button size="toque" onClick={() => setNovo(true)}>
          <Plus /> Nova peça
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Gem />
            </EmptyMedia>
            <EmptyTitle>Nenhuma peça do Clube</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => (
            <Card key={p.id} className={p.ativo ? "" : "opacity-50"}>
              <CardContent className="flex flex-col gap-3">
                <Foto url={p.foto_url} alt={p.nome} ampliar />
                <div>
                  <div className="font-mono text-sm font-semibold">{p.codigo}</div>
                  <div className="text-sm">{p.nome}</div>
                  {p.variante && <div className="text-sm font-medium">{p.variante}</div>}
                  <div className="text-sm font-medium tabular-nums">{reais(p.preco)}</div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Label htmlFor={`a-${p.id}`} className="text-xs">
                    Ativa
                  </Label>
                  <Switch id={`a-${p.id}`} checked={p.ativo} onCheckedChange={(ativo) => ativar.mutate({ id: p.id, ativo })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RespDialog aberto={novo} aoMudar={setNovo} titulo="Nova peça do Clube" largo>
        <PecaClubeForm aoSalvar={() => setNovo(false)} />
      </RespDialog>
    </div>
  )
}
