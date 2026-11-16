// Depois de publicar uma versão nova, uma aba aberta ainda pede os pacotes da versão antiga, que já não existem
// (o servidor devolve a página em vez do código). Nesse caso a solução é recarregar: faz isso sozinho, uma vez.
const CHAVE = "versao-nova:recarregou-em"
const INTERVALO_MS = 30_000

export function ehPacoteAntigo(erro: unknown): boolean {
  const texto = erro instanceof Error ? `${erro.name} ${erro.message}` : String(erro)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(texto)
}

type Armazenamento = Pick<Storage, "getItem" | "setItem">

// Devolve true se vai recarregar. Não repete em menos de 30 s (se o problema for outro, mostra o erro).
export function recarregarUmaVez(
  recarregar: () => void = () => window.location.reload(),
  guardado: Armazenamento | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage,
  agora = Date.now(),
): boolean {
  try {
    if (!guardado) return false
    const ultimo = Number(guardado.getItem(CHAVE) ?? 0)
    if (agora - ultimo < INTERVALO_MS) return false
    guardado.setItem(CHAVE, String(agora))
  } catch {
    return false
  }
  recarregar()
  return true
}
