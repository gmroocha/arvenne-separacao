import { describe, expect, it, vi } from "vitest"
import { ehPacoteAntigo, recarregarUmaVez } from "@/lib/versaoNova"

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
