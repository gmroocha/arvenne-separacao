import type { Item } from "@/lib/tipos"

// Etiqueta de 50 x 30 mm na Zebra ZD220 (203 dpi = 8 pontos por mm): 400 x 240 pontos.
export type Etiqueta =
  | { tipo: "peca"; sku: string; itemId?: string }
  | { tipo: "separador"; titulo: string; subtitulo: string }

export type GrupoEtiquetas = {
  numero: string
  cliente: string | null
  etiquetas: Etiqueta[]
  itemIds: string[] // peças do grupo, para marcar como etiquetadas depois
}

type ItemMin = Pick<Item, "id" | "sku" | "qtd">

// Uma etiqueta por unidade (qtd), na ordem do pedido. Peça sem SKU não tem o que imprimir: volta em semCodigo.
export function etiquetasDe<T extends ItemMin>(itens: T[]): { etiquetas: Etiqueta[]; semCodigo: T[]; itemIds: string[] } {
  const etiquetas: Etiqueta[] = []
  const semCodigo: T[] = []
  const itemIds: string[] = []
  for (const i of itens) {
    const sku = i.sku?.trim()
    if (!sku) {
      semCodigo.push(i)
      continue
    }
    itemIds.push(i.id)
    for (let n = 0; n < Math.max(1, i.qtd); n++) etiquetas.push({ tipo: "peca", sku, itemId: i.id })
  }
  return { etiquetas, semCodigo, itemIds }
}

// Etiqueta separadora de um pedido, no meio de um lote.
export function separadorDe(numero: string, cliente: string | null, quantidade: number): Etiqueta {
  return {
    tipo: "separador",
    titulo: numero,
    subtitulo: `${cliente ? `${cliente} · ` : ""}${quantidade} ${quantidade === 1 ? "etiqueta" : "etiquetas"}`,
  }
}

// Lote de vários pedidos: um separador antes de cada pedido. Com um pedido só, não precisa.
export function etiquetasDoLote(grupos: GrupoEtiquetas[]): Etiqueta[] {
  if (grupos.length <= 1) return grupos.flatMap((g) => g.etiquetas)
  return grupos.flatMap((g) => [separadorDe(g.numero, g.cliente, g.etiquetas.length), ...g.etiquetas])
}

export const ETIQUETA_TESTE: Etiqueta = { tipo: "peca", sku: "TESTE-123456" }

const LARGURA_UTIL = 352 // pontos: 400 menos 24 de cada lado

// Largura do Code 128 (conjunto B) em módulos: início 11 + 11 por caractere + verificador 11 + fim 13.
const modulosCode128 = (n: number) => 11 * (n + 3) + 2

// Módulo 2 (código mais grosso, lê melhor); se não couber, módulo 1.
export function moduloParaSku(sku: string): 1 | 2 {
  return modulosCode128(sku.length) * 2 > LARGURA_UTIL ? 1 : 2
}

// Cabe na etiqueta de 50 mm mesmo com módulo 1?
export function skuCabe(sku: string): boolean {
  return modulosCode128(sku.length) <= LARGURA_UTIL
}

// ^ e ~ são comandos do ZPL: vão em hexadecimal (^FH_ ativa o escape com "_").
function escapar(texto: string): string {
  return texto.replace(/[_^~]/g, (c) => `_${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
}

const corta = (t: string, max: number) => t.slice(0, max)

function zplEtiqueta(e: Etiqueta): string {
  if (e.tipo === "separador") {
    return [
      "^XA^CI28^PW400^LL240^LH0,0",
      "^FO0,0^GB400,14,14^FS",
      `^FO24,50^A0N,64,64^FH_^FD${escapar(corta(e.titulo, 11))}^FS`,
      `^FO24,130^A0N,32,32^FH_^FD${escapar(corta(e.subtitulo, 24))}^FS`,
      "^FO0,226^GB400,14,14^FS",
      "^XZ",
    ].join("")
  }
  const m = moduloParaSku(e.sku)
  return [
    "^XA^CI28^PW400^LL240^LH0,0",
    `^FO24,36^A0N,34,34^FH_^FDSKU: ${escapar(e.sku)}^FS`,
    `^FO24,90^BY${m},3,110^BCN,110,N,N,N^FH_^FD${escapar(e.sku)}^FS`,
    "^XZ",
  ].join("")
}

// ZPL de todas as etiquetas, uma depois da outra.
export function zpl(etiquetas: Etiqueta[]): string {
  return etiquetas.map(zplEtiqueta).join("\n")
}
