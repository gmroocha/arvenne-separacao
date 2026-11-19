import type { ComponentProps } from "react"
import { Link } from "react-router"
import Miniaturas from "@/components/Miniaturas"
import Prazo from "@/components/pedido/Prazo"
import TempoNaEtapa from "@/components/pedido/TempoNaEtapa"
import { SeloAcerto } from "@/components/SeloAcerto"
import AvatarMembro from "@/components/AvatarMembro"
import { useEquipe, useReembolsosPendentes } from "@/lib/api"
import { responsavelDaEtapaAtual } from "@/lib/equipe"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { quando, reais } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import type { Pedido, PedidoOperacao } from "@/lib/tipos"

// `resto` vai para o <li>: permite envolver a linha num menu de clique direito (asChild).
// `termometro` só vem da esteira (v_pedidos_operacao); as outras listas não têm e mostram só o tempo.
export default function LinhaPedido({ p, ...resto }: { p: Pedido & Partial<Pick<PedidoOperacao, "termometro">> } & ComponentProps<"li">) {
  const reembolsar = useReembolsosPendentes().data?.has(p.id) ?? false
  const membros = useEquipe().data ?? []
  const resp = p.fase === "expedicao" ? responsavelDaEtapaAtual(p, membros) : null
  const pecas = `${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`
  return (
    <li {...resto}>
    <Item variant="outline" asChild>
      <Link to={p.fase === "venda" ? `/vendas/${p.id}` : `/pedidos/${p.id}`}>
        <ItemMedia>
          <Miniaturas fotos={p.fotos} total={p.qtd_linhas} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            #{p.numero.replace(/^#/, "")} · {p.cliente_nome ?? "Sem nome"}
          </ItemTitle>
          <ItemDescription>
            {p.fase === "expedicao" ? (
              <>
                achadas <span className="tabular-nums">{p.qtd_encontradas}/{p.qtd_linhas}</span> · {pecas}
              </>
            ) : (
              <>
                {pecas} · <span className="font-semibold tabular-nums text-foreground">{reais(p.total)}</span>
              </>
            )}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full flex-wrap sm:w-auto">
          {p.fase === "expedicao" && (
            <>
              <StatusBadge status={p.status} somadaA={p.somada_a_numero} />
              {resp && <AvatarMembro nome={resp.nome} />}
              <Prazo prazo={p.status === "enviar_rastreio" ? null : p.prazo} horasUteis={p.prazo_horas_uteis} />
              <TempoNaEtapa status={p.status} desde={p.status_desde} termometro={p.termometro} />
              {p.acerto_pendente && <SeloAcerto devolver={(p.a_devolver ?? 0) > 0} />}
              {reembolsar && !p.acerto_pendente && <SeloAcerto reembolsar />}
            </>
          )}
          {p.fase === "venda" && <span className="text-xs text-muted-foreground">há {tempoDesde(p.status_desde)}</span>}
          {p.fase === "arquivo" && (
            <>
              <StatusBadge status={p.status} somadaA={p.somada_a_numero} />
              <OrigemBadge origem={p.origem} />
              {reembolsar && <SeloAcerto reembolsar />}
              <span className="text-xs text-muted-foreground">{quando(p.status_desde)}</span>
            </>
          )}
        </ItemActions>
      </Link>
    </Item>
    </li>
  )
}
