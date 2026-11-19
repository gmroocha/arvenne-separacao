import { ErroConsulta } from "@/components/comum/ErroConsulta"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"
import { ChevronRight, PackageOpen, RefreshCw, Thermometer, Users } from "lucide-react"
import CardPedido from "@/components/CardPedido"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BolhaContador } from "@/components/comum/Bolha"
import { CampoBusca } from "@/components/comum/CampoBusca"
import { Vazio } from "@/components/comum/Vazio"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import FaixaRolavel from "@/components/FaixaRolavel"
import { useArrastarComMouse } from "@/hooks/use-arrastar-mouse"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useDebounce } from "@/lib/useDebounce"
import { LIMITE_LISTA, useContagens, useEquipe, useMeuMembro, useMudarStatus, usePedidosExpedicao, useSincronizarShopify, useSouGestor } from "@/lib/api"
import { responsavelDaEtapaAtual } from "@/lib/equipe"
import { digitos } from "@/lib/formato"
import { destinoAoConcluir, ETAPAS_EXPEDICAO, ICONE_ETAPA, NOME_ETAPA, type StatusPedido } from "@/lib/status"
import type { PedidoOperacao } from "@/lib/tipos"
import { cn } from "@/lib/utils"
import { useAgora } from "@/lib/useAgora"

type Coluna = {
  id: string
  nome: string
  icone: string
  statuses: StatusPedido[]
  alerta?: "vermelho" | "amarelo" | "laranja" | "verde"
  // Coluna derivada do desvio (não é status): true = só pedidos em que a cliente já escolheu; false = os que não.
  decidiu?: boolean
}

// Uma coluna por etapa, na ordem da esteira.
const COLUNAS: Coluna[] = [
  { id: "fila", nome: "Fila", icone: "fila", statuses: ["novo"] },
  { id: "separacao", nome: "Separação", icone: "separacao", statuses: ["separacao"] },
  { id: "avisar_cliente", nome: "Avisar cliente", icone: "avisar_cliente", statuses: ["avisar_cliente"], alerta: "vermelho", decidiu: false },
  { id: "aguardando_cliente", nome: "Aguardando cliente", icone: "aguardando_cliente", statuses: ["aguardando_cliente"], alerta: "amarelo", decidiu: false },
  // Não é uma etapa: pedidos em Avisar/Aguardando cuja troca ativa já tem peça escolhida pela cliente (conta do banco,
  // `cliente_decidiu`). Some sozinho quando a equipe conclui a troca. Não aceita soltar cartão.
  { id: "cliente_decidiu", nome: "Cliente decidiu", icone: "cliente_decidiu", statuses: ["avisar_cliente", "aguardando_cliente"], alerta: "verde", decidiu: true },
  { id: "conferencia", nome: "Conferência", icone: "conferencia", statuses: ["conferencia"] },
  { id: "bipagem", nome: "Bipagem", icone: "bipagem", statuses: ["bipagem"] },
  { id: "faturamento", nome: "Nota fiscal", icone: "faturamento", statuses: ["faturamento"] },
  { id: "embalagem", nome: "Embalagem e frete", icone: "embalagem", statuses: ["embalagem", "frete"] },
  { id: "pronto_envio", nome: "Postagem", icone: "pronto_envio", statuses: ["pronto_envio"] },
  // Só pedidos que não são da Shopify: já postados, esperando a mensagem de rastreio. Laranja, para chamar a atenção.
  { id: "enviar_rastreio", nome: "Enviar rastreio", icone: "enviar_rastreio", statuses: ["enviar_rastreio"], alerta: "laranja" },
]

// Pela ordem da esteira (src/lib/status.ts): o destino natural ao concluir a etapa (o mesmo do Dialog) ou
// qualquer etapa anterior do fluxo principal. "Avisar" e "Aguardando cliente" são desvios: só entram
// como destino quando são o destino natural.
function podeSoltar(p: PedidoOperacao, c: Coluna) {
  if (c.decidiu) return false // "Cliente decidiu" é só um filtro do desvio: não se solta cartão nela
  const de = ETAPAS_EXPEDICAO.indexOf(p.status)
  const alvo = c.statuses[0]
  const para = ETAPAS_EXPEDICAO.indexOf(alvo)
  if (de < 0 || para < 0) return false
  if (alvo === "enviar_rastreio" && p.origem === "shopify") return false // pedido da Shopify não tem esta etapa
  if (alvo === destinoAoConcluir(p.status, p.origem)) return true
  const desvio = alvo === "avisar_cliente" || alvo === "aguardando_cliente"
  return para < de && !desvio
}

