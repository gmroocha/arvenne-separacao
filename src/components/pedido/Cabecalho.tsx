import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowLeft, ArrowLeftRight, MoreHorizontal } from "lucide-react"
import MenuAcoes from "@/components/MenuAcoes"
import { contarAlteracoes, useAlteracoesDoPedido } from "@/components/pedido/alteracoesContexto"
import { useAcoesPedido } from "@/components/pedido/useAcoesPedido"
import Prazo from "@/components/pedido/Prazo"
import { ehDesvio } from "@/lib/selo"
import SeloStatus from "@/components/SeloStatus"
import { OrigemBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import type { PedidoDetalhe } from "@/lib/api"
import { tempoNaEtapa } from "@/lib/status"

type Props = {
  pedido: PedidoDetalhe
  aoVerDados?: () => void // só nas etapas de foco, onde a lateral de dados some
  semValores?: boolean // etapas de peças: o diálogo das peças trocadas abre sem dinheiro
  children?: ReactNode // linha de etapas e busca: ficam dentro do bloco fixo, logo abaixo do nome
}

// Topo do pedido. A primeira linha (voltar, tempo na etapa e "⋯") rola com a página. O bloco de baixo (nome, número,
// linha de etapas e a busca com o responsável) fica preso no topo da tela enquanto se rola pelas peças.
export default function Cabecalho({ pedido, aoVerDados, semValores, children }: Props) {
  const { alteracoes, abrir } = useAlteracoesDoPedido()
  const { trocadas } = contarAlteracoes(alteracoes)
  const navegar = useNavigate()
  const { grupos, dialogos } = useAcoesPedido(pedido, { aoVerDados, aoCancelado: () => navegar("/") })
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 w-fit">
          <Link to={pedido.status === "enviado" ? "/concluidos" : pedido.fase === "arquivo" ? "/arquivo" : "/"}>
            <ArrowLeft /> {pedido.status === "enviado" ? "Concluídos" : pedido.fase === "arquivo" ? "Arquivo" : "Expedição"}
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-right text-xs text-muted-foreground">{tempoNaEtapa(pedido.status, pedido.status_desde)}</div>
          <MenuAcoes
            titulo="Ações do pedido"
            grupos={grupos}
            gatilho={
              <Button variant="outline" size="icon-toque" aria-label="Mais ações" className="shrink-0">
                <MoreHorizontal />
              </Button>
            }
          />
        </div>
      </div>
      <div className="sticky top-0 z-20 -mx-3 -mt-2 flex flex-col gap-2 border-b bg-background px-3 pt-2 pb-2 sm:-mx-4 sm:px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-heading text-xl leading-tight font-semibold sm:text-2xl">{pedido.cliente_nome ?? "Sem nome"}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{pedido.numero.replace(/^#/, "")}</span>
            <span aria-hidden>·</span>
            <OrigemBadge origem={pedido.origem} />
            {pedido.fase === "expedicao" && pedido.status !== "enviar_rastreio" && <Prazo prazo={pedido.prazo} horasUteis={pedido.prazo_horas_uteis} />}
            {alteracoes.length > 0 && abrir && (
              <Button variant="outline" size="xs" onClick={() => abrir({ comValores: !semValores })}>
                <ArrowLeftRight /> {trocadas > 0 ? "Peças trocadas" : "Peças alteradas"}
              </Button>
            )}
          </div>
          {/* Selo único: só no PC; no celular fica ao lado de "Etapa X de N". */}
          {ehDesvio(pedido.status) && <SeloStatus status={pedido.status} className="mt-1 hidden w-fit lg:inline-flex" />}
        </div>
        {children}
      </div>
      {dialogos}
    </>
  )
}
