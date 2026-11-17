// Busca de peça dentro do pedido (etapas de peças): código, nome, variante e nota.
// Sem acento e sem diferença de maiúscula; várias palavras = todas precisam aparecer.
type PecaBuscavel = { sku?: string | null; nome?: string | null; variante?: string | null; nota?: string | null }

export const normalizarBusca = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()

export function combinaBusca(peca: PecaBuscavel, busca: string): boolean {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return true
  const texto = normalizarBusca([peca.sku, peca.nome, peca.variante, peca.nota].filter(Boolean).join(" "))
  // Código sem hífen também acha ("pu017" acha "PU017-Z").
  const semSinais = texto.replace(/[-_.\s/]/g, "")
  return termos.every((t) => texto.includes(t) || semSinais.includes(t.replace(/[-_.\s/]/g, "")))
}