// Cores suaves dos desvios: vermelho (avisar) e amarelo (aguardando). O contador usa a variante do Badge.
const COR_ALERTA = {
  vermelho: {
    coluna: "bg-destructive/10",
    icone: "text-destructive",
    anel: "border-destructive/40 inset-ring-[0.5px] inset-ring-destructive/40 bg-destructive/10 text-destructive",
    contador: "destructive",
  },
  amarelo: {
    coluna: "bg-warning/10",
    icone: "text-warning",
    anel: "border-warning/40 inset-ring-[0.5px] inset-ring-warning/40 bg-warning/15 text-warning",
    contador: "warning",
  },
  // Verde: o mesmo "success" do bloco "Cliente escolheu" da página do pedido.
  verde: {
    coluna: "bg-success/10",
    icone: "text-success",
    anel: "border-success/40 inset-ring-[0.5px] inset-ring-success/40 bg-success/10 text-success",
    contador: "secondary",
  },
  // Laranja (só borda de 1 px: o traço de 1,5 px é só de verde, amarelo e vermelho).
  laranja: {
    coluna: "bg-rastreio/10",
    icone: "text-rastreio",
    anel: "border-rastreio/40 bg-rastreio/10 text-rastreio",
    contador: "secondary",
  },
} as const

// Bolha do contador sobre o ícone (celular) e o contador da coluna (PC), por cor de alerta.
const BOLHA_ALERTA = {
  vermelho: "bg-destructive text-background",
  amarelo: "bg-warning text-warning-foreground",
  laranja: "bg-rastreio text-rastreio-foreground",
  verde: "bg-success text-success-foreground",
} as const

