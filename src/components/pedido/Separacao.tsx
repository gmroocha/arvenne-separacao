import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, BellRing, Check, Copy, HandCoins, Link2, MessageCircle, PackageX, Plus, Send, Trash2, TriangleAlert, Undo2 } from "lucide-react"
import { LinhaPeca as LinhaPecaComum } from "@/components/comum/Peca"
import { Quantidade } from "@/components/comum/Quantidade"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ButtonGroup } from "@/components/ui/button-group"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useConcluirTroca, useEnviarTroca, useMarcarFalta, useMudarStatus, useTroca, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { mensagemFaltaSimples, mensagemTroca } from "@/lib/agente"
import { etapaCompleta } from "@/lib/etapa"
import { linkWhatsApp } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import { fraseCarrinho, fraseCredito, fraseTroca } from "@/lib/trocaTexto"
import { chaveModelo, numeroTamanho, separarTamanho } from "@/lib/variante"
import type { Item, Troca, TrocaOpcao, TrocaPeca } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import ConfirmarTroca from "./ConfirmarTroca"
import LinhaPeca from "./LinhaPeca"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TileModelo, TilePeca, Vazio } from "./TilePeca"
import TrocaDialog from "./TrocaDialog"

// Carrinho da cliente com a opção completa. Banco antigo: só a opção escolhida, na quantidade da peça.
function listaEscolhida(peca: TrocaPeca): { opcao: TrocaOpcao; qtd: number }[] {
  const itens = peca.carrinho?.itens ?? []
  if (itens.length > 0) return itens.flatMap((c) => { const opcao = peca.opcoes.find((o) => o.id === c.opcao_id); return opcao ? [{ opcao, qtd: c.qtd }] : [] })
  const o = peca.opcoes.find((x) => x.id === peca.escolha_opcao_id)
  return o ? [{ opcao: o, qtd: 0 }] : []
}

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

  const opcao = peca.escolha_tipo === "opcao" ? peca.opcoes.find((o) => o.id === peca.escolha_opcao_id) : undefined
  // Carrinho da cliente: todas as peças que ela escolheu (ou só a opção, em banco antigo).
  const lista = peca.escolha_tipo === "opcao" ? listaEscolhida(peca) : []
  const fazer = (tipo: "opcao" | "credito") => concluir.mutate({ troca, peca, tipo }, { onSuccess: () => setConfirmar(null) })
  const frase =
    confirmar === "opcao" && lista.length > 1
      ? fraseCarrinho(item.sku ?? item.nome, peca)
      : confirmar === "opcao" && opcao
        ? fraseTroca(item.sku ?? item.nome, peca, opcao)
        : fraseCredito(peca)
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-success/10 p-2">
      {lista.length > 0 ? (
        <div className="flex flex-col gap-2">
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
      <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap">
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
        titulo={confirmar === "opcao" ? "Fazer a troca?" : "Dar crédito?"}
        frase={frase}
        pendente={concluir.isPending}
        aoConfirmar={() => confirmar && fazer(confirmar)}
      />
    </div>
  )
}

type Props = {
  pedido: PedidoDetalhe
  acao: AcaoItem
  aoTrocar: (item: Item) => void
  aoAdicionar: () => void
  aoConcluir?: () => void
}

