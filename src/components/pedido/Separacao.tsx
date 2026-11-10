import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, BellRing, Check, Copy, HandCoins, MessageCircle, PackageX, Plus, Send, Trash2, TriangleAlert, Undo2 } from "lucide-react"
import Foto from "@/components/Foto"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useConcluirTroca, useMudarStatus, useTrocas, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { mensagemFaltaSimples, mensagemTroca } from "@/lib/agente"
import { etapaCompleta } from "@/lib/etapa"
import { fotoTamanho } from "@/lib/foto"
import { linkWhatsApp, reais } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import { textoSituacao, trocaAtiva, valorDaOpcao, valorPagoItem } from "@/lib/trocaTexto"
import type { Item, Troca } from "@/lib/tipos"
import LinhaPeca from "./LinhaPeca"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"
import TrocaDialog from "./TrocaDialog"

// Estado da troca de uma peça em falta: montar, aguardar a cliente ou fechar a escolha dela.
function EstadoTroca({ troca, aoAbrir, wa }: { troca: Troca | undefined; aoAbrir: () => void; wa: string | null }) {
  const concluir = useConcluirTroca()
  if (!troca || troca.status === "rascunho")
    return (
      <Button variant="outline" className="h-11 w-fit sm:h-8" onClick={aoAbrir}>
        <ArrowLeftRight /> {troca ? "Continuar troca" : "Montar troca"}
      </Button>
    )
  if (troca.status === "enviada")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Enviada há {tempoDesde(troca.enviada_em ?? troca.created_at)} · aguardando escolha
        </span>
        <Button variant="outline" className="h-11 sm:h-8" onClick={aoAbrir}>
          <Send /> Reenviar
        </Button>
      </div>
    )

  const opcao = troca.escolha_tipo === "opcao" ? troca.opcoes.find((o) => o.id === troca.escolha_opcao_id) : undefined
  const pago = valorPagoItem(troca)
  const fazer = (tipo: "opcao" | "credito") => concluir.mutate({ troca, tipo })
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2">
      {opcao ? (
        <div className="flex items-center gap-2">
          <Foto url={fotoTamanho(opcao.foto_url, 200)} alt={opcao.nome} ampliar className="size-12 shrink-0" />
          <div className="min-w-0 text-sm">
            <div className="font-medium text-emerald-700 dark:text-emerald-400">Cliente escolheu</div>
            <div className="truncate font-mono font-semibold">{opcao.sku ?? "sem código"}</div>
            <div className="truncate text-muted-foreground">
              {opcao.variante ?? opcao.nome} · {textoSituacao(valorDaOpcao(troca, opcao))}
            </div>
          </div>
        </div>
      ) : troca.escolha_tipo === "credito" ? (
        <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Prefere crédito de {reais(pago)}</div>
      ) : (
        <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Quer falar no WhatsApp</div>
      )}
      <div className="flex flex-wrap gap-2">
        {troca.escolha_tipo === "opcao" && (
          <Button className="h-11 sm:h-8" disabled={concluir.isPending} onClick={() => fazer("opcao")}>
            <Check /> Fazer a troca
          </Button>
        )}
        <Button variant={troca.escolha_tipo === "credito" ? "default" : "outline"} className="h-11 sm:h-8" disabled={concluir.isPending} onClick={() => fazer("credito")}>
          <HandCoins /> Dar crédito
        </Button>
        {troca.escolha_tipo === "whatsapp" && (
          <>
            <Button variant="outline" className="h-11 sm:h-8" onClick={aoAbrir}>
              <ArrowLeftRight /> Editar opções
            </Button>
            {wa && (
              <Button variant="outline" className="h-11 sm:h-8" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp da cliente
                </a>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

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
  const mudarStatus = useMudarStatus()
  const avisar = pedido.status === "avisar_cliente"
  const aguardando = pedido.status === "aguardando_cliente"
  const trocas = useTrocas(pedido.id)
  const [trocando, setTrocando] = useState<Item | null>(null)
  const trocaDe = (i: Item) => trocas.data?.find((t) => t.item_id === i.id && trocaAtiva(t))
  const comTroca = problemas.map((i) => ({ i, t: trocaDe(i) })).find((x) => x.t)

  // Mensagem para a cliente: com troca montada leva o link; sem troca, aviso simples.
  const textoCliente = () => {
    if (!comTroca?.t) return mensagemFaltaSimples(pedido, itens)
    const pago = valorPagoItem(comTroca.t)
    return mensagemTroca(pedido, comTroca.i, `${window.location.origin}/t/${comTroca.t.token}`, pago != null ? reais(pago) : null)
  }

  const marcar = (item: Item, status: Item["status"], observacao?: string | null) =>
    acao(item, observacao === undefined ? { status } : { status, observacao })

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Separação" feitas={achadas.length} total={vivas} unidade="peças" />

      {problemas.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {avisar ? <BellRing className="size-4 text-amber-600 dark:text-amber-400" /> : <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />}
              {avisar
                ? "Avise a cliente"
                : aguardando
                  ? `Aguardando resposta da cliente · avisada há ${tempoDesde(pedido.status_desde)}`
                  : "Problemas"}{" "}
              ({problemas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {problemas.map((i) => (
              <div key={i.id} className="flex flex-col gap-2">
                <LinhaPeca item={i} compacta>
                  <Badge variant="outline" className="border-amber-500/40 text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {i.status === "falta" ? <PackageX /> : <TriangleAlert />}
                    {i.status === "falta" ? "Em falta" : "Defeito"}
                  </Badge>
                  <MenuPeca
                    rotulo="Resolver"
                    itens={[
                      { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                      { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(i, "removido", "cliente desistiu") },
                      { rotulo: "Voltar a pendente", icone: Undo2, aoClicar: () => marcar(i, "pendente", null) },
                    ]}
                  />
                </LinhaPeca>
                {i.status === "falta" && <EstadoTroca troca={trocaDe(i)} aoAbrir={() => setTrocando(i)} wa={wa} />}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {avisar && (
                <Button
                  className="h-11 sm:h-8"
                  onClick={() => {
                    mudarStatus.mutate({ pedidoId: pedido.id, para: "aguardando_cliente", silencioso: true })
                    toast.success("Aguardando resposta da cliente")
                  }}
                >
                  <Check /> Cliente avisada
                </Button>
              )}
              <Button
                variant="outline"
                className="h-11 sm:h-8"
                onClick={() =>
                  navigator.clipboard
                    .writeText(textoCliente())
                    .then(() => toast.success("Mensagem copiada"), () => toast.error("Não foi possível copiar"))
                }
              >
                <Copy /> Copiar mensagem
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

      {trocando && (
        <TrocaDialog
          key={trocando.id}
          aberto
          aoMudar={(a) => {
            if (!a) setTrocando(null)
          }}
          pedido={pedido}
          item={trocando}
        />
      )}

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta(pedido.status, itens)} onClick={aoConcluir}>
        Concluir separação
      </Button>
    </div>
  )
}
