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

// ---------------------------------------------------------------------------------------------------------------
// Versão nova publicada com a aba aberta e SEM erro de pacote: a aba continua com o código antigo na memória.
// De tempos em tempos lê a página inicial, compara o pacote principal e, se mudou e não há nada sendo salvo,
// recarrega sozinha (uma vez, pelo mesmo cuidado do recarregarUmaVez).
// ---------------------------------------------------------------------------------------------------------------
export const PACOTE_ATUAL = typeof document === "undefined" || !document.documentElement ? null : pacoteDoHtml(document.documentElement.outerHTML)

// Nome do pacote principal ("/assets/index-D49WoCSK.js") dentro do HTML da página inicial; nulo se não achar.
export function pacoteDoHtml(html: string): string | null {
  return html.match(/<script[^>]*type="module"[^>]*src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1] ?? html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"[^>]*type="module"/)?.[1] ?? null
}

export const haVersaoNova = (atual: string | null, publicada: string | null) => !!atual && !!publicada && atual !== publicada

// Lê a página inicial publicada. Erro de rede não é versão nova.
export async function lerPacotePublicado(buscar: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await buscar("/", { cache: "no-store", headers: { accept: "text/html" } })
    return r.ok ? pacoteDoHtml(await r.text()) : null
  } catch {
    return null
  }
}
