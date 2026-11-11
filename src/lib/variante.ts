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

// Código do modelo de um grupo de tamanhos: o SKU sem o número final ("AN-CC-2-14" e "AN-CC-2-16" → "AN-CC-2").
// Se os SKUs não combinam, usa o primeiro.
export function codigoModelo(skus: (string | null | undefined)[]): string | null {
  const lista = skus.filter((s): s is string => !!s)
  if (lista.length === 0) return null
  const bases = lista.map((s) => s.replace(/[-_.\s]?\d+$/, ""))
  return bases.every((b) => b && b === bases[0]) ? bases[0] : lista[0]
}

// Junta variantes do mesmo modelo que só mudam de tamanho (mesmo produto, mesma pedra/cor, mesmo "extra" - ex.: preço).
// Variante sem tamanho fica sozinha (a foto muda de uma cor/pedra para outra). Mantém a ordem da primeira aparição.
export type GrupoTamanhos<T> = { chave: string; unica?: T; tamanhos: { item: T; tamanho: string }[] }

export function agruparPorTamanho<T>(itens: T[], ler: (t: T) => { id: string; produto: string; variante: string | null | undefined; extra?: string }): GrupoTamanhos<T>[] {
  const grupos: GrupoTamanhos<T>[] = []
  const porChave = new Map<string, GrupoTamanhos<T>>()
  for (const item of itens) {
    const { id, produto, variante, extra } = ler(item)
    const { tamanho } = separarTamanho(variante)
    if (!tamanho) {
      grupos.push({ chave: `v-${id}`, unica: item, tamanhos: [] })
      continue
    }
    const chave = `${chaveModelo(produto, variante)}|${extra ?? ""}`
    let g = porChave.get(chave)
    if (!g) {
      g = { chave, tamanhos: [] }
      porChave.set(chave, g)
      grupos.push(g)
    }
    g.tamanhos.push({ item, tamanho })
  }
  for (const g of grupos) g.tamanhos.sort((a, b) => numeroTamanho(a.tamanho) - numeroTamanho(b.tamanho))
  return grupos
}

// Código do modelo sem o tamanho: tira o número do tamanho do fim do SKU; se não bater, usa o prefixo comum.
export function codigoDoModelo(tamanhos: { sku: string | null | undefined; tamanho: string }[]): string {
  const sem = tamanhos.map(({ sku: s, tamanho }) => {
    const sku = s ?? ""
    const n = String(numeroTamanho(tamanho))
    return sku.endsWith(n) && sku.length > n.length ? sku.slice(0, -n.length) : sku
  })
  let p = sem[0] ?? ""
  for (const x of sem) while (p && !x.startsWith(p)) p = p.slice(0, -1)
  p = p.replace(/[-_ ./]+$/, "")
  return p || (tamanhos[0]?.sku ?? "sem código")
}
