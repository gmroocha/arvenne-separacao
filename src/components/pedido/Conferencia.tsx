import { ChevronDown, Check, MoreHorizontal, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { useAcaoItem, useConferirItem, type PedidoDetalhe } from "@/lib/api"
import LinhaPeca from "./LinhaPeca"

// Mesma lista da separação, agora sobre "conferido_em": peça sem defeito e com etiqueta colocada.
export default function Conferencia({ pedido }: { pedido: PedidoDetalhe }) {
  const conferir = useConferirItem(pedido)
  const acao = useAcaoItem(pedido)
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aConferir = achadas.filter((i) => !i.conferido_em)
  const conferidas = achadas.filter((i) => i.conferido_em)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Conferência e etiquetas</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {pedido.qtd_conferidas} de {pedido.qtd_encontradas}
          </span>
        </div>
        <Progress value={pedido.qtd_encontradas ? (pedido.qtd_conferidas / pedido.qtd_encontradas) * 100 : 0} />
        <p className="text-sm text-muted-foreground">Confira se a peça está sem defeito e com a etiqueta colocada.</p>
      </div>

      <section className="flex flex-col gap-2" aria-label="A conferir">
        <h3 className="text-sm font-semibold">A conferir ({aConferir.length})</h3>
        {aConferir.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhuma peça a conferir.</p>
        ) : (
          aConferir.map((i) => (
            <LinhaPeca key={i.id} item={i}>
              <Button className="h-11 px-5 text-base" onClick={() => conferir.mutate({ item: i, conferido: true })}>
                <Check /> Conferida
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais opções" className="size-11 sm:size-8">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={() => acao.mutate({ item: i, para: "defeito" })}>
                    Defeito (voltar para Problemas)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </LinhaPeca>
          ))
        )}
      </section>

      {conferidas.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              Conferidas ({conferidas.length}) <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pt-1">
            {conferidas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta esmaecida entrando>
                <Button variant="ghost" size="sm" onClick={() => conferir.mutate({ item: i, conferido: false })}>
                  <Undo2 /> Desfazer
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
