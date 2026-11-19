import type { Termometro } from "@/lib/tipos"

// Cores do termômetro (tokens do tema): o ponto ao lado do tempo e o traço de 1,5 px (--traco) do cartão. O contorno do
// cartão só aparece quando a meta foi passada (amarelo e vermelho); no verde (dentro da meta) o cartão fica no cinza padrão
// de 1 px e só o pontinho ao lado do tempo é verde. Sem termômetro (Fila, aguardando cliente) não há ponto nem contorno.
export const COR_TERMOMETRO: Record<Termometro, { ponto: string; traco: string; texto: string }> = {
  verde: { ponto: "bg-success", traco: "", texto: "dentro da meta" },
  amarelo: { ponto: "bg-warning", traco: "ring-(length:--traco) ring-warning/60", texto: "passou da meta" },
  vermelho: { ponto: "bg-destructive", traco: "ring-(length:--traco) ring-destructive/60", texto: "muito acima da meta" },
}

// Classe do cartão (anel de 1,5 px na cor do termômetro); vazia sem termômetro e no verde.
export const tracoDoTermometro = (t: Termometro | null | undefined) => (t ? COR_TERMOMETRO[t].traco : "")

// O banco já devolve nulo na Fila ('novo'); esta guarda cobre o app novo falando com o banco ainda sem a migration
// (que antes contava a Fila como Separação). O termômetro começa na Separação.
export const termometroDaEtapa = (status: string, t: Termometro | null | undefined): Termometro | null => (status === "novo" ? null : (t ?? null))
