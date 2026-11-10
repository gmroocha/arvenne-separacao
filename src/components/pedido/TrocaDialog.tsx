import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, ChevronUp, Copy, MessageCircle, Search, X } from "lucide-react"
import { BuscaPecas } from "@/components/BuscaPecas"
import Foto from "@/components/Foto"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useIsMobile } from "@/hooks/use-mobile"
import { useCriarTroca, useEnviarTroca, useOpcaoTroca, useSugestoes, useTrocas, type PedidoDetalhe } from "@/lib/api"
import { mensagemTroca } from "@/lib/agente"
import { linkWhatsApp, reais } from "@/lib/formato"
import { fotoTamanho } from "@/lib/foto"
import { textoSituacao, trocaAtiva, valorDaOpcao, valorPagoItem } from "@/lib/trocaTexto"
import type { Item, NovoItem, Sugestao, Troca, TrocaOpcao } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  pedido: PedidoDetalhe
  item: Item
}

const opcaoIgual = (o: TrocaOpcao, n: NovoItem) =>
  o.shopify_variant_id != null ? o.shopify_variant_id === n.shopify_variant_id : o.peca_clube_id != null && o.peca_clube_id === n.peca_clube_id

const doSugestao = (s: Sugestao): NovoItem => ({
  chave: `sug-${s.variant_id}`,
  origem: "shopify",
  shopify_variant_id: s.variant_id,
  peca_clube_id: null,
  sku: s.sku,
  nome: s.produto,
  variante: s.variante,
  foto_url: s.foto_url,
  qtd: 1,
  preco: s.preco,
})

