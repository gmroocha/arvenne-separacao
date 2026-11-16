import { describe, expect, it } from "vitest"
import { categoriaDoNome, paraBusca } from "@/lib/categoria"

describe("categoria pelo nome da peça", () => {
  it.each([
    ["ANEL PEDRA LOSANGO ARREDONDADO", "Anel"],
    ["MEIA ALIANÇA COM PEDRAS 3MM", "Anel"],
    ["BRINCO PONTO DE LUZ REDONDO", "Brinco"],
    ["EAR CUFF BOLINHAS", "Brinco"],
    ["PIERCING FAKE 7 LINHAS", "Piercing"],
    ["CHOKER CHAPA REDONDA", "Colar"],
    ["colar placa das minhas cicatrizes", "Colar"],
    ["PINGENTE CORUJA LISA", "Pingente"],
    ["PULSEIRA CORAÇÕES ZIRCÔNIA", "Pulseira"],
    ["CONJUNTO CORAÇÃO CRAVEJADO", "Conjunto"],
    ["LIMPA PRATAS MONZI", "Outros"],
    ["ANELZINHO", "Outros"],
    [null, "Outros"],
  ])("%s → %s", (nome, esperado) => {
    expect(categoriaDoNome(nome)).toBe(esperado)
  })

  it("busca ignora acento e caixa", () => {
    expect(paraBusca("Zircônia")).toBe("zirconia")
  })
})
