import { ArrowRight, Check, HandCoins, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { useAcerto, useMarcarAcerto, useMarcarDevolvido } from "@/lib/api"
import { quando, reais } from "@/lib/formato"
import { COR_SELO } from "@/lib/selo"
import type { AcertoPeca } from "@/lib/tipos"

function Linha({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${forte ? "font-semibold" : ""}`}>
      <span className={forte ? "" : "text-muted-foreground"}>{rotulo}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  )
}

const sinal = (d: number) => (d > 0 ? `+${reais(d)}` : d < 0 ? `−${reais(-d)}` : reais(0))

function LinhaTroca({ p }: { p: AcertoPeca }) {
  // Todas as peças novas; banco antigo só tem `depois` (a primeira).
  const novas = p.depois_lista && p.depois_lista.length > 0 ? p.depois_lista : p.depois ? [{ ...p.depois, qtd: 0 }] : []
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        <span className="font-mono font-semibold">{p.antes.sku ?? p.antes.nome}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
        {novas.length === 0 ? (
          <span className="text-muted-foreground">crédito</span>
        ) : (
          novas.map((n, k) => (
            <span key={k} className="font-mono font-semibold">
              {n.qtd > 1 ? `${n.qtd}× ` : ""}
              {n.sku ?? n.nome}
              {k < novas.length - 1 ? " +" : ""}
            </span>
          ))
        )}
      </span>
      <span className="shrink-0 tabular-nums">{sinal(p.diferenca)}</span>
    </div>
  )
}

// Acerto de dinheiro depois da troca de peças: quanto pagou, cada troca, o saldo e se já foi acertado.
// Todos os valores vêm da view v_pedido_acerto.
// Peças tiradas depois do pagamento: dinheiro a devolver à cliente, mesmo sem troca.
function ADevolver({ pedidoId, valor }: { pedidoId: string; valor: number }) {
  const devolvido = useMarcarDevolvido()
  return (
    <Card size="sm" className="bg-amber-500/5 ring-amber-500/20">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="size-4" />
          <span>A devolver</span>
          <span className="tabular-nums">{reais(valor)}</span>
        </div>
        <Button className="h-10 text-sm" disabled={devolvido.isPending} onClick={() => devolvido.mutate({ pedidoId })}>
          {devolvido.isPending ? <Spinner /> : <Check />} Devolvido
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AcertoTroca({ pedidoId, aDevolver = 0 }: { pedidoId: string; aDevolver?: number | null }) {
  const { data: a } = useAcerto(pedidoId)
  const marcar = useMarcarAcerto()
  const devolver = aDevolver != null && aDevolver > 0 ? <ADevolver pedidoId={pedidoId} valor={aDevolver} /> : null
  if (!a || a.pecas.length === 0) return devolver

  const trocaId = a.troca_id
  const pendente = a.acerto_status === "pendente"
  const feito = a.acerto_status === "recebido" || a.acerto_status === "credito_registrado"
  const ajustar = (status: "recebido" | "credito_registrado" | "pendente") => trocaId && marcar.mutate({ trocaId, status })

  return (
    <>
    {devolver}
    <Card size="sm" className={pendente ? "bg-amber-500/5 ring-amber-500/20" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <HandCoins className="size-4" />
          <span className="min-w-0 flex-1">Acerto da troca</span>
          {pendente && (
            <Badge variant="secondary" className={`h-6 border-transparent px-2 text-xs font-medium ${COR_SELO.aguardando_cliente}`}>
              Pendente
            </Badge>
          )}
          {feito && (
            <Badge variant="secondary" className="h-6 px-2 text-xs font-medium">
              {a.acerto_status === "recebido" ? "Diferença recebida" : "Crédito registrado"}
            </Badge>
          )}
          {a.acerto_status === "sem_diferenca" && (
            <Badge variant="secondary" className="h-6 px-2 text-xs font-medium">
              Sem diferença
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Linha rotulo="Pago antes">{reais(a.valor_pago_original)}</Linha>
          {a.pecas.map((p) => (
            <LinhaTroca key={p.troca_peca_id} p={p} />
          ))}
          {(a.coberto ?? 0) > 0 && <Linha rotulo="A loja cobriu">−{reais(a.coberto ?? 0)}</Linha>}
          <Separator className="my-1" />
          <Linha rotulo="Novo total">{reais(a.novo_total)}</Linha>
          <Linha rotulo={a.saldo > 0 ? "Saldo a cobrar" : a.saldo < 0 ? "Saldo a favor da cliente" : "Saldo"} forte>
            {sinal(a.saldo)}
          </Linha>
        </div>

        {pendente && trocaId && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {a.saldo > 0 && (
              <Button className="h-10 w-full text-sm sm:w-auto" disabled={marcar.isPending} onClick={() => ajustar("recebido")}>
                {marcar.isPending ? <Spinner /> : <Check />} Diferença recebida
              </Button>
            )}
            {a.saldo < 0 && (
              <Button className="h-10 w-full text-sm sm:w-auto" disabled={marcar.isPending} onClick={() => ajustar("credito_registrado")}>
                {marcar.isPending ? <Spinner /> : <Check />} Crédito registrado
              </Button>
            )}
          </div>
        )}
        {feito && trocaId && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Marcado{a.acerto_por ? ` por ${a.acerto_por}` : ""}
              {a.acerto_em ? ` em ${quando(a.acerto_em)}` : ""}
            </span>
            <Button variant="ghost" size="sm" className="h-8" disabled={marcar.isPending} onClick={() => ajustar("pendente")}>
              <Undo2 /> Desfazer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}
