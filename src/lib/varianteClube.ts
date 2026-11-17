// Variante das peças do Clube montada por partes (tamanho, cor, outra), no mesmo formato do site: "VERDE / N°20".
// Uma peça pode ter várias partes (cor e tamanho, por exemplo). Só texto: grava em pecas_clube.variante, como antes.
import { separarTamanho } from "@/lib/variante"

export type TipoParte = "tamanho" | "cor" | "outra"
export type ParteVariante = { tipo: TipoParte; valor: string }

export const TIPOS_PARTE: { valor: TipoParte; rotulo: string; exemplo: string }[] = [
  { valor: "tamanho", rotulo: "Tamanho", exemplo: "Ex.: 16 ou P" },
  { valor: "cor", rotulo: "Cor", exemplo: "Ex.: Verde" },
  { valor: "outra", rotulo: "Outra", exemplo: "Ex.: 5 mm" },
]

// Tamanho só com número vira "N°16" (como no site); "P", "Grande" ficam como foram escritos (depois em maiúsculas).
function tamanhoFormatado(t: string): string {
  const v = t.trim()
  return /^\d{1,2}$/.test(v) ? `N°${v}` : v
}

// Junta as partes como no site: em maiúsculas, tamanho por último ("VERDE / N°20"); as outras na ordem escrita.
export function montarVariante(partes: ParteVariante[]): string | null {
  const preenchidas = partes.filter((p) => p.valor.trim())
  const texto = [
    ...preenchidas.filter((p) => p.tipo !== "tamanho").map((p) => p.valor.trim()),
    ...preenchidas.filter((p) => p.tipo === "tamanho").map((p) => tamanhoFormatado(p.valor)),
  ]
    .join(" / ")
    .toLocaleUpperCase("pt-BR")
  return texto || null
}

// Próximo tipo sugerido ao adicionar uma parte: tamanho, depois cor, depois "outra".
export function proximoTipo(partes: ParteVariante[]): TipoParte {
  const usados = new Set(partes.map((p) => p.tipo))
  return usados.has("tamanho") ? (usados.has("cor") ? "outra" : "cor") : "tamanho"
}

// Variante gravada → partes do formulário (para editar). Tamanho reconhecido vira "Tamanho"; texto com número
// (ex.: "5 mm") vira "Outra"; o resto vira "Cor".
export function lerVariante(variante: string | null | undefined): ParteVariante[] {
  const v = (variante ?? "").trim()
  if (!v) return []
  return v.split(/\s*\/\s*/).filter(Boolean).map((parte): ParteVariante => {
    const { tamanho } = separarTamanho(parte)
    if (tamanho) return { tipo: "tamanho", valor: tamanho.match(/\d+/)?.[0] ?? tamanho }
    return { tipo: /\d/.test(parte) ? "outra" : "cor", valor: parte }
  })
}