export default function Separacao({ pedido, acao, aoTrocar, aoAdicionar, aoConcluir }: Props) {
  const itens = pedido.pedido_itens
  const pendentes = itens.filter((i) => i.status === "pendente")
  const achadas = itens.filter((i) => i.status === "encontrado")
  const problemas = itens.filter((i) => i.status === "falta" || i.status === "defeito")
  const removidas = itens.filter((i) => i.status === "removido")
  const vivas = itens.length - removidas.length
  // Tamanhos do mesmo modelo (mesmo produto e mesma pedra/cor) viram um bloco só; sem tamanho, um bloco por peça.
  const blocos = (() => {
    const grupos = new Map<string, Item[]>()
    for (const i of pendentes) {
      if (!separarTamanho(i.variante).tamanho) continue
      const k = chaveModelo(i.nome, i.variante)
      grupos.set(k, [...(grupos.get(k) ?? []), i])
    }
    const vistos = new Set<string>()
    const saida: Item[][] = []
    for (const i of pendentes) {
      const k = chaveModelo(i.nome, i.variante)
      const g = grupos.get(k)
      if (!g || g.length < 2) saida.push([i])
      else if (!vistos.has(k)) {
        vistos.add(k)
        saida.push([...g].sort((a, b) => numeroTamanho(separarTamanho(a.variante).tamanho) - numeroTamanho(separarTamanho(b.variante).tamanho)))
      }
    }
    return saida
  })()
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

  // "Em falta" em peça com 2 ou mais: pergunta quantas faltam (o banco divide a linha). Com 1, direto.
  const marcarFalta = useMarcarFalta(pedido.id)
  const [faltaItem, setFaltaItem] = useState<Item | null>(null)
  const [faltam, setFaltam] = useState(1)
  const pedirFalta = (i: Item) => {
    if (i.qtd >= 2) {
      setFaltam(1)
      setFaltaItem(i)
    } else marcar(i, "falta")
  }
  function confirmarFalta(n: number) {
    const i = faltaItem
    if (!i) return
    setFaltaItem(null)
    if (n >= i.qtd) marcar(i, "falta")
    else marcarFalta.mutate({ item: i, qtd: n })
  }

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Separação" feitas={achadas.length} total={vivas} unidade="peças" />

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

      <section className="flex flex-col gap-2" aria-label="A encontrar">
        <TituloSecao as="h3" contagem={pendentes.length}>
          A encontrar
        </TituloSecao>
        {pendentes.length === 0 ? (
          <Vazio>{itens.length === 0 ? "Este pedido ainda não tem peças." : "Nenhuma peça pendente."}</Vazio>
        ) : (
          <GradePecas>
            {blocos.map((g) =>
              g.length === 1 ? (
                <TilePeca key={g[0].id} item={g[0]}>
                  <Button size="bloco" className="flex-1" onClick={() => acao(g[0], { status: "encontrado" })}>
                    <Check /> Achei
                  </Button>
                  <MenuPeca
                    itens={[
                      { rotulo: "Falta", icone: PackageX, aoClicar: () => pedirFalta(g[0]) },
                      { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(g[0]) },
                      { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(g[0], "removido", "cliente desistiu") },
                    ]}
                  />
                </TilePeca>
              ) : (
                <TileModelo key={g[0].id} itens={g}>
                  {/* Uma chamada por tamanho (cada uma grava o seu evento); a etapa só completa na última. */}
                  <Button size="bloco" className="flex-1" onClick={() => g.forEach((i) => acao(i, { status: "encontrado" }))}>
                    <Check /> Achei
                  </Button>
                  {/* Uma seção por tamanho: título "N°16 · 2 un." e as três ações embaixo. */}
                  <MenuPeca
                    rotulo="Ações por tamanho"
                    grupos={g.map((i) => ({
                      titulo: `${separarTamanho(i.variante).tamanho ?? i.variante ?? i.sku ?? i.nome}${i.qtd > 1 ? ` · ${i.qtd} un.` : ""}`,
                      itens: [
                        { rotulo: "Em falta", icone: PackageX, aoClicar: () => pedirFalta(i) },
                        { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                        { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(i, "removido", "cliente desistiu") },
                      ],
                    }))}
                  />
                </TileModelo>
              ),
            )}
          </GradePecas>
        )}
        <Button variant="outline" size="toque" className="w-fit" onClick={aoAdicionar}>
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
                <Button variant="ghost" size="toque" onClick={() => marcar(i, "pendente", null)}>
                  Restaurar
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <RespDialog aberto={!!faltaItem} aoMudar={(a) => !a && setFaltaItem(null)} titulo="Quantas faltam?" descricao={faltaItem ? `${faltaItem.sku ?? faltaItem.nome} · o pedido tem ${faltaItem.qtd}` : undefined}>
        {faltaItem && (
          <div className="flex flex-col gap-5 pt-2">
            <Quantidade tamanho="grande" valor={faltam} min={1} max={faltaItem.qtd} de={faltaItem.qtd} rotulo="uma" aoMudar={setFaltam} />
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">
              {faltam >= faltaItem.qtd ? "Todas as unidades vão para a troca." : `${faltaItem.qtd - faltam} ${faltaItem.qtd - faltam === 1 ? "segue" : "seguem"} na separação e ${faltam} ${faltam === 1 ? "vai" : "vão"} para a troca.`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="xl" onClick={() => confirmarFalta(faltaItem.qtd)}>
                Todas ({faltaItem.qtd})
              </Button>
              <Button size="xl" onClick={() => confirmarFalta(faltam)}>
                <Check /> Confirmar {faltam}
              </Button>
            </div>
          </div>
        )}
      </RespDialog>

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

      {aoConcluir && (
        <ConcluirEtapa disabled={!etapaCompleta(pedido.status, itens)} onClick={aoConcluir}>
          Concluir separação
        </ConcluirEtapa>
      )}
    </div>
  )
}
