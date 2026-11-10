import { toast } from "sonner"
import { ArrowLeftRight, Check, Copy, MessageCircle, PackageX, Plus, Trash2, TriangleAlert, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { textoParaAgente } from "@/lib/agente"
import { etapaCompleta } from "@/lib/etapa"
import { linkWhatsApp } from "@/lib/formato"
import { NOME_ITEM } from "@/lib/status"
import type { Item } from "@/lib/tipos"
import LinhaPeca from "./LinhaPeca"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = {
  pedido: PedidoDetalhe
  acao: AcaoItem
  aoTrocar: (item: Item) => void
  aoAdicionar: () => void
  aoConcluir: () => void
}

export default function Separacao({ pedido, acao, aoTrocar, aoAdicionar, aoConcluir }: Props) {
  const itens = pedido.pedido_itens
  const pendentes = itens.filter((i) => i.status === "pendente")
  const achadas = itens.filter((i) => i.status === "encontrado")
  const problemas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
  const removidas = itens.filter((i) => i.status === "removido")
  const vivas = itens.length - removidas.length
  const wa = linkWhatsApp(pedido.cliente_telefone, "")

  const marcar = (item: Item, status: Item["status"], observacao?: string | null) =>
    acao(item, observacao === undefined ? { status } : { status, observacao })

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Separação" feitas={achadas.length} total={vivas} unidade="peças" />

      {problemas.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" /> Problemas ({problemas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {problemas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta>
                <Badge variant="outline">{NOME_ITEM[i.status]}</Badge>
                <MenuPeca
                  rotulo="Resolver"
                  itens={[
                    { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                    { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(i, "removido", "cliente desistiu") },
                    { rotulo: "Voltar a pendente", icone: Undo2, aoClicar: () => marcar(i, "pendente", null) },
                  ]}
                />
              </LinhaPeca>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-11 sm:h-8"
                onClick={() =>
                  navigator.clipboard
                    .writeText(textoParaAgente(pedido, itens))
                    .then(() => toast.success("Mensagem copiada"), () => toast.error("Não foi possível copiar"))
                }
              >
                <Copy /> Copiar mensagem para a cliente
              </Button>
              {wa && (
                <Button variant="outline" className="h-11 sm:h-8" asChild>
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp da cliente
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-2" aria-label="A encontrar">
        <h3 className="text-sm font-semibold">A encontrar ({pendentes.length})</h3>
        {pendentes.length === 0 ? (
          <Vazio>{itens.length === 0 ? "Este pedido ainda não tem peças." : "Nenhuma peça pendente."}</Vazio>
        ) : (
          <GradePecas>
            {pendentes.map((i) => (
              <TilePeca key={i.id} item={i}>
                <Button className="h-11 flex-1 text-base" onClick={() => acao(i, { status: "encontrado" })}>
                  <Check /> Achei
                </Button>
                <MenuPeca
                  itens={[
                    { rotulo: "Falta", icone: PackageX, aoClicar: () => marcar(i, "falta") },
                    { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                    { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(i, "removido", "cliente desistiu") },
                  ]}
                />
              </TilePeca>
            ))}
          </GradePecas>
        )}
        <Button variant="outline" className="h-11 w-fit sm:h-8" onClick={aoAdicionar}>
          <Plus /> Adicionar peça
        </Button>
      </section>

      <FaixaFeitas titulo="Encontradas" itens={achadas} aoDesfazer={(i) => marcar(i, "pendente")} />

      {removidas.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 h-9 text-muted-foreground">
              Removidas ({removidas.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pt-1">
            {removidas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta esmaecida>
                <Button variant="ghost" className="h-11" onClick={() => marcar(i, "pendente", null)}>
                  Restaurar
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta(pedido.status, itens)} onClick={aoConcluir}>
        Concluir separação
      </Button>
    </div>
  )
}
