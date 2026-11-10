import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import {
  ArrowLeft, Check, ChevronDown, ExternalLink, MessageCircle, MoreHorizontal, Plus, TriangleAlert, X,
} from "lucide-react"
import AdicionarPecas from "@/components/AdicionarPecas"
import Foto from "@/components/Foto"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  useAdicionarItens, useAdicionarNota, useMudarStatus, useMudarStatusItem, useObservacaoItem, usePedido,
  useSalvarCampo, type PedidoDetalhe,
} from "@/lib/api"
import { textoParaAgente, textoRastreio } from "@/lib/agente"
import { linkWhatsApp, quando, reais } from "@/lib/formato"
import { ETAPAS, NOME_ETAPA, NOME_ITEM, proximaEtapa, tempoDesde, type StatusItem } from "@/lib/status"
import type { Evento, Item, NovoItem } from "@/lib/tipos"

function descreverEvento(e: Evento) {
  if (e.tipo === "nota") return e.texto ?? ""
  if (e.tipo === "criado") return "Pedido criado"
  if (e.tipo === "status")
    return `${NOME_ETAPA[e.de as keyof typeof NOME_ETAPA] ?? e.de} → ${NOME_ETAPA[e.para as keyof typeof NOME_ETAPA] ?? e.para}`
  return `Peça ${e.texto ?? ""} → ${NOME_ITEM[e.para as StatusItem] ?? e.para}`
}

