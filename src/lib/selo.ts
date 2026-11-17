import type { SituacaoCredito } from "@/lib/tipos"
import type { StatusPedido } from "@/lib/status"

// Cores suaves (sem borda) dos desvios da separação.
export const COR_SELO = {
  avisar_cliente: "bg-destructive/10 text-destructive",
  aguardando_cliente: "bg-warning/15 text-warning",
} as const

export function ehDesvio(status: StatusPedido): status is keyof typeof COR_SELO {
  return status === "avisar_cliente" || status === "aguardando_cliente"
}

// Texto de aviso (âmbar), sem fundo: "sem opção", pendências.
export const COR_TEXTO_AVISO = "text-warning"

// Seleção de PAC (laranja) e SEDEX (verde): fundo tingido, borda e texto na cor. Vencem o "ligado" primário do Toggle.
export const COR_PAC =
  "data-[state=on]:border-pac data-[state=on]:bg-pac/15 data-[state=on]:text-pac data-[state=on]:hover:bg-pac/20 data-[state=on]:hover:text-pac"
export const COR_SEDEX =
  "data-[state=on]:border-sedex data-[state=on]:bg-sedex/15 data-[state=on]:text-sedex data-[state=on]:hover:bg-sedex/20 data-[state=on]:hover:text-sedex"

// Selo do crédito registrado: reembolso pendente fica em amarelo até alguém marcar "Reembolsado".
export const ROTULO_CREDITO: Record<SituacaoCredito, string> = {
  reembolso_pendente: "Reembolso pendente",
  reembolsado: "Reembolsado",
  credito_guardado: "Crédito guardado",
  credito_usado: "Crédito usado",
}
