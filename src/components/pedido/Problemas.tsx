import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, BellRing, Check, Copy, HandCoins, Link2, MessageCircle, PackageX, Send, Trash2, TriangleAlert, Undo2 } from "lucide-react"
import { LinhaPeca as LinhaPecaComum } from "@/components/comum/Peca"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useConcluirTroca, useEnviarTroca, useMudarStatus, useTroca, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { mensagemFaltaSimples, mensagemTroca } from "@/lib/agente"
import { linkWhatsApp } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import type { Item, Troca, TrocaPeca } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import ConfirmarTroca from "./ConfirmarTroca"
import { listaEscolhida } from "@/lib/trocaTexto"
import LinhaPeca from "./LinhaPeca"
import { MenuPeca } from "./TilePeca"
import TrocaDialog from "./TrocaDialog"

// Estado da troca de UMA peça em falta: aguardar a cliente ou fechar a escolha dela.
function EstadoTroca({ troca, peca, item, aoAbrir, wa }: { troca: Troca | undefined; peca: TrocaPeca | undefined; item: Item; aoAbrir: () => void; wa: string | null }) {
  const concluir = useConcluirTroca()
  const [confirmar, setConfirmar] = useState<"opcao" | "credito" | null>(null)
  // Sem troca ou em rascunho: o botão "Montar troca" fica na linha de ações do cartão.
  if (!troca || !peca || troca.status === "rascunho") return null
  if (!peca.escolha_tipo)
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Troca enviada há {tempoDesde(troca.enviada_em ?? troca.created_at)} · aguardando escolha desta peça</span>
        <Button variant="ghost" size="toque" onClick={aoAbrir}>
          <Send /> Reenviar
        </Button>
      </div>
    )

  // Carrinho da cliente: todas as peças que ela escolheu (ou só a opção, em banco antigo).
  const lista = peca.escolha_tipo === "opcao" ? listaEscolhida(peca) : []
  const fazer = (tipo: "opcao" | "credito") => concluir.mutate({ troca, peca, tipo }, { onSuccess: () => setConfirmar(null) })
  return (
    // Celular: escolha em cima, botões embaixo lado a lado. PC: escolha à esquerda, botões à direita.
    <div className="flex flex-col gap-2 rounded-lg bg-success/10 p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {lista.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-sm font-medium text-success">Cliente escolheu</div>
          {lista.map(({ opcao: o, qtd }) => (
            <LinhaPecaComum key={o.id} item={{ ...o, qtd }} tamanho="sm" semBorda />
          ))}
        </div>
      ) : peca.escolha_tipo === "credito" ? (
        <div className="text-sm font-medium text-success">Prefere crédito</div>
      ) : (
        <div className="text-sm font-medium text-success">Quer falar no WhatsApp</div>
      )}
      <div className="grid shrink-0 grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap sm:justify-end">
        {peca.escolha_tipo === "opcao" && lista.length > 0 && (
          <Button size="bloco" disabled={concluir.isPending} onClick={() => setConfirmar("opcao")}>
            <Check /> Fazer a troca
          </Button>
        )}
        <Button variant={peca.escolha_tipo === "credito" ? "default" : "secondary"} size="bloco" disabled={concluir.isPending} onClick={() => setConfirmar("credito")}>
          <HandCoins /> Dar crédito
        </Button>
        {peca.escolha_tipo === "whatsapp" && (
          <>
            <Button variant="secondary" size="bloco" onClick={aoAbrir}>
              <ArrowLeftRight /> Editar opções
            </Button>
            {wa && (
              <Button variant="secondary" size="bloco" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp da cliente
                </a>
              </Button>
            )}
          </>
        )}
      </div>
      <ConfirmarTroca
        aberto={confirmar != null}
        aoMudar={(a) => !a && setConfirmar(null)}
        sai={item}
        peca={peca}
        entra={confirmar === "opcao" ? lista : []}
        pendente={concluir.isPending}
        aoConfirmar={() => confirmar && fazer(confirmar)}
      />
    </div>
  )
}

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoTrocar: (item: Item) => void }

