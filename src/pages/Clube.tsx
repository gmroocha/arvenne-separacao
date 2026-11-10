import { useState } from "react"
import { Gem, Plus, Search } from "lucide-react"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAtivarPecaClube, usePecasClube } from "@/lib/api"
import { reais } from "@/lib/formato"

export default function Clube() {
  const [busca, setBusca] = useState("")
  const [novo, setNovo] = useState(false)
  const [inativas, setInativas] = useState(false)
  const { data } = usePecasClube(busca, inativas)
  const ativar = useAtivarPecaClube()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Buscar por código ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </InputGroup>
        <div className="flex items-center gap-2">
          <Switch id="inativas" checked={inativas} onCheckedChange={setInativas} />
          <Label htmlFor="inativas">Mostrar desativadas</Label>
        </div>
        <Button onClick={() => setNovo(true)}>
          <Plus /> Nova peça
        </Button>
      </div>

      {data?.length === 0 ? (
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
                  <div className="font-mono text-sm">{p.codigo}</div>
                  <div className="text-sm">{p.nome}</div>
                  {p.variante && <div className="text-sm font-medium">{p.variante}</div>}
                  <div className="text-sm text-muted-foreground">{reais(p.preco)}</div>
                </div>
                <div className="flex items-center justify-between">
                  {p.ativo ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="outline">Desativada</Badge>}
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`a-${p.id}`} className="text-xs">
                      Ativa
                    </Label>
                    <Switch id={`a-${p.id}`} checked={p.ativo} onCheckedChange={(ativo) => ativar.mutate({ id: p.id, ativo })} />
                  </div>
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
