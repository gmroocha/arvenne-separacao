// Sincronização da Shopify em partes. A função Edge tem teto de tempo: quando não termina, devolve
// "incompleto" e de onde continuar. V25: o app segue chamando a partir desse ponto (até um limite) e
// avisa se ainda assim faltou, em vez de anunciar "Nenhum pedido novo".
export type RespostaSync = {
  importados: number
  erros?: { numero: string; erro: string }[]
  incompleto?: boolean
  continuar?: string | null
}
export type ResultadoSync = { importados: number; erros: { numero: string; erro: string }[]; incompleto: boolean; partes: number }

export async function sincronizarEmPartes(chamar: (corpo: { continuar?: string }) => Promise<RespostaSync>, maxPartes = 4): Promise<ResultadoSync> {
  const total: ResultadoSync = { importados: 0, erros: [], incompleto: false, partes: 0 }
  let continuar: string | undefined
  do {
    const r = await chamar(continuar ? { continuar } : {})
    total.partes++
    total.importados += r.importados ?? 0
    total.erros.push(...(r.erros ?? []))
    total.incompleto = Boolean(r.incompleto)
    continuar = r.incompleto && r.continuar ? r.continuar : undefined
  } while (continuar && total.partes < maxPartes)
  return total
}
