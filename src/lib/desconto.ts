import type { DescontoShopify, Pedido } from "@/lib/tipos"

type Campos = Pick<Pedido, "descontos" | "desconto_tipo" | "desconto_valor" | "desconto_percentual" | "cupom" | "desconto_codigos">

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`

function motivoShopify(d: DescontoShopify): string | null {
  if (d.tipo === "code") return `cupom ${d.codigo ?? d.rotulo ?? ""}`.trim()
  if (d.tipo === "automatic") return d.titulo ?? "automático"
  if (d.tipo === "manual") return d.titulo ? `manual: ${d.titulo}` : "manual"
  return d.titulo ?? d.rotulo ?? null
}

// Texto da linha de desconto dos dados do pedido: "Desconto · 25%" e o motivo ("cupom PIX25", "automático").
// Só texto: o valor em reais e o percentual de reserva vêm prontos do banco (v_pedidos).
export function rotuloDesconto(p: Campos): { base: string; motivo: string | null } {
  const lista = p.descontos ?? []
  const unico = lista.length === 1 ? lista[0].percentual : null
  const percentual =
    unico ?? (p.desconto_tipo === "percentual" && p.desconto_valor != null ? p.desconto_valor : null) ?? p.desconto_percentual ?? null
  const motivos = lista.map(motivoShopify).filter((m): m is string => !!m)
  const codigos = (p.desconto_codigos ?? []).filter(Boolean)
  const motivo = motivos.length
    ? motivos.join(", ")
    : codigos.length
      ? `cupom ${codigos.join(", ")}`
      : p.cupom
        ? `cupom ${p.cupom}`
        : null
  return { base: percentual != null && percentual > 0 ? `Desconto · ${pct(percentual)}` : "Desconto", motivo }
}