// Peças em falta ou com defeito: avisar a cliente, montar a troca e copiar mensagem/link.
// Aparece na Separação e também na etapa em que a falta foi marcada (Conferência, Etiquetagem),
// para a pessoa não perder de vista as outras peças da etapa.
export default function Problemas({ pedido, acao, aoTrocar }: Props) {
  const itens = pedido.pedido_itens
  const problemas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
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

  const enviar = useEnviarTroca()
  const naTroca = faltas.filter((i) => pecaDe(i))
  const linkTroca = troca ? `${window.location.origin}/t/${troca.token}` : ""
  // Todas as peças ativas precisam de pelo menos uma opção para a cliente ver a troca.
  const trocaPronta = !!troca && naTroca.length > 0 && naTroca.length === faltas.length && naTroca.every((i) => (pecaDe(i)?.opcoes.length ?? 0) > 0)

  // Mensagem para a cliente: com troca montada leva o link; sem troca, aviso simples.
  const textoCliente = () => {
    if (!troca || naTroca.length === 0 || !trocaPronta) return mensagemFaltaSimples(pedido, itens)
    return mensagemTroca(pedido, naTroca, linkTroca)
  }

  // Copiar link/mensagem com troca pronta: a página da cliente só abre troca enviada, então marca como enviada.
  async function copiarComTroca(texto: string, aviso: string) {
    // O copiar começa antes do await, ainda no toque (o navegador exige).
    const copia = navigator.clipboard.writeText(texto).then(() => true, () => false)
    if (troca && trocaPronta && troca.status === "rascunho") {
      try {
        await enviar.mutateAsync({ troca })
      } catch {
        return
      }
    }
    if (await copia) toast.success(aviso)
    else toast.error("Não foi possível copiar")
  }

  const marcar = (item: Item, status: Item["status"], observacao?: string | null) =>
    acao(item, observacao === undefined ? { status } : { status, observacao })

  return (
    <>
      {problemas.length > 0 && (
        <Card
          size="sm"
          tom={avisar ? "destructive" : aguardando ? "warning" : undefined}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {avisar ? <BellRing className="size-4 text-destructive" /> : <TriangleAlert className={cn("size-4", aguardando ? "text-warning" : "text-muted-foreground")} />}
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
                  <Badge variant={avisar ? "destructive" : aguardando ? "warning" : "secondary"} size="lg">
                    <PackageX />
                    {i.qtd > 1 ? `Faltam ${i.qtd}` : "Em falta"}
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
                <EstadoTroca troca={troca} peca={pecaDe(i)} item={i} aoAbrir={() => setTrocando(i.id)} wa={wa} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap">
              {faltas.length > 0 && (
                <Button variant={emRascunho ? "default" : "secondary"} size="bloco" onClick={() => setTrocando(faltas[0].id)}>
                  <ArrowLeftRight /> {emRascunho ? (troca ? "Continuar troca" : "Montar troca") : "Editar troca"}
                </Button>
              )}
              {avisar && (
                <Button
                  variant={faltas.length > 0 ? "secondary" : "default"}
                  size="bloco"
                  onClick={() => {
                    mudarStatus.mutate({ pedidoId: pedido.id, para: "aguardando_cliente", silencioso: true })
                    toast.success("Aguardando resposta da cliente")
                  }}
                >
                  <Check /> Cliente avisada
                </Button>
              )}
            </div>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <ButtonGroup className="w-full sm:w-fit">
                <Button variant="outline" size="bloco" className="min-w-0 flex-1 px-2 text-xs sm:flex-none sm:px-2.5 sm:text-sm [&_svg]:hidden sm:[&_svg]:block" onClick={() => copiarComTroca(textoCliente(), "Mensagem copiada")}>
                  <Copy /> Copiar mensagem
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex min-w-0 flex-1 sm:flex-none" tabIndex={trocaPronta ? -1 : 0}>
                      <Button
                        variant="outline"
                        disabled={!trocaPronta || enviar.isPending}
                        // Dentro do <span> da dica, o grupo não alcança o botão: cantos e borda de junção aqui.
                        size="bloco"
                        className="min-w-0 flex-1 rounded-l-none border-l-0 px-2 text-xs sm:flex-none sm:px-2.5 sm:text-sm [&_svg]:hidden sm:[&_svg]:block"
                        onClick={() => copiarComTroca(linkTroca, "Link copiado")}
                      >
                        <Link2 /> Copiar link
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!trocaPronta && <TooltipContent>Monte as opções da troca primeiro</TooltipContent>}
                </Tooltip>
              </ButtonGroup>
            </div>
          </CardContent>
        </Card>
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
    </>
  )
}
