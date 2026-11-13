import { ArrowDown, HandCoins, Minus, UserMinus } from "lucide-react"
import { LinhaPeca } from "@/components/comum/Peca"
import RespDialog from "@/components/RespDialog"
import { Card, CardContent } from "@/components/ui/card"
import { quando, reais } from "@/lib/formato"
import { quemDoEmail } from "@/lib/historico"
import type { Alteracao } from "@/lib/tipos"
import { cn } from "@/lib/utils"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  alteracoes: Alteracao[]
  // Item (peça nova ou a que saiu) de onde a pessoa veio: a alteração dele vai para o topo, destacada.
  foco?: string | null
  semValores?: boolean
}

const TITULO: Record<Alteracao["tipo"], string> = { troca: "Troca", credito: "Crédito", removida: "Removida pela cliente", quantidade: "Quantidade reduzida" }

const Rotulo = ({ children }: { children: string }) => <span className="text-xs font-medium text-muted-foreground">{children}</span>

function Valor({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={cn("tabular-nums", forte && "font-medium")}>{children}</span>
    </div>
  )
}

// Valores prontos da view v_pedido_alteracoes: nada é somado aqui.
function Valores({ a }: { a: Alteracao }) {
  const linhas: React.ReactNode[] = []
  if (a.tipo === "troca") {
    if (a.diferenca > 0) linhas.push(<Valor key="d" rotulo="Diferença">{reais(a.diferenca)}</Valor>)
    if (a.coberto_loja > 0) linhas.push(<Valor key="c" rotulo="Arvenne cobriu">{reais(a.coberto_loja)}</Valor>)
    if (a.cliente_paga > 0) linhas.push(<Valor key="p" rotulo="Cliente paga" forte>{reais(a.cliente_paga)}</Valor>)
    if (a.credito > 0) linhas.push(<Valor key="cr" rotulo="Crédito" forte>{reais(a.credito)}</Valor>)
    if (!linhas.length) linhas.push(<Valor key="s" rotulo="Diferença">sem diferença</Valor>)
  } else if (a.tipo === "credito") {
    linhas.push(<Valor key="cr" rotulo="Crédito" forte>{reais(a.credito || a.valor)}</Valor>)
  } else {
    linhas.push(<Valor key="v" rotulo="Valor da peça">{reais(a.valor)}</Valor>)
    if (a.devolvido_em) linhas.push(<Valor key="dv" rotulo="Devolvido em">{quando(a.devolvido_em)}</Valor>)
    else if ((a.a_devolver ?? 0) > 0) linhas.push(<Valor key="ad" rotulo="A devolver" forte>{reais(a.a_devolver)}</Valor>)
  }
  return <div className="flex flex-col gap-1.5 border-t pt-3">{linhas}</div>
}

function Cartao({ a, semValores, destaque }: { a: Alteracao; semValores?: boolean; destaque?: boolean }) {
  const quem = a.por === "cliente" || (!a.por && a.escolhida_por === "cliente") ? "cliente" : a.por ? quemDoEmail(a.por) : null
  return (
    <Card size="sm" className={cn(destaque && "ring-primary/50")} data-alteracao={a.id}>
      <CardContent className="flex flex-col gap-3">
        <span className="text-sm font-medium">{TITULO[a.tipo]}</span>
        <div className="flex flex-col gap-1.5">
          <Rotulo>Sai do pedido</Rotulo>
          <LinhaPeca item={a.sai} tamanho="md" riscada esmaecida />
          <ArrowDown className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <Rotulo>{a.tipo === "troca" ? "Entra no lugar" : "Resultado"}</Rotulo>
          {a.tipo === "troca" && a.entra.length > 0 ? (
            a.entra.map((e) => <LinhaPeca key={e.item_id} item={e} tamanho="md" />)
          ) : (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm font-medium">
              {a.tipo === "credito" || a.tipo === "troca" ? <HandCoins className="size-5 shrink-0 text-muted-foreground" /> : a.tipo === "removida" ? <UserMinus className="size-5 shrink-0 text-muted-foreground" /> : <Minus className="size-5 shrink-0 text-muted-foreground" />}
              {a.tipo === "removida" ? "A cliente tirou esta peça" : a.tipo === "quantidade" ? "A cliente ficou com menos unidades" : "Vira crédito para a cliente"}
            </div>
          )}
        </div>
        {!semValores && <Valores a={a} />}
        {(a.em || quem) && <p className="text-xs text-muted-foreground">{[a.em ? quando(a.em) : null, quem].filter(Boolean).join(" · ")}</p>}
      </CardContent>
    </Card>
  )
}

// Peças que mudaram depois do pagamento, uma por cartão: "sai ↓ entra" e, embaixo, o dinheiro como o banco calculou.
export default function AlteracoesDialog({ aberto, aoMudar, alteracoes, foco, semValores }: Props) {
  const doFoco = (a: Alteracao) => !!foco && (a.sai.item_id === foco || a.entra.some((e) => e.item_id === foco))
  const ordenadas = [...alteracoes].sort((x, y) => Number(doFoco(y)) - Number(doFoco(x)))
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Peças trocadas e removidas" descricao="O que mudou no pedido depois do pagamento.">
      <div className="flex flex-col gap-3">
        {ordenadas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma alteração depois do pagamento.</p>}
        {ordenadas.map((a) => (
          <Cartao key={a.id} a={a} semValores={semValores} destaque={doFoco(a)} />
        ))}
      </div>
    </RespDialog>
  )
}
