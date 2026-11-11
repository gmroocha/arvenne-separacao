import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, BellRing, Check, Copy, HandCoins, MessageCircle, PackageX, Plus, Send, Trash2, TriangleAlert, Undo2 } from "lucide-react"
import Foto from "@/components/Foto"
import { COR_SELO } from "@/lib/selo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useConcluirTroca, useMudarStatus, useTroca, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { mensagemFaltaSimples, mensagemTroca } from "@/lib/agente"
import { etapaCompleta } from "@/lib/etapa"
import { fotoTamanho } from "@/lib/foto"
import { linkWhatsApp, reais } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import { textoSituacao, valorDaOpcao, valorPagoPeca } from "@/lib/trocaTexto"
import type { Item, Troca, TrocaPeca } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import LinhaPeca from "./LinhaPeca"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"
import TrocaDialog from "./TrocaDialog"

const COR_TITULO = { avisar_cliente: "text-destructive", aguardando_cliente: "text-amber-700 dark:text-amber-300" } as const

// Estado da troca de UMA peça em falta: aguardar a cliente ou fechar a escolha dela.
function EstadoTroca({ troca, peca, aoAbrir, wa }: { troca: Troca | undefined; peca: TrocaPeca | undefined; aoAbrir: () => void; wa: string | null }) {
  const concluir = useConcluirTroca()
  // Sem troca ou em rascunho: o botão "Montar troca" fica na linha de ações do cartão.
  if (!troca || !peca || troca.status === "rascunho") return null
  if (!peca.escolha_tipo)
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Troca enviada há {tempoDesde(troca.enviada_em ?? troca.created_at)} · aguardando escolha desta peça</span>
        <Button variant="ghost" size="sm" className="h-8" onClick={aoAbrir}>
          <Send /> Reenviar
        </Button>
      </div>
    )

  const opcao = peca.escolha_tipo === "opcao" ? peca.opcoes.find((o) => o.id === peca.escolha_opcao_id) : undefined
  const pago = valorPagoPeca(peca)
  const fazer = (tipo: "opcao" | "credito") => concluir.mutate({ troca, peca, tipo })
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-emerald-500/10 p-2">
      {opcao ? (
        <div className="flex items-center gap-2">
          <Foto url={fotoTamanho(opcao.foto_url, 200)} alt={opcao.nome} ampliar className="size-12 shrink-0" />
          <div className="min-w-0 text-sm">
            <div className="font-medium text-emerald-700 dark:text-emerald-400">Cliente escolheu</div>
            <div className="truncate font-mono font-semibold">{opcao.sku ?? "sem código"}</div>
            <div className="truncate text-muted-foreground">
              {opcao.variante ?? opcao.nome} · {textoSituacao(valorDaOpcao(peca, opcao))}
            </div>
          </div>
        </div>
      ) : peca.escolha_tipo === "credito" ? (
        <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Prefere crédito de {reais(pago)}</div>
      ) : (
        <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Quer falar no WhatsApp</div>
      )}
      <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap">
        {peca.escolha_tipo === "opcao" && (
          <Button className="h-10 text-sm" disabled={concluir.isPending} onClick={() => fazer("opcao")}>
            <Check /> Fazer a troca
          </Button>
        )}
        <Button variant={peca.escolha_tipo === "credito" ? "default" : "secondary"} className="h-10 text-sm" disabled={concluir.isPending} onClick={() => fazer("credito")}>
          <HandCoins /> Dar crédito
        </Button>
        {peca.escolha_tipo === "whatsapp" && (
          <>
            <Button variant="secondary" className="h-10 text-sm" onClick={aoAbrir}>
              <ArrowLeftRight /> Editar opções
            </Button>
            {wa && (
              <Button variant="secondary" className="h-10 text-sm" asChild>
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
  const aguardando = pedido.status === "aguardando_cliente"
  // Com peça em problema e a cliente ainda não avisada, o cartão já nasce vermelho: não espera o status
  // do pedido mudar (a troca de status vem depois da marcação na tela e fazia o cartão piscar).
  const avisar = problemas.length > 0 && !aguardando
  const trocaQ = useTroca(pedido.id)
  const troca = trocaQ.data ?? undefined
  const [trocando, setTrocando] = useState<string | null>(null)
  const pecaDe = (i: Item) => troca?.pecas.find((p) => p.item_id === i.id && !p.concluida_em)
  // "Montar troca" leva TODAS as peças em falta do pedido (uma troca, um link). Defeito conta como falta.
  const faltas = problemas
  const emRascunho = !troca || troca.status === "rascunho"

  // Mensagem para a cliente: com troca montada leva o link; sem troca, aviso simples.
  const textoCliente = () => {
    const naTroca = faltas.filter((i) => pecaDe(i))
    if (!troca || troca.status === "rascunho" || naTroca.length === 0) return mensagemFaltaSimples(pedido, itens)
    return mensagemTroca(pedido, naTroca, `${window.location.origin}/t/${troca.token}`, troca.resumo ? reais(troca.resumo.total_pago) : null)
  }

  const marcar = (item: Item, status: Item["status"], observacao?: string | null) =>
    acao(item, observacao === undefined ? { status } : { status, observacao })

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Separação" feitas={achadas.length} total={vivas} unidade="peças" />

      {problemas.length > 0 && (
        <Card
          size="sm"
          className={cn(
            avisar && "bg-destructive/5 ring-destructive/20",
            aguardando && "bg-amber-500/5 ring-amber-500/20",
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {avisar ? <BellRing className={cn("size-4", COR_TITULO.avisar_cliente)} /> : <TriangleAlert className={cn("size-4", aguardando ? COR_TITULO.aguardando_cliente : "text-muted-foreground")} />}
              <span className="min-w-0 flex-1">
                {avisar
                  ? "Avise a cliente"
                  : aguardando
                    ? `Aguardando resposta da cliente · avisada há ${tempoDesde(pedido.status_desde)}`
                    : "Problemas"}
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {problemas.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {problemas.map((i) => (
              <div key={i.id} className="flex flex-col gap-2">
                <LinhaPeca item={i} compacta>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-6 border-transparent px-2 text-xs font-medium [&>svg]:size-3.5",
                      avisar ? COR_SELO.avisar_cliente : aguardando ? COR_SELO.aguardando_cliente : "",
                    )}
                  >
                    <PackageX />
                    Em falta
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
                <EstadoTroca troca={troca} peca={pecaDe(i)} aoAbrir={() => setTrocando(i.id)} wa={wa} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap">
              {faltas.length > 0 && (
                <Button variant={emRascunho ? "default" : "secondary"} className="h-10 text-sm" onClick={() => setTrocando(faltas[0].id)}>
                  <ArrowLeftRight /> {emRascunho ? (troca ? "Continuar troca" : "Montar troca") : "Editar troca"}
                </Button>
              )}
              {avisar && (
                <Button
                  variant={faltas.length > 0 ? "secondary" : "default"}
                  className="h-10 text-sm"
                  onClick={() => {
                    mudarStatus.mutate({ pedidoId: pedido.id, para: "aguardando_cliente", silencioso: true })
                    toast.success("Aguardando resposta da cliente")
                  }}
                >
                  <Check /> Cliente avisada
                </Button>
              )}
              <Button
                variant="secondary"
                className="h-10 text-sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(textoCliente())
                    .then(() => toast.success("Mensagem copiada"), () => toast.error("Não foi possível copiar"))
                }
              >
                <Copy /> Copiar mensagem
              </Button>
              {wa && (
                <Button variant="secondary" className="h-10 text-sm" asChild>
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp
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
                <Button className="h-10 flex-1 text-sm" onClick={() => acao(i, { status: "encontrado" })}>
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

      {/* Sempre montado: desmontar uma gaveta aberta (vaul) pode deixar a rolagem da página travada. */}
      <TrocaDialog
        aberto={!!trocando && faltas.length > 0}
        aoMudar={(a) => {
          if (!a) setTrocando(null)
        }}
        pedido={pedido}
        itens={faltas}
        inicial={trocando ?? undefined}
      />

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta(pedido.status, itens)} onClick={aoConcluir}>
        Concluir separação
      </Button>
    </div>
  )
}
