import { Link } from "react-router"
import Miniaturas from "@/components/Miniaturas"
import Prazo from "@/components/pedido/Prazo"
import { SeloAcerto } from "@/components/SeloAcerto"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { quando, reais } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"

export default function LinhaPedido({ p }: { p: Pedido }) {
  const pecas = `${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`
  return (
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
              <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} />
              {p.acerto_pendente && <SeloAcerto devolver={(p.a_devolver ?? 0) > 0} />}
            </>
          )}
          {p.fase === "venda" && <span className="text-xs text-muted-foreground">há {tempoDesde(p.status_desde)}</span>}
          {p.fase === "arquivo" && (
            <>
              <StatusBadge status={p.status} somadaA={p.somada_a_numero} />
              <OrigemBadge origem={p.origem} />
              <span className="text-xs text-muted-foreground">{quando(p.status_desde)}</span>
            </>
          )}
        </ItemActions>
      </Link>
    </Item>
  )
}
