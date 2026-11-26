import { useState } from "react"
import { Link } from "react-router"
import { Send, TriangleAlert } from "lucide-react"
import MontarPedidoLr, { type LinhaInicial } from "@/components/bling/MontarPedidoLr"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSouGestor } from "@/lib/api"
import { useBlingPedidos, useBlingSituacao } from "@/lib/bling"
import { quando } from "@/lib/formato"

// Passo "Pedido de venda LR": gera o pedido direto no Bling da LR, já com as peças do pedido. O fluxo manual
// (copiar SKUs, digitar o nº) continua logo abaixo, igual. Sem o Bling conectado (ou sem a migration), só avisa.
export default function GerarNoBling({ pedidoId, linhas }: { pedidoId: string; linhas: LinhaInicial[] }) {
  const situacao = useBlingSituacao()
  const gerados = useBlingPedidos(pedidoId, 1)
  const gestor = useSouGestor() === true
  const mobile = useIsMobile()
  const [aberto, setAberto] = useState(false)
  if (!situacao.data || situacao.data.semBanco) return null
  const { conectado, contatoDefinido } = situacao.data
  if (!conectado || !contatoDefinido)
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        <TriangleAlert className="size-4 shrink-0" />
        {conectado ? "Falta escolher o cliente Arvenne no Bling." : "Bling não conectado."}
        {gestor && (
          <Link to="/pdv-lr" className="font-medium text-foreground underline underline-offset-4">Abrir PDV LR</Link>
        )}
      </p>
    )
  const ultimo = gerados.data?.[0]
  return (
    <div className="flex flex-col gap-2">
      {ultimo && (
        <p className="text-sm text-muted-foreground" aria-label="Pedido gerado no Bling">
          Gerado no Bling: nº {ultimo.bling_numero ?? ultimo.bling_id} em {quando(ultimo.criado_em)}
        </p>
      )}
      <Button size="toque" className="w-full sm:w-fit" onClick={() => setAberto(true)}>
        <Send /> Gerar no Bling
      </Button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side={mobile ? "bottom" : "right"} className="max-md:h-[92svh] data-[side=right]:sm:max-w-xl">
          <SheetHeader className="pr-12">
            <SheetTitle>Gerar pedido no Bling</SheetTitle>
            <SheetDescription>Pedido de venda da LR. Confira os códigos e os preços antes de gerar.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <MontarPedidoLr pedidoId={pedidoId} inicial={linhas} aoGerar={() => setAberto(false)} fixarAcoes />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
