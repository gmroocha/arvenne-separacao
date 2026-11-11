import type { StatusPedido } from "@/lib/status"

// Cores suaves (sem borda) dos desvios da separação.
export const COR_SELO = {
  avisar_cliente: "bg-destructive/10 text-destructive",
  aguardando_cliente: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
} as const

export function ehDesvio(status: StatusPedido): status is keyof typeof COR_SELO {
  return status === "avisar_cliente" || status === "aguardando_cliente"
}

// Texto de aviso (âmbar), sem fundo: "sem opção", pendências.
export const COR_TEXTO_AVISO = "text-amber-700 dark:text-amber-300"
