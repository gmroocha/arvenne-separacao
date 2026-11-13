import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { ChevronRight, PackageOpen, Printer, RefreshCw } from "lucide-react"
import CardPedido from "@/components/CardPedido"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BolhaContador } from "@/components/comum/Bolha"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { Vazio } from "@/components/comum/Vazio"
import { Toggle } from "@/components/ui/toggle"
import FaixaRolavel from "@/components/FaixaRolavel"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import { etiquetasDe } from "@/lib/etiquetas"
import { useDebounce } from "@/lib/useDebounce"
import { LIMITE_LISTA, useContagens, useMudarStatus, usePecasParaEtiquetar, usePedidosFase, usePendentesRastreio, useSincronizarShopify } from "@/lib/api"
import { digitos } from "@/lib/formato"
import { destinoAoConcluir, ETAPAS_EXPEDICAO, ICONE_ETAPA, NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import { useAgora } from "@/lib/useAgora"

type Coluna = {
  id: string
  nome: string
  icone: string
  statuses: StatusPedido[]
  alerta?: "vermelho" | "amarelo"
  rastreio?: boolean // pedidos enviados à espera do rastreio (vêm de outra consulta)
}

// Uma coluna por etapa, na ordem da esteira.
const COLUNAS: Coluna[] = [
  { id: "fila", nome: "Fila", icone: "fila", statuses: ["novo"] },
  { id: "separacao", nome: "Separação", icone: "separacao", statuses: ["separacao"] },
  { id: "avisar_cliente", nome: "Avisar cliente", icone: "avisar_cliente", statuses: ["avisar_cliente"], alerta: "vermelho" },
  { id: "aguardando_cliente", nome: "Aguardando cliente", icone: "aguardando_cliente", statuses: ["aguardando_cliente"], alerta: "amarelo" },
  { id: "conferencia", nome: "Conferência", icone: "conferencia", statuses: ["conferencia"] },
  { id: "etiquetagem", nome: "Etiquetagem", icone: "etiquetagem", statuses: ["etiquetagem"] },
  { id: "bipagem", nome: "Bipagem", icone: "bipagem", statuses: ["bipagem"] },
  { id: "faturamento", nome: "Nota e frete", icone: "faturamento", statuses: ["faturamento"] },
  { id: "embalagem", nome: "Embalagem", icone: "embalagem", statuses: ["embalagem"] },
  { id: "pronto_envio", nome: "Postagem", icone: "pronto_envio", statuses: ["pronto_envio"] },
  { id: "rastreio", nome: "Enviar rastreio", icone: "rastreio", statuses: ["enviado"], rastreio: true },
]

// Pela ordem da esteira (src/lib/status.ts): o destino natural ao concluir a etapa (o mesmo do Dialog) ou
// qualquer etapa anterior do fluxo principal. "Avisar" e "Aguardando cliente" são desvios: só entram
// como destino quando são o destino natural.
function podeSoltar(p: Pedido, c: Coluna) {
  const de = ETAPAS_EXPEDICAO.indexOf(p.status)
  const alvo = c.statuses[0]
  const para = ETAPAS_EXPEDICAO.indexOf(alvo)
  if (de < 0 || para < 0) return false
  if (alvo === destinoAoConcluir(p.status)) return true
  const desvio = alvo === "avisar_cliente" || alvo === "aguardando_cliente"
  return para < de && !desvio
}

// Cores suaves dos desvios: vermelho (avisar) e amarelo (aguardando). O contador usa a variante do Badge.
const COR_ALERTA = {
  vermelho: {
    coluna: "bg-destructive/10",
    icone: "text-destructive",
    anel: "border-destructive/40 bg-destructive/10 text-destructive",
    contador: "destructive",
  },
  amarelo: {
    coluna: "bg-warning/10",
    icone: "text-warning",
    anel: "border-warning/40 bg-warning/15 text-warning",
    contador: "warning",
  },
} as const

// Progresso da etapa no cartão ("3/5"), vindo das contagens da view.
function progressoDe(p: Pedido): string | null {
  switch (p.status) {
    case "novo":
    case "separacao":
    case "avisar_cliente":
    case "aguardando_cliente":
      return `${p.qtd_encontradas}/${p.qtd_linhas}`
    case "conferencia":
      return `${p.qtd_conferidas}/${p.qtd_encontradas}`
    case "etiquetagem":
      return `${p.qtd_etiquetadas}/${p.qtd_encontradas}`
    case "bipagem":
      return `${p.qtd_bipadas}/${p.qtd_pecas}`
    default:
      return null
  }
}

// PC: true quando a esteira ainda tem coluna escondida à direita (mostra um degradê na borda).
function useMaisADireita() {
  const ref = useRef<HTMLDivElement>(null)
  const [mais, setMais] = useState(false)
  useEffect(() => {
    const vp = ref.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")
    if (!vp) return
    const medir = () => setMais(vp.scrollLeft + vp.clientWidth < vp.scrollWidth - 4)
    const ro = new ResizeObserver(medir)
    ro.observe(vp)
    if (vp.firstElementChild) ro.observe(vp.firstElementChild)
    vp.addEventListener("scroll", medir, { passive: true })
    return () => {
      ro.disconnect()
      vp.removeEventListener("scroll", medir)
    }
  }, [])
  return [ref, mais] as const
}

export default function Expedicao() {
  const [esteiraRef, maisADireita] = useMaisADireita()
  const [params, setParams] = useSearchParams()
  const etapa = params.get("etapa")
  const soAtrasados = params.get("atrasados") === "1"
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca, 300)
  const { data, isLoading, isError, isFetching, refetch } = usePedidosFase("expedicao", termo)
  const { data: contagens } = useContagens()
  const rastreio = usePendentesRastreio()
  const sincronizar = useSincronizarShopify()
  const paraEtiquetar = usePecasParaEtiquetar()
  const { zebra, imprimindo, dialogo, imprimir } = useImprimirEtiquetas()
  // Um grupo por pedido em Etiquetagem; o lote ganha uma etiqueta separadora entre os pedidos.
  const gruposEtiquetas = (paraEtiquetar.data ?? []).map((p) => ({ numero: p.numero, cliente: p.cliente, ...etiquetasDe(p.itens) }))
  const totalEtiquetas = gruposEtiquetas.reduce((n, g) => n + g.etiquetas.length, 0)
  const botaoImprimirTodas = (
    <Button variant="secondary" size="toque" className="w-full" disabled={imprimindo} onClick={() => imprimir(gruposEtiquetas)}>
      <Printer /> Imprimir todas ({totalEtiquetas}){zebra && <span className="font-normal opacity-80"> · na Zebra</span>}
    </Button>
  )
  const agora = useAgora()
  const mudarStatus = useMudarStatus()
  const [arrastando, setArrastando] = useState<Pedido | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  // Arrastar um cartão move o pedido de etapa (com Desfazer): só para a próxima etapa ou para uma anterior.
  function soltar(c: Coluna) {
    const p = arrastando
    setArrastando(null)
    setAlvo(null)
    if (!p || c.rastreio || c.statuses.includes(p.status)) return
    if (!podeSoltar(p, c)) {
      toast.info("Arraste para a próxima etapa")
      return
    }
    const para = c.statuses[0]
    const de = p.status
    mudarStatus.mutate(
      { pedidoId: p.id, para, silencioso: true },
      {
        onSuccess: () =>
          toast.success(`${p.cliente_nome ?? "Pedido"} → ${NOME_ETAPA[para]}`, {
            action: { label: "Desfazer", onClick: () => mudarStatus.mutate({ pedidoId: p.id, para: de, silencioso: true }) },
          }),
      },
    )
  }

  const atualizar = (mudanca: Record<string, string | null>) => {
    const n = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) n.set(k, v)
      else n.delete(k)
    }
    setParams(n, { replace: true })
  }

  const atrasado = (prazo: string | null) => prazo !== null && new Date(prazo).getTime() < agora

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = digitos(busca)
    return [...(data ?? []), ...(rastreio.data ?? [])].filter(
      (p) =>
        !t ||
        p.numero.toLowerCase().includes(t) ||
        (p.cliente_nome ?? "").toLowerCase().includes(t) ||
        (d.length >= 3 && digitos(p.cliente_telefone).includes(d)),
    )
  }, [data, rastreio.data, busca])

  const dentro = (c: Coluna) =>
    filtrados
      .filter((p) => (c.rastreio ? p.pendente_rastreio : !p.pendente_rastreio && c.statuses.includes(p.status)))
      .filter((p) => !soAtrasados || atrasado(p.prazo))
  const porColuna = COLUNAS.map((c) => ({ ...c, pedidos: dentro(c) }))
  // Sem busca, o total vem do banco (conta mesmo além do limite da lista); com busca, conta os da lista filtrada.
  const totalAtrasados = busca.trim() || !contagens ? filtrados.filter((p) => !p.pendente_rastreio && atrasado(p.prazo)).length : contagens.atrasados

  // Celular: o padrão é a primeira etapa que tem pedidos. Com busca, mostra todas as colunas juntas.
  const primeiraComPedidos = porColuna.find((c) => c.pedidos.length > 0)?.id ?? COLUNAS[0].id
  const selecionada = COLUNAS.some((c) => c.id === etapa) ? etapa! : primeiraComPedidos
  const listaCelular = busca.trim()
    ? porColuna.flatMap((c) => c.pedidos)
    : (porColuna.find((c) => c.id === selecionada)?.pedidos ?? [])

  const vazio = <Vazio icone={PackageOpen} titulo="Nenhum pedido nesta etapa" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <CampoBusca className="flex-1 lg:h-8" valor={busca} aoMudar={setBusca} placeholder="Buscar pedido" />
        <Toggle
          variant="outline"
          size="xl"
          pressed={soAtrasados}
          onPressedChange={(on) => atualizar({ atrasados: on ? "1" : null })}
          className="shrink-0 lg:h-8 data-[state=on]:border-destructive data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive data-[state=on]:hover:bg-destructive/20 data-[state=on]:hover:text-destructive"
        >
          Atrasados <Badge variant={totalAtrasados ? "destructive" : "secondary"}>{totalAtrasados}</Badge>
        </Toggle>
        <Button
          variant="outline"
          size="toque"
          aria-label="Sincronizar com a Shopify"
          className="w-11 shrink-0 px-0 lg:w-auto lg:px-2.5"
          onClick={() => sincronizar.mutate(undefined)}
          disabled={sincronizar.isPending}
        >
          {sincronizar.isPending ? <Spinner /> : <RefreshCw />} <span className="hidden lg:inline">Sincronizar</span>
        </Button>
      </div>

      {(data?.length ?? 0) >= LIMITE_LISTA && (
        <p className="text-xs text-muted-foreground">Mostrando os {LIMITE_LISTA} primeiros pedidos da expedição: pode haver mais. Use a busca para achar os outros.</p>
      )}

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {(!isError || !!data) && <>
      {/* Celular: faixa da esteira, uma etapa por ícone ligada por linha. Toque filtra a lista. */}
      <div className="lg:hidden">
        <FaixaRolavel chave={selecionada}>
          <ol className="flex w-max items-start pb-3" aria-label="Esteira">
            {porColuna.map((c, i) => {
              const Icone = ICONE_ETAPA[c.icone]
              const ativa = !busca.trim() && c.id === selecionada
              return (
                <li key={c.id} className="flex items-start">
                  <button
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => atualizar({ etapa: c.id })}
                    className="flex w-[72px] flex-col items-center gap-1 rounded-lg py-1 text-center"
                  >
                    <span
                      className={cn(
                        "relative flex size-11 items-center justify-center rounded-full border transition-colors",
                        ativa ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                        c.alerta && c.pedidos.length > 0 && !ativa && COR_ALERTA[c.alerta].anel,
                      )}
                    >
                      <Icone className="size-5" />
                      {c.alerta && c.pedidos.length > 0 ? (
                        <Badge
                          variant={COR_ALERTA[c.alerta].contador}
                          className={cn("absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 tabular-nums", c.alerta === "vermelho" ? "bg-destructive text-background" : "bg-warning text-warning-foreground")}
                        >
                          {c.pedidos.length}
                        </Badge>
                      ) : c.pedidos.length > 0 ? (
                        <BolhaContador n={c.pedidos.length} className="absolute -top-1.5 -right-1.5" />
                      ) : (
                        <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 tabular-nums">
                          0
                        </Badge>
                      )}
                    </span>
                    <span className={cn("text-xs leading-tight", ativa ? "font-semibold" : "text-muted-foreground")}>{c.nome}</span>
                  </button>
                  {i < porColuna.length - 1 && <span className="mt-[22px] h-px w-3 shrink-0 bg-border" />}
                </li>
              )
            })}
          </ol>
        </FaixaRolavel>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : listaCelular.length === 0 ? (
          vazio
        ) : (
          <div className="flex flex-col gap-2">
            {selecionada === "etiquetagem" && !busca.trim() && totalEtiquetas > 0 && botaoImprimirTodas}
            {listaCelular.map((p) => (
              <CardPedido key={p.id} p={p} progresso={progressoDe(p)} />
            ))}
          </div>
        )}
      </div>

      {/* PC: quadro com uma coluna por etapa, na ordem da esteira. */}
      <div ref={esteiraRef} className="relative hidden lg:block">
      <ScrollArea className="w-full">
        <div className="flex w-max items-start gap-1 pb-4">
          {porColuna.map((c, i) => {
            const Icone = ICONE_ETAPA[c.icone]
            return (
              <Fragment key={c.id}>
                <section
                  aria-label={c.nome}
                  onDragOver={(e) => {
                    if (!arrastando || c.rastreio) return
                    e.preventDefault() // aceita o soltar também nas inválidas, para avisar com o toast
                    if (!podeSoltar(arrastando, c)) return // sem destaque
                    e.dataTransfer.dropEffect = "move"
                    if (alvo !== c.id) setAlvo(c.id)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === c.id ? null : a))
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    soltar(c)
                  }}
                  className={cn(
                    "flex min-h-40 w-64 shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors",
                    c.alerta ? COR_ALERTA[c.alerta].coluna : "bg-muted/40",
                    alvo === c.id && "bg-primary/10 ring-2 ring-primary/50 ring-inset",
                  )}
                >
                  <header className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
                    <Icone className={cn("size-4", c.alerta ? COR_ALERTA[c.alerta].icone : "text-muted-foreground")} />
                    <span className="truncate">{c.nome}</span>
                    <Badge
                      variant={c.alerta && c.pedidos.length > 0 ? COR_ALERTA[c.alerta].contador : "secondary"}
                      className="ml-auto tabular-nums"
                    >
                      {c.pedidos.length}
                    </Badge>
                  </header>
                  {c.id === "etiquetagem" && totalEtiquetas > 0 && botaoImprimirTodas}
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : c.pedidos.length === 0 ? (
                    <Vazio className="border-0 py-6 text-xs">Nenhum pedido</Vazio>
                  ) : (
                    c.pedidos.map((p) => (
                      <div
                        key={p.id}
                        draggable={!c.rastreio}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", p.id)
                          setArrastando(p)
                        }}
                        onDragEnd={() => {
                          setArrastando(null)
                          setAlvo(null)
                        }}
                        className={cn(!c.rastreio && "cursor-grab active:cursor-grabbing", arrastando?.id === p.id && "opacity-40")}
                      >
                        <CardPedido p={p} progresso={progressoDe(p)} />
                      </div>
                    ))
                  )}
                </section>
                {i < porColuna.length - 1 && <ChevronRight className="mt-4 size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
              </Fragment>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {maisADireita && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
      )}
      </div>
      </>}
      {dialogo}
    </div>
  )
}
