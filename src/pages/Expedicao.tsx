import { Fragment, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { ChevronRight, PackageOpen, RefreshCw, Search } from "lucide-react"
import CardPedido from "@/components/CardPedido"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import FaixaRolavel from "@/components/FaixaRolavel"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useMudarStatus, usePedidosFase, usePendentesRastreio, useSincronizarShopify } from "@/lib/api"
import { digitos } from "@/lib/formato"
import { ETAPAS_EXPEDICAO, ICONE_ETAPA, NOME_ETAPA, type StatusPedido } from "@/lib/status"
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

// Pela ordem da esteira (src/lib/status.ts): a próxima etapa ou qualquer anterior.
function podeSoltar(p: Pedido, c: Coluna) {
  const de = ETAPAS_EXPEDICAO.indexOf(p.status)
  const para = ETAPAS_EXPEDICAO.indexOf(c.statuses[0])
  if (de < 0 || para < 0) return false
  return para < de || para === de + 1
}

// Cores suaves dos desvios: vermelho (avisar) e amarelo (aguardando).
const COR_ALERTA = {
  vermelho: {
    coluna: "bg-destructive/10",
    icone: "text-destructive",
    anel: "border-destructive/40 bg-destructive/10 text-destructive",
    contador: "bg-destructive text-white",
  },
  amarelo: {
    coluna: "bg-amber-500/10",
    icone: "text-amber-700 dark:text-amber-300",
    anel: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    contador: "bg-amber-500 text-white",
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

export default function Expedicao() {
  const [params, setParams] = useSearchParams()
  const etapa = params.get("etapa")
  const soAtrasados = params.get("atrasados") === "1"
  const [busca, setBusca] = useState("")
  const { data, isLoading } = usePedidosFase("expedicao")
  const rastreio = usePendentesRastreio()
  const sincronizar = useSincronizarShopify()
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
  const totalAtrasados = filtrados.filter((p) => !p.pendente_rastreio && atrasado(p.prazo)).length

  // Celular: o padrão é a primeira etapa que tem pedidos. Com busca, mostra todas as colunas juntas.
  const primeiraComPedidos = porColuna.find((c) => c.pedidos.length > 0)?.id ?? COLUNAS[0].id
  const selecionada = COLUNAS.some((c) => c.id === etapa) ? etapa! : primeiraComPedidos
  const listaCelular = busca.trim()
    ? porColuna.flatMap((c) => c.pedidos)
    : (porColuna.find((c) => c.id === selecionada)?.pedidos ?? [])

  const vazio = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpen />
        </EmptyMedia>
        <EmptyTitle>Nenhum pedido nesta etapa</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="h-11 min-w-48 flex-1 lg:h-8">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput placeholder="Cliente, número ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </InputGroup>
        <Button
          variant={soAtrasados ? "destructive" : "outline"}
          className="h-11 lg:h-8"
          onClick={() => atualizar({ atrasados: soAtrasados ? null : "1" })}
        >
          Atrasados <Badge variant={totalAtrasados ? "destructive" : "secondary"}>{totalAtrasados}</Badge>
        </Button>
        <Button variant="outline" className="h-11 lg:h-8" onClick={() => sincronizar.mutate(undefined)} disabled={sincronizar.isPending}>
          {sincronizar.isPending ? <Spinner /> : <RefreshCw />} Sincronizar
        </Button>
      </div>

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
                      <Badge
                        variant={c.pedidos.length ? "default" : "secondary"}
                        className={cn(
                          "absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 tabular-nums",
                          c.alerta && c.pedidos.length > 0 && COR_ALERTA[c.alerta].contador,
                        )}
                      >
                        {c.pedidos.length}
                      </Badge>
                    </span>
                    <span className={cn("text-[11px] leading-tight", ativa ? "font-semibold" : "text-muted-foreground")}>{c.nome}</span>
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
            {listaCelular.map((p) => (
              <CardPedido key={p.id} p={p} progresso={progressoDe(p)} />
            ))}
          </div>
        )}
      </div>

      {/* PC: quadro com uma coluna por etapa, na ordem da esteira. */}
      <ScrollArea className="hidden w-full lg:block">
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
                      variant="secondary"
                      className={cn("ml-auto tabular-nums", c.alerta && c.pedidos.length > 0 && COR_ALERTA[c.alerta].contador)}
                    >
                      {c.pedidos.length}
                    </Badge>
                  </header>
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : c.pedidos.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhum pedido</p>
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
    </div>
  )
}
