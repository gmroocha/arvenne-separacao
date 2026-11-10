import { useState } from "react"
import { toast } from "sonner"
import { Check, ChevronDown, MessageCircle, MoreHorizontal, Plus, TriangleAlert, Undo2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { useAcaoItem, type PedidoDetalhe } from "@/lib/api"
import { textoParaAgente } from "@/lib/agente"
import { linkWhatsApp } from "@/lib/formato"
import { NOME_ITEM } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import LinhaPeca from "./LinhaPeca"

type Props = {
  pedido: PedidoDetalhe
  aoTrocar: (item: Item) => void
  aoAdicionar: () => void
}

function MenuPeca({ children, rotulo = "Mais opções" }: { children: React.ReactNode; rotulo?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={rotulo} className="size-11 sm:size-8">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function Separacao({ pedido, aoTrocar, aoAdicionar }: Props) {
  const acao = useAcaoItem(pedido)
  const [saindo, setSaindo] = useState<Set<string>>(new Set())

  const itens = pedido.pedido_itens
  const pendentes = itens.filter((i) => i.status === "pendente")
  const achadas = itens.filter((i) => i.status === "encontrado")
  const problemas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
  const removidas = itens.filter((i) => i.status === "removido")
  const wa = linkWhatsApp(pedido.cliente_telefone, "")

  const marcar = (item: Item, para: Item["status"], observacao?: string | null) => acao.mutate({ item, para, observacao })

  const achei = (item: Item) => {
    setSaindo((s) => new Set(s).add(item.id))
    setTimeout(() => {
      acao.mutate(
        { item, para: "encontrado" },
        {
          onSettled: () =>
            setSaindo((s) => {
              const n = new Set(s)
              n.delete(item.id)
              return n
            }),
        },
      )
    }, 180)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Separação</span>
          <span className="text-sm tabular-nums text-muted-foreground">
            {pedido.qtd_encontradas} de {pedido.qtd_linhas}
          </span>
        </div>
        <Progress value={pedido.qtd_linhas ? (pedido.qtd_encontradas / pedido.qtd_linhas) * 100 : 0} />
      </div>

      {problemas.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            Problemas ({problemas.length})
          </AlertTitle>
          <AlertDescription className="mt-2 flex flex-col gap-2">
            {problemas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta>
                <span className="text-xs text-destructive">{NOME_ITEM[i.status]}</span>
                <MenuPeca rotulo="Resolver">
                  <DropdownMenuItem onClick={() => aoTrocar(i)}>Trocar por outra peça</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => marcar(i, "removido", "cliente desistiu")}>Remover (cliente desistiu)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => marcar(i, "pendente", null)}>Voltar a pendente</DropdownMenuItem>
                </MenuPeca>
              </LinhaPeca>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(textoParaAgente(pedido, itens))
                    .then(() => toast.success("Mensagem copiada"), () => toast.error("Não foi possível copiar"))
                }
              >
                Copiar mensagem para a cliente
              </Button>
              {wa && (
                <Button variant="outline" size="sm" asChild>
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp da cliente
                  </a>
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2" aria-label="A encontrar">
        <h3 className="text-sm font-semibold">A encontrar ({pendentes.length})</h3>
        {pendentes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {itens.length === 0 ? "Este pedido ainda não tem peças." : "Nenhuma peça pendente."}
          </p>
        ) : (
          pendentes.map((i) => (
            <LinhaPeca key={i.id} item={i} saindo={saindo.has(i.id)}>
              <Button className="h-11 px-5 text-base" onClick={() => achei(i)} disabled={saindo.has(i.id)}>
                <Check /> Achei
              </Button>
              <MenuPeca>
                <DropdownMenuItem onClick={() => marcar(i, "falta")}>Falta</DropdownMenuItem>
                <DropdownMenuItem onClick={() => marcar(i, "defeito")}>Defeito</DropdownMenuItem>
                <DropdownMenuItem onClick={() => aoTrocar(i)}>Trocar por outra peça</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => marcar(i, "removido", "cliente desistiu")}>
                  Remover (cliente desistiu)
                </DropdownMenuItem>
              </MenuPeca>
            </LinhaPeca>
          ))
        )}
        <Button variant="outline" className="w-fit" onClick={aoAdicionar}>
          <Plus /> Adicionar peça
        </Button>
      </section>

      {achadas.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              Encontradas ({achadas.length}) <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pt-1">
            {achadas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta esmaecida entrando>
                <Button variant="ghost" size="sm" onClick={() => marcar(i, "pendente")}>
                  <Undo2 /> Desfazer
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {removidas.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
              Removidas ({removidas.length}) <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pt-1">
            {removidas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta esmaecida>
                <Button variant="ghost" size="sm" onClick={() => marcar(i, "pendente", null)}>
                  Restaurar
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}
