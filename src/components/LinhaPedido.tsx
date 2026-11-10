import { Link } from "react-router"
import Foto from "@/components/Foto"
import Prazo from "@/components/pedido/Prazo"
import { OrigemBadge, StatusBadge } from "@/components/StatusBadge"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { quando, reais } from "@/lib/formato"
import { tempoDesde } from "@/lib/status"
import type { Pedido } from "@/lib/tipos"

export default function LinhaPedido({ p }: { p: Pedido }) {
  const pecas = `${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`
  const extras = Math.max(0, p.qtd_linhas - p.fotos.length)
  return (
    <Item variant="outline" asChild>
      <Link to={p.fase === "venda" ? `/vendas/${p.id}` : `/pedidos/${p.id}`}>
        <ItemMedia>
          <div className="flex items-center -space-x-2">
            {p.fotos.map((f, n) => (
              <Foto key={n} url={f} className="size-10 rounded-md ring-2 ring-background" />
            ))}
            {p.fotos.length === 0 && <Foto url={null} className="size-10 rounded-md" />}
            {extras > 0 && <span className="pl-3 text-xs text-muted-foreground">+{extras}</span>}
          </div>
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
              <StatusBadge status={p.status} />
              <Prazo prazo={p.prazo} horasUteis={p.prazo_horas_uteis} />
            </>
          )}
          {p.fase === "venda" && <span className="text-xs text-muted-foreground">há {tempoDesde(p.status_desde)}</span>}
          {p.fase === "arquivo" && (
            <>
              <StatusBadge status={p.status} />
              <OrigemBadge origem={p.origem} />
              <span className="text-xs text-muted-foreground">{quando(p.status_desde)}</span>
            </>
          )}
        </ItemActions>
      </Link>
    </Item>
  )
}
