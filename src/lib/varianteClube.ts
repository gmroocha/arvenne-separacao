// Variante das peças do Clube montada por tipo (tamanho, cor), no mesmo formato do site: "VERDE / N°20".
// Só texto: grava em pecas_clube.variante, como antes.
import { separarTamanho } from "@/lib/variante"

export type TipoVariante = "nenhuma" | "tamanho" | "cor" | "tamanho_cor" | "outra"
export type PartesVariante = { tipo: TipoVariante; tamanho: string; cor: string; outra: string }

export const TIPOS_VARIANTE: { valor: TipoVariante; rotulo: string }[] = [
  { valor: "nenhuma", rotulo: "Sem variante" },
  { valor: "tamanho", rotulo: "Tamanho" },
  { valor: "cor", rotulo: "Cor" },
  { valor: "tamanho_cor", rotulo: "Cor e tamanho" },
  { valor: "outra", rotulo: "Outra" },
]

// Tamanho só com número vira "N°16" (como no site); "P", "Grande" ficam como foram escritos.
function tamanhoFormatado(t: string): string {
  const v = t.trim()
  return /^\d{1,2}$/.test(v) ? `N°${v}` : v
}

export function montarVariante(p: PartesVariante): string | null {
  const tam = tamanhoFormatado(p.tamanho)
  const cor = p.cor.trim()
  const texto =
    p.tipo === "tamanho" ? tam : p.tipo === "cor" ? cor : p.tipo === "tamanho_cor" ? [cor, tam].filter(Boolean).join(" / ") : p.tipo === "outra" ? p.outra.trim() : ""
  return texto || null
}

// Variante gravada → partes do formulário (para editar). Texto sem tamanho reconhecível fica em "Outra".
export function lerVariante(variante: string | null | undefined): PartesVariante {
  const vazio = { tamanho: "", cor: "", outra: "" }
  const v = (variante ?? "").trim()
  if (!v) return { tipo: "nenhuma", ...vazio }
  const { base, tamanho } = separarTamanho(v)
  const num = (tamanho ?? "").match(/\d+/)?.[0] ?? tamanho ?? ""
  if (tamanho && base) return { ...vazio, tipo: "tamanho_cor", tamanho: num, cor: base }
  if (tamanho) return { ...vazio, tipo: "tamanho", tamanho: num }
  return { ...vazio, tipo: "outra", outra: v }
}