function GradeSugestoes({
  titulo,
  sugestoes,
  selecionada,
  aoTocar,
}: {
  titulo: string
  sugestoes: Sugestao[]
  selecionada: (n: NovoItem) => boolean
  aoTocar: (n: NovoItem) => void
}) {
  if (sugestoes.length === 0) return null
  return (
    <section className="flex flex-col gap-2" aria-label={titulo}>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sugestoes.map((s) => {
          const novo = doSugestao(s)
          const marcada = selecionada(novo)
          return (
            <button
              key={s.variant_id}
              type="button"
              aria-pressed={marcada}
              onClick={() => aoTocar(novo)}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border bg-card p-2 text-left transition-colors",
                marcada && "border-emerald-500 bg-emerald-500/5",
              )}
            >
              <div className="relative">
                <Foto url={fotoTamanho(s.foto_url, 300)} alt={s.produto} className="w-full" />
                {marcada && (
                  <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="size-4" />
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                <span className="font-mono text-base leading-tight font-semibold break-all">{s.sku ?? "sem código"}</span>
                <span className="text-sm leading-tight font-medium">{s.variante ?? "sem variante"}</span>
                {s.preco != null && <span className="text-sm text-muted-foreground tabular-nums">{reais(s.preco)}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ListaOpcoes({ troca, aoRemover }: { troca: Troca | undefined; aoRemover: (o: TrocaOpcao) => void }) {
  const opcoes = troca?.opcoes ?? []
  if (!troca || opcoes.length === 0)
    return <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Toque numa peça para oferecer à cliente.</p>
  return (
    <div className="flex flex-col gap-2">
      {opcoes.map((o) => (
        <div key={o.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <Foto url={fotoTamanho(o.foto_url, 200)} alt={o.nome} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm font-semibold">{o.sku ?? "sem código"}</div>
            <div className="truncate text-xs text-muted-foreground">{o.variante ?? o.nome}</div>
            <div className="text-xs font-medium">{textoSituacao(valorDaOpcao(troca, o))}</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Tirar opção" onClick={() => aoRemover(o)}>
            <X />
          </Button>
        </div>
      ))}
    </div>
  )
}

// Troca de peça em falta: a equipe escolhe as opções e manda o link para a cliente.
export default function TrocaDialog({ aberto, aoMudar, pedido, item }: Props) {
  const celular = useIsMobile()
  const trocas = useTrocas(pedido.id)
  const troca = trocas.data?.find((t) => t.item_id === item.id && trocaAtiva(t))
  const sugestoes = useSugestoes(aberto ? item.id : undefined)
  const criar = useCriarTroca()
  const { adicionar, remover } = useOpcaoTroca(pedido.id)
  const enviar = useEnviarTroca()
  const criou = useRef<string | null>(null)
  const [verOpcoes, setVerOpcoes] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Item sem troca: cria o rascunho uma única vez ao abrir.
  const { mutate: criarTroca, isPending: criando } = criar
  useEffect(() => {
    if (!aberto) {
      criou.current = null
      return
    }
    if (!trocas.isSuccess || troca || criando || criou.current === item.id) return
    criou.current = item.id
    criarTroca({ pedidoId: pedido.id, itemId: item.id })
  }, [aberto, trocas.isSuccess, troca, criando, criarTroca, item.id, pedido.id])

  const opcoes = troca?.opcoes ?? []
  const selecionada = (n: NovoItem) => opcoes.some((o) => opcaoIgual(o, n))
  const pago = troca ? valorPagoItem(troca) : undefined

  function alternar(n: NovoItem, motivo: TrocaOpcao["motivo"]) {
    if (!troca) return
    const existente = opcoes.find((o) => opcaoIgual(o, n))
    if (existente) {
      if (!existente.id.startsWith("tmp-")) remover.mutate({ opcaoId: existente.id })
    } else adicionar.mutate({ trocaId: troca.id, opcao: n, motivo })
  }

  const link = troca ? `${window.location.origin}/t/${troca.token}` : ""
  const credito = pago != null ? reais(pago) : null
  const texto = troca ? mensagemTroca(pedido, item, link, credito) : ""
  const wa = linkWhatsApp(pedido.cliente_telefone, texto)
  const semOpcao = opcoes.length === 0 || opcoes.some((o) => o.id.startsWith("tmp-"))
  const bloqueado = !troca || semOpcao || enviando

  async function copiar() {
    if (!troca) return
    setEnviando(true)
    // O copiar começa antes do await, ainda no toque (o navegador exige).
    const copia = navigator.clipboard.writeText(texto)
    try {
      await enviar.mutateAsync({ troca })
      await copia
      toast.success("Mensagem copiada. Cole no WhatsApp da cliente.")
      aoMudar(false)
    } catch {
      toast.error("Não foi possível copiar")
    } finally {
      setEnviando(false)
    }
  }

  async function enviarWhatsApp() {
    if (!troca || !wa) return
    setEnviando(true)
    // Abre a aba já no toque (celular bloqueia janela aberta depois de esperar).
    const aba = window.open("about:blank", "_blank")
    try {
      await enviar.mutateAsync({ troca })
      if (aba) aba.location.href = wa
      else window.open(wa, "_blank")
      toast.success("Troca enviada")
      aoMudar(false)
    } catch {
      aba?.close()
    } finally {
      setEnviando(false)
    }
  }

  const botoes = (
    <div className="flex gap-2">
      <Button variant="outline" className="h-11 flex-1 sm:h-9" disabled={bloqueado} onClick={copiar}>
        {enviando ? <Spinner /> : <Copy />} Copiar mensagem
      </Button>
      <Button className="h-11 flex-1 sm:h-9" disabled={bloqueado || !wa} onClick={enviarWhatsApp}>
        <MessageCircle /> Enviar no WhatsApp
      </Button>
    </div>
  )

  const topo = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-2">
      <Foto url={fotoTamanho(item.foto_url, 300)} alt={item.nome} ampliar className="size-20 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-lg leading-tight font-semibold break-all">{item.sku ?? "sem código"}</span>
        {item.variante && <span className="text-sm leading-tight font-medium">{item.variante}</span>}
        <span className="line-clamp-1 text-xs text-muted-foreground">{item.nome}</span>
        {pago != null ? (
          <span className="mt-0.5 text-sm tabular-nums">Cliente pagou {reais(pago)}</span>
        ) : (
          <Skeleton className="mt-0.5 h-4 w-32" />
        )}
      </div>
    </div>
  )

  const todas = sugestoes.data ?? []
  const modelo = todas.filter((s) => s.motivo === "mesmo_modelo")
  const valor = todas.filter((s) => s.motivo === "mesmo_valor")

  const conteudo = (
    <div className="flex flex-col gap-4">
      {topo}
      {sugestoes.isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      <GradeSugestoes titulo="Mesmo modelo" sugestoes={modelo} selecionada={selecionada} aoTocar={(n) => alternar(n, "mesmo_modelo")} />
      <GradeSugestoes titulo="Mesmo valor" sugestoes={valor} selecionada={selecionada} aoTocar={(n) => alternar(n, "mesmo_valor")} />
      {!sugestoes.isLoading && todas.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem sugestões para esta peça. Use a busca para escolher as opções.</p>
      )}
      <Collapsible open={buscando} onOpenChange={setBuscando} className="flex flex-col gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="h-11 w-fit sm:h-9">
            <Search /> Buscar outra
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {aberto && <BuscaPecas aoEscolher={(n) => alternar(n, "busca")} selecionada={selecionada} />}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )

  const lista = <ListaOpcoes troca={troca} aoRemover={(o) => !o.id.startsWith("tmp-") && remover.mutate({ opcaoId: o.id })} />
  const rotuloOpcoes = `${opcoes.length} ${opcoes.length === 1 ? "opção" : "opções"}`

  return (
    <RespDialog
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Troca de peça em falta"
      descricao="Escolha as opções que a cliente poderá ver e envie o link"
      largo
    >
      {celular ? (
        <div className="flex flex-col gap-3">
          {conteudo}
          <Collapsible open={verOpcoes} onOpenChange={setVerOpcoes} className="sticky bottom-0 -mx-4 border-t bg-background px-4 pt-3">
            <CollapsibleContent className="max-h-[40svh] overflow-y-auto pb-3">{lista}</CollapsibleContent>
            <div className="flex flex-col gap-2 pb-1">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="h-9 justify-between" disabled={opcoes.length === 0}>
                  {rotuloOpcoes} escolhidas
                  <ChevronUp className={verOpcoes ? "rotate-180" : ""} />
                </Button>
              </CollapsibleTrigger>
              {botoes}
            </div>
          </Collapsible>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
          <div>{conteudo}</div>
          <div className="flex flex-col gap-3 self-start border-l pl-6">
            <h3 className="text-sm font-semibold">
              Opções escolhidas {opcoes.length > 0 && <span className="font-normal text-muted-foreground">({rotuloOpcoes})</span>}
            </h3>
            <div className="max-h-[50svh] overflow-y-auto">{lista}</div>
            {botoes}
          </div>
        </div>
      )}
    </RespDialog>
  )
}
