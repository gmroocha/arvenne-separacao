import { describe, expect, it, vi } from "vitest"
import { ehPacoteAntigo, haVersaoNova, lerPacotePublicado, pacoteDoHtml, recarregarUmaVez } from "@/lib/versaoNova"

// V65: depois de publicar, trocar de página numa aba antiga mostrava "Algo deu errado nesta tela".
describe("V65: pacote da versão antiga", () => {
  it("reconhece o erro de pacote que não existe mais", () => {
    expect(ehPacoteAntigo(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Expedicao-DkW_6ERe.js"))).toBe(true)
    expect(ehPacoteAntigo(new TypeError("Importing a module script failed."))).toBe(true)
    expect(ehPacoteAntigo(new Error("Cannot read properties of undefined"))).toBe(false)
  })

  it("recarrega uma vez e não entra em repetição", () => {
    const dados = new Map<string, string>()
    const guardado = { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => void dados.set(k, v) }
    const recarregar = vi.fn()
    expect(recarregarUmaVez(recarregar, guardado, 1_000_000)).toBe(true)
    expect(recarregarUmaVez(recarregar, guardado, 1_010_000)).toBe(false)
    expect(recarregarUmaVez(recarregar, guardado, 1_040_000)).toBe(true)
    expect(recarregar).toHaveBeenCalledTimes(2)
  })
})

describe("aba antiga sem erro: detecta o pacote novo", () => {
  const pagina = (hash: string) => `<html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script></head></html>`
  it("lê o pacote principal da página inicial", () => {
    expect(pacoteDoHtml(pagina("D49WoCSK"))).toBe("/assets/index-D49WoCSK.js")
    expect(pacoteDoHtml('<script type="module" src="/src/main.tsx"></script>')).toBeNull() // desenvolvimento
  })
  it("só há versão nova quando os dois pacotes são conhecidos e diferentes", () => {
    expect(haVersaoNova("/assets/index-A.js", "/assets/index-B.js")).toBe(true)
    expect(haVersaoNova("/assets/index-A.js", "/assets/index-A.js")).toBe(false)
    expect(haVersaoNova(null, "/assets/index-B.js")).toBe(false)
    expect(haVersaoNova("/assets/index-A.js", null)).toBe(false)
  })
  it("erro de rede ou resposta ruim não conta como versão nova", async () => {
    expect(await lerPacotePublicado((async () => new Response(pagina("X"))) as typeof fetch)).toBe("/assets/index-X.js")
    expect(await lerPacotePublicado((async () => new Response("", { status: 502 })) as typeof fetch)).toBeNull()
    expect(await lerPacotePublicado((async () => { throw new Error("rede") }) as typeof fetch)).toBeNull()
  })
})
