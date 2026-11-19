import { describe, expect, it } from "vitest"
import { DOMINIO_INTERNO as dominioApp, emailDoLogin, emailInterno as emailApp, normalizarUsuario as normalizarApp, usuarioSugerido, usuarioValido as validoApp } from "../../src/lib/loginInterno"
import { DOMINIO_INTERNO as dominioEdge, emailInterno as emailEdge, normalizarUsuario as normalizarEdge, usuarioValido as validoEdge } from "../../supabase/functions/_shared/usuario"

const entradas = ["Ana Paula", "  JOÃO  ", "Mônica_Silva", "maria.jose-2", "Ça va?!", "ÀÉÎÕÜ", "a b c", "x", "", "Rê@Casa", "Zoë 99"]

describe("login por nome de usuário", () => {
  it("o app e a função Edge usam exatamente a mesma regra", () => {
    expect(dominioApp).toBe(dominioEdge)
    for (const e of entradas) {
      expect(normalizarApp(e)).toBe(normalizarEdge(e))
      expect(emailApp(e)).toBe(emailEdge(e))
      expect(validoApp(normalizarApp(e))).toBe(validoEdge(normalizarEdge(e)))
    }
  })

  it("normaliza: minúsculas, sem acento, sem espaço e só [a-z0-9._-]", () => {
    expect(normalizarApp("Ana Paula")).toBe("anapaula")
    expect(normalizarApp("  JOÃO  ")).toBe("joao")
    expect(normalizarApp("Mônica_Silva")).toBe("monica_silva")
    expect(normalizarApp("Rê@Casa!")).toBe("recasa")
  })

  it("monta o e-mail interno invisível", () => {
    expect(emailApp("Ana Paula")).toBe("anapaula@equipe.arvenne.invalid")
  })

  it("no login, sem @ vira e-mail interno e com @ fica como está", () => {
    expect(emailDoLogin(" Ana ")).toBe("ana@equipe.arvenne.invalid")
    expect(emailDoLogin("Joana.Silva")).toBe("joana.silva@equipe.arvenne.invalid")
    expect(emailDoLogin(" dono@exemplo.test ")).toBe("dono@exemplo.test")
  })

  it("o usuário precisa ter de 2 a 30 caracteres válidos", () => {
    expect(validoApp("ab")).toBe(true)
    expect(validoApp("a")).toBe(false)
    expect(validoApp("a".repeat(31))).toBe(false)
    expect(validoApp("ana paula")).toBe(false)
    expect(validoApp("Ana")).toBe(false)
  })

  it("sugere o primeiro nome sem acento", () => {
    expect(usuarioSugerido("Ana Paula Souza")).toBe("ana")
    expect(usuarioSugerido("  Zoë ")).toBe("zoe")
    expect(usuarioSugerido("")).toBe("")
  })
})
