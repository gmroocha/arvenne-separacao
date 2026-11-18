import { describe, expect, it } from "vitest"
import { quemAvisar } from "../../src/lib/equipe"

const mel = { id: "m1", nome: "Mel", email: null, ativo: true, papel: "funcionaria" as const }
const ana = { id: "m2", nome: "Ana", email: "a@x.test", ativo: true, papel: "gestor" as const }
const saiu = { id: "m3", nome: "Rê", email: null, ativo: false, papel: "funcionaria" as const }

describe("quem avisar ao concluir uma etapa", () => {
  it("avisa a pessoa da próxima etapa", () => {
    expect(quemAvisar("conferencia", { conferencia: "m1" }, [mel, ana], "m2")).toEqual(mel)
  })
  it("não avisa quem acabou de concluir (a própria pessoa)", () => {
    expect(quemAvisar("conferencia", { conferencia: "m2" }, [mel, ana], "m2")).toBeNull()
  })
  it("sem responsável, sem pessoa inativa, sem etapa ou sem mapa: ninguém", () => {
    expect(quemAvisar("conferencia", { separacao: "m1" }, [mel], "m2")).toBeNull()
    expect(quemAvisar("conferencia", { conferencia: "m3" }, [saiu], null)).toBeNull()
    expect(quemAvisar(null, { conferencia: "m1" }, [mel], null)).toBeNull()
    expect(quemAvisar("conferencia", null, [mel], null)).toBeNull()
  })
  it("sem saber quem sou eu, avisa a pessoa da etapa", () => {
    expect(quemAvisar("bipagem", { bipagem: "m1" }, [mel], null)).toEqual(mel)
  })
})