// Progresso da etapa no cartão ("3/5"), vindo das contagens da view.
function progressoDe(p: PedidoOperacao): string | null {
  switch (p.status) {
    case "novo":
    case "separacao":
    case "avisar_cliente":
    case "aguardando_cliente":
      return `${p.qtd_encontradas}/${p.qtd_linhas}`
    case "conferencia":
      return `${p.qtd_conferidas}/${p.qtd_encontradas}`
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
  // Arrastar o fundo do quadro com o mouse rola a esteira; os cartões continuam arrastáveis para mudar de etapa.
  const arrastarEsteira = useArrastarComMouse({ rolagem: (c) => c.querySelector("[data-slot=scroll-area-viewport]"), ignorar: "[draggable=true]" })
  const [params, setParams] = useSearchParams()
  const etapa = params.get("etapa")
  const soAtrasados = params.get("atrasados") === "1"
  // Filtro por pessoa (?pessoa=): "eu" (Comigo), "sem" (sem responsável) ou o id de alguém do time.
  const pessoa = params.get("pessoa")
  const membros = useEquipe().data ?? []
  const meuMembro = useMeuMembro()
  // A funcionária vê só os pedidos da etapa dela: sem filtro por pessoa e sem sincronizar com a Shopify.
  const gestor = useSouGestor() === true
  const [busca, setBusca] = useState("")
  const termo = useDebounce(busca, 300)
  const { data, isLoading, isError, isFetching, refetch } = usePedidosExpedicao(termo)
  const { data: contagens } = useContagens()
  const sincronizar = useSincronizarShopify()
  const agora = useAgora()
  const mudarStatus = useMudarStatus()
  const [arrastando, setArrastando] = useState<PedidoOperacao | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  // Arrastar um cartão move o pedido de etapa (com Desfazer): só para a próxima etapa ou para uma anterior.
  function soltar(c: Coluna) {
    const p = arrastando
    setArrastando(null)
    setAlvo(null)
    if (!p || (!c.decidiu && c.statuses.includes(p.status))) return
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

  // Pedido já postado (esperando só a mensagem de rastreio) não conta como atrasado.
  const atrasado = (p: PedidoOperacao) => p.status !== "enviar_rastreio" && p.prazo !== null && new Date(p.prazo).getTime() < agora

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const d = digitos(busca)
    return (data ?? []).filter(
      (p) =>
        !t ||
        p.numero.toLowerCase().includes(t) ||
        (p.cliente_nome ?? "").toLowerCase().includes(t) ||
        (d.length >= 3 && digitos(p.cliente_telefone).includes(d)),
    )
  }, [data, busca])

  // Pela pessoa que faz a etapa em que o pedido está agora.
  const daPessoa = (p: PedidoOperacao) => {
    if (!pessoa || (pessoa === "eu" && !meuMembro)) return true // "Comigo" sem cadastro: mostra tudo
    const resp = responsavelDaEtapaAtual(p, membros)
    if (pessoa === "sem") return !resp
    return !!resp && resp.id === (pessoa === "eu" ? meuMembro?.id : pessoa)
  }
  const dentro = (c: Coluna) =>
    filtrados
      .filter((p) => c.statuses.includes(p.status))
      .filter((p) => c.decidiu === undefined || p.cliente_decidiu === c.decidiu)
      .filter((p) => !soAtrasados || atrasado(p))
      .filter(daPessoa)
  const porColuna = COLUNAS.map((c) => ({ ...c, pedidos: dentro(c) }))
  // Sem busca, o total vem do banco (conta mesmo além do limite da lista); com busca, conta os da lista filtrada.
  const totalAtrasados = busca.trim() || !contagens ? filtrados.filter(atrasado).length : contagens.atrasados

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
          className="shrink-0 lg:h-8 data-[state=on]:border-destructive data-[state=on]:inset-ring-[0.5px] data-[state=on]:inset-ring-destructive data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive data-[state=on]:hover:bg-destructive/20 data-[state=on]:hover:text-destructive"
        >
          Atrasados <Badge variant={totalAtrasados ? "destructive" : "secondary"}>{totalAtrasados}</Badge>
        </Toggle>
        {gestor && (
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
        )}
      </div>

      {gestor && (
      <div className="flex items-center gap-2">
        {membros.length > 0 && (
          <Select value={!pessoa || (pessoa === "eu" && !meuMembro) ? "todos" : pessoa} onValueChange={(v) => atualizar({ pessoa: v === "todos" ? null : v })}>
            <SelectTrigger className="h-11 min-w-0 flex-1 sm:w-64 sm:flex-none lg:h-8" aria-label="Filtrar por pessoa">
              <Users className="text-muted-foreground" />
              <SelectValue className="flex-1 text-left" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {meuMembro && <SelectItem value="eu">Comigo ({meuMembro.nome})</SelectItem>}
              {membros
                .filter((m) => m.ativo || m.id === pessoa)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                    {m.ativo ? "" : " (inativo)"}
                  </SelectItem>
                ))}
              <SelectItem value="sem">Sem responsável</SelectItem>
            </SelectContent>
          </Select>
        )}
        {/* Atalho para editar as metas de tempo (no Time, que só o gestor abre). */}
        <Button asChild variant="outline" size="toque" className="w-11 shrink-0 px-0 sm:ml-auto lg:w-auto lg:px-2.5">
          <Link to="/time#metas" aria-label="Metas de tempo por etapa" title="Metas de tempo por etapa">
            <Thermometer /> <span className="hidden lg:inline">Metas</span>
          </Link>
        </Button>
      </div>
      )}

      {(data?.length ?? 0) >= LIMITE_LISTA && (
        <p className="text-xs text-muted-foreground">Mostrando os {LIMITE_LISTA} primeiros pedidos da expedição: pode haver mais. Use a busca para achar os outros.</p>
      )}

      {isError && <ErroConsulta aoTentar={() => void refetch()} carregando={isFetching} comDados={!!data} />}
      {(!isError || !!data) && <>
      {/* Celular: faixa da esteira, uma etapa por ícone ligada por linha. Toque filtra a lista. */}
      <div className="lg:hidden">
        <FaixaRolavel chave={selecionada}>
          <ol className="flex w-max items-start pt-2 pb-3" aria-label="Esteira">
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
                          className={cn("absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 tabular-nums", BOLHA_ALERTA[c.alerta])}
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
            {listaCelular.map((p) => (
              <CardPedido key={p.id} p={p} progresso={progressoDe(p)} />
            ))}
          </div>
        )}
      </div>

      {/* PC: quadro com uma coluna por etapa, na ordem da esteira. */}
      <div ref={esteiraRef} className="relative hidden lg:block" {...arrastarEsteira}>
      <ScrollArea className="w-full">
        <div className="flex w-max cursor-grab items-start gap-1 pb-4">
          {porColuna.map((c, i) => {
            const Icone = ICONE_ETAPA[c.icone]
            return (
              <Fragment key={c.id}>
                <section
                  aria-label={c.nome}
                  onDragOver={(e) => {
                    if (!arrastando) return
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
                      className={cn("ml-auto tabular-nums", (c.alerta === "laranja" || c.alerta === "verde") && c.pedidos.length > 0 && BOLHA_ALERTA[c.alerta])}
                    >
                      {c.pedidos.length}
                    </Badge>
                  </header>
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : c.pedidos.length === 0 ? (
                    <Vazio className="border-0 py-6 text-xs">Nenhum pedido</Vazio>
                  ) : (
                    c.pedidos.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", p.id)
                          setArrastando(p)
                        }}
                        onDragEnd={() => {
                          setArrastando(null)
                          setAlvo(null)
                        }}
                        className={cn("cursor-grab active:cursor-grabbing", arrastando?.id === p.id && "opacity-40")}
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
    </div>
  )
}