function CartaoPeca({
  item, aoMarcar, aoRemover, aoRestaurar, aoTrocar,
}: {
  item: Item
  aoMarcar: (s: StatusItem) => void
  aoRemover: () => void
  aoRestaurar: () => void
  aoTrocar: () => void
}) {
  const removido = item.status === "removido"
  return (
    <Card className={removido ? "opacity-50" : ""}>
      <CardContent className="flex flex-col gap-3">
        <Foto url={item.foto_url} alt={item.nome} ampliar />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-sm">{item.sku ?? "sem código"}</div>
            <div className={`text-sm ${removido ? "line-through" : ""}`}>{item.nome}</div>
            {item.variante && <div className="text-sm font-medium">{item.variante}</div>}
            {item.observacao && <div className="text-xs text-muted-foreground">{item.observacao}</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {item.qtd > 1 && <Badge className="text-sm">{item.qtd}×</Badge>}
            {item.origem === "clube" && <Badge variant="outline">Clube</Badge>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Mais opções">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {removido ? (
                  <DropdownMenuItem onClick={aoRestaurar}>Restaurar</DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={aoTrocar}>Trocar por outra peça</DropdownMenuItem>
                    <DropdownMenuItem onClick={aoRemover}>Remover (cliente desistiu)</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {!removido && (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            className="w-full"
            value={item.status === "pendente" ? "" : item.status}
            onValueChange={(v) => aoMarcar((v || "pendente") as StatusItem)}
          >
            <ToggleGroupItem value="encontrado" className="h-11 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <Check /> Achei
            </ToggleGroupItem>
            <ToggleGroupItem value="falta" className="h-11 flex-1 data-[state=on]:bg-destructive data-[state=on]:text-white">
              <X /> Falta
            </ToggleGroupItem>
            <ToggleGroupItem value="defeito" className="h-11 flex-1 data-[state=on]:bg-destructive data-[state=on]:text-white">
              <TriangleAlert /> Defeito
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </CardContent>
    </Card>
  )
}

function Conteudo({ pedido }: { pedido: PedidoDetalhe }) {
  const navegar = useNavigate()
  const mudarStatus = useMudarStatus()
  const mudarItem = useMudarStatusItem(pedido)
  const obsItem = useObservacaoItem()
  const adicionarItens = useAdicionarItens()
  const salvar = useSalvarCampo()
  const nota = useAdicionarNota()
  const [adicionando, setAdicionando] = useState(false)
  const [trocando, setTrocando] = useState<Item | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [texto, setTexto] = useState("")
  const [rastreio, setRastreio] = useState(pedido.rastreio ?? "")
  const [obs, setObs] = useState(pedido.observacoes ?? "")

  const itens = [...pedido.pedido_itens].sort(
    (a, b) => Number(a.status === "removido") - Number(b.status === "removido") || a.ordem - b.ordem,
  )
  const vivos = itens.filter((i) => i.status !== "removido")
  const achados = vivos.filter((i) => i.status === "encontrado").length
  const faltas = vivos.filter((i) => i.status === "falta" || i.status === "defeito")
  const proxima = proximaEtapa(pedido.status)
  const wa = linkWhatsApp(pedido.cliente_telefone, "")

  const aoAdicionar = (novos: NovoItem[]) => {
    adicionarItens.mutate({ pedidoId: pedido.id, itens: novos })
    if (trocando) {
      const dados = novos[0]
      obsItem.mutate({
        itemId: trocando.id,
        status: "removido",
        observacao: `trocada por ${[dados.sku, dados.nome].filter(Boolean).join(" · ")}`,
      })
      setTrocando(null)
      setAdicionando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" asChild className="w-fit">
          <Link to="/">
            <ArrowLeft /> Pedidos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">#{pedido.numero.replace(/^#/, "")}</h2>
          <OrigemBadge origem={pedido.origem} />
          <StatusBadge status={pedido.status} />
          <span className="text-xs text-muted-foreground">há {tempoDesde(pedido.status_desde)}</span>
        </div>
        <div className="text-sm">
          <div className="font-medium">{pedido.cliente_nome ?? "Sem nome"}</div>
          {pedido.cliente_telefone &&
            (wa ? (
              <a className="underline underline-offset-4" href={wa} target="_blank" rel="noreferrer">
                {pedido.cliente_telefone}
              </a>
            ) : (
              pedido.cliente_telefone
            ))}
          {pedido.cliente_email && <div className="text-muted-foreground">{pedido.cliente_email}</div>}
          <div className="text-muted-foreground">{reais(pedido.valor_total)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pedido.shopify_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={pedido.shopify_url} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir na Shopify
              </a>
            </Button>
          )}
          {pedido.carrinho_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={pedido.carrinho_url} target="_blank" rel="noreferrer">
                <ExternalLink /> Link do carrinho
              </a>
            </Button>
          )}
        </div>
      </div>

      <ButtonGroup className="w-full sm:w-fit">
        <Button
          className="flex-1"
          disabled={!proxima || mudarStatus.isPending}
          onClick={() => proxima && mudarStatus.mutate({ pedidoId: pedido.id, para: proxima })}
        >
          {proxima ? `Avançar para ${NOME_ETAPA[proxima]}` : "Sem próxima etapa"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Mover para…" size="icon">
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ETAPAS.filter((e) => e.id !== "cancelado" && e.id !== pedido.status).map((e) => (
              <DropdownMenuItem key={e.id} onClick={() => mudarStatus.mutate({ pedidoId: pedido.id, para: e.id })}>
                Mover para {e.nome}
              </DropdownMenuItem>
            ))}
            {pedido.status !== "cancelado" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setCancelando(true)}>
                  Cancelar pedido
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      <div className="flex flex-col gap-1.5">
        <Progress value={vivos.length ? (achados / vivos.length) * 100 : 0} />
        <span className="text-sm text-muted-foreground">
          {achados} de {vivos.length} peças encontradas
        </span>
      </div>

      {faltas.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {faltas.length} {faltas.length === 1 ? "peça" : "peças"} em falta
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(textoParaAgente(pedido, itens))
                    .then(() => toast.success("Texto copiado"), () => toast.error("Não foi possível copiar"))
                }
              >
                Copiar para o agente
              </Button>
              {linkWhatsApp(pedido.cliente_telefone, "") && (
                <Button variant="outline" size="sm" asChild>
                  <a href={linkWhatsApp(pedido.cliente_telefone, "")!} target="_blank" rel="noreferrer">
                    <MessageCircle /> WhatsApp da cliente
                  </a>
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((i) => (
          <CartaoPeca
            key={i.id}
            item={i}
            aoMarcar={(s) => mudarItem.mutate({ item: i, para: s })}
            aoRemover={() => obsItem.mutate({ itemId: i.id, status: "removido", observacao: "cliente desistiu" })}
            aoRestaurar={() => obsItem.mutate({ itemId: i.id, status: "pendente", observacao: null })}
            aoTrocar={() => {
              setTrocando(i)
              setAdicionando(true)
            }}
          />
        ))}
      </div>
      <Button variant="outline" className="w-fit" onClick={() => setAdicionando(true)}>
        <Plus /> Adicionar peça
      </Button>

      <Field>
        <FieldLabel htmlFor="rastreio">Rastreio</FieldLabel>
        <Input
          id="rastreio"
          value={rastreio}
          onChange={(e) => setRastreio(e.target.value)}
          onBlur={() => rastreio !== (pedido.rastreio ?? "") && salvar.mutate({ pedidoId: pedido.id, campo: { rastreio: rastreio.trim() || null } })}
        />
      </Field>
      {pedido.origem === "whatsapp" && pedido.rastreio && linkWhatsApp(pedido.cliente_telefone, textoRastreio(pedido)) && (
        <Button variant="outline" className="w-fit" asChild>
          <a href={linkWhatsApp(pedido.cliente_telefone, textoRastreio(pedido))!} target="_blank" rel="noreferrer">
            <MessageCircle /> Enviar rastreio no WhatsApp
          </a>
        </Button>
      )}

      <Field>
        <FieldLabel htmlFor="obs">Observações</FieldLabel>
        <Textarea
          id="obs"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => obs !== (pedido.observacoes ?? "") && salvar.mutate({ pedidoId: pedido.id, campo: { observacoes: obs.trim() || null } })}
        />
      </Field>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            Histórico <ChevronDown />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 pt-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!texto.trim()) return
              nota.mutate({ pedidoId: pedido.id, texto: texto.trim() }, { onSuccess: () => setTexto("") })
            }}
          >
            <Input placeholder="Adicionar nota" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <Button type="submit" variant="outline">
              Adicionar
            </Button>
          </form>
          <ul className="flex flex-col gap-1.5 text-sm">
            {pedido.pedido_eventos.map((e) => (
              <li key={e.id}>
                <span className="text-muted-foreground">
                  {quando(e.created_at)} · {e.usuario_email ?? "sistema"} ·{" "}
                </span>
                {descreverEvento(e)}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <AdicionarPecas
        aberto={adicionando}
        aoMudar={(a) => {
          setAdicionando(a)
          if (!a) setTrocando(null)
        }}
        aoAdicionar={(novos) => {
          if (trocando) return aoAdicionar(novos)
          adicionarItens.mutate({ pedidoId: pedido.id, itens: novos })
        }}
      />

      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar pedido?</DialogTitle>
            <DialogDescription>O pedido sai das etapas abertas.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                mudarStatus.mutate({ pedidoId: pedido.id, para: "cancelado" })
                setCancelando(false)
                navegar("/")
              }}
            >
              Cancelar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function Pedido() {
  const { id } = useParams()
  const { data, isLoading, error } = usePedido(id)
  if (isLoading)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertDescription>Pedido não encontrado.</AlertDescription>
      </Alert>
    )
  return <Conteudo key={data.id} pedido={data} />
}
