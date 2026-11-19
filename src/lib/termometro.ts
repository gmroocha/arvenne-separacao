import type { Termometro } from "@/lib/tipos"

// Cores do termômetro (tokens do tema): o ponto ao lado do tempo e o traço de 1,5 px (--traco) do cartão. Verde, amarelo e
// vermelho são as únicas cores que usam o traço de 1,5 px; o cartão sem termômetro fica no cinza padrão de 1 px.
export const COR_TERMOMETRO: Record<Termometro, { ponto: string; traco: string; texto: string }> = {
  verde: { ponto: "bg-success", traco: "ring-(length:--traco) ring-success/50", texto: "dentro da meta" },
  amarelo: { ponto: "bg-warning", traco: "ring-(length:--traco) ring-warning/60", texto: "passou da meta" },
  vermelho: { ponto: "bg-destructive", traco: "ring-(length:--traco) ring-destructive/60", texto: "muito acima da meta" },
}

// Classe do cartão (anel de 1,5 px na cor do termômetro); vazia sem termômetro.
export const tracoDoTermometro = (t: Termometro | null | undefined) => (t ? COR_TERMOMETRO[t].traco : "")
