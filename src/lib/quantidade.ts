// Quantidade digitada à mão: só os números valem, o resultado fica entre o mínimo e o máximo, e texto vazio ou
// inválido não muda nada (volta ao valor que estava).
export function quantidadeDigitada(texto: string, atual: number, min = 1, max?: number): number {
  const digitos = texto.replace(/\D/g, "")
  if (digitos === "") return atual
  const n = Number(digitos)
  if (!Number.isFinite(n)) return atual
  const dentro = Math.max(min, n)
  return max != null ? Math.min(max, dentro) : dentro
}
