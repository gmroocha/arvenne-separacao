// Separa o tamanho do resto da variante da Shopify.
//   "N°12"              → { base: null,        tamanho: "N°12" }
//   "ABALONE / N°12"    → { base: "ABALONE",   tamanho: "N°12" }
//   "ZIRCÔNIA / 7MM"    → { base: "ZIRCÔNIA / 7MM", tamanho: null }   (mm é modelo, não tamanho de anel)
//   "AZUL"              → { base: "AZUL",      tamanho: null }
// Só texto: nenhum valor é calculado aqui.
const TAMANHO = /^(n[º°o.]?\s*\d{1,2}|\d{1,2}|tam(anho)?\.?\s*\d{1,2})$/i

export function separarTamanho(variante: string | null | undefined): { base: string | null; tamanho: string | null } {
  const v = (variante ?? "").trim()
  if (!v) return { base: null, tamanho: null }
  const partes = v.split(/\s*\/\s*/)
  const i = partes.findIndex((p) => TAMANHO.test(p))
  if (i < 0) return { base: v, tamanho: null }
  const resto = partes.filter((_, n) => n !== i)
  return { base: resto.length ? resto.join(" / ") : null, tamanho: partes[i] }
}

// Chave para juntar variantes do mesmo modelo que só mudam de tamanho (mesmo produto, mesma pedra/cor).
export const chaveModelo = (produto: string, variante: string | null | undefined) =>
  `${produto.trim().toLowerCase()}|${(separarTamanho(variante).base ?? "").toLowerCase()}`

// Ordena tamanhos pelo número (N°12 antes de N°9 não pode acontecer).
export const numeroTamanho = (t: string | null) => Number((t ?? "").match(/\d+/)?.[0] ?? 0)
