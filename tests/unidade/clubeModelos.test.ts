import { describe, expect, it } from "vitest"
import {
  agruparClube, codigoDaLinha, codigoSugerido, enviarEmParalelo, errosDoProduto, novaLinhaVariante, rotulosDeVariantes, sufixoDaVariante, variantesParaSalvar,
} from "../../src/lib/clubeModelos"
import type { ModeloClube } from "../../src/lib/tipos"

const modelo = (id: string, extra: Partial<ModeloClube> = {}): ModeloClube => ({ id, nome: "Anel", foto_url: null, codigo_base: "AN", preco: 10, ativo: true, created_at: "2026-11-18T10:00:00Z", ...extra })
const peca = (id: string, variante: string | null, modelo_id: string | null) => ({ id, variante, modelo_id })

describe("V110: código sugerido da variante", () => {
  it("BASE-SUFIXO: tamanho vira só o número e a cor perde o acento", () => {
    expect(sufixoDaVariante([{ tipo: "tamanho", valor: "16" }])).toBe("16")
    expect(sufixoDaVariante([{ tipo: "cor", valor: "Zircônia azul" }, { tipo: "tamanho", valor: "N°14" }])).toBe("ZIRCONIAAZUL-14")
    expect(codigoSugerido("AN-SOL", [{ tipo: "tamanho", valor: "16" }])).toBe("AN-SOL-16")
    expect(codigoSugerido("AN-SOL", [])).toBe("")
    expect(codigoSugerido("", [{ tipo: "tamanho", valor: "16" }])).toBe("")
  })
  it("o código digitado à mão vale mais que o sugerido", () => {
    const l = { ...novaLinhaVariante([{ tipo: "tamanho", valor: "14" }]) }
    expect(codigoDaLinha("AN", l)).toBe("AN-14")
    expect(codigoDaLinha("AN", { ...l, codigoManual: " ESPECIAL " })).toBe("ESPECIAL")
  })
  it("variantes para salvar: preço vazio fica nulo (o banco usa o do pai) e o id acompanha", () => {
    const l = { ...novaLinhaVariante([{ tipo: "tamanho", valor: "14" }]), id: "x1" }
    expect(variantesParaSalvar("AN", [l, { ...novaLinhaVariante([{ tipo: "tamanho", valor: "16" }]), preco: "99,90" }])).toEqual([
      { id: "x1", codigo: "AN-14", variante: "N°14", preco: null },
      { codigo: "AN-16", variante: "N°16", preco: 99.9 },
    ])
  })
})

describe("V111: validação das linhas antes de salvar", () => {
  const l14 = novaLinhaVariante([{ tipo: "tamanho", valor: "14" }])
  it("pede código e nome e aceita o produto completo", () => {
    expect(errosDoProduto({ codigo: "", nome: "", preco: "", linhas: [] })).toEqual(["Informe o código", "Informe o nome"])
    expect(errosDoProduto({ codigo: "AN", nome: "Anel", preco: "10,00", linhas: [l14] })).toEqual([])
  })
  it("marca preço ilegível, variante sem nada e código repetido", () => {
    expect(errosDoProduto({ codigo: "AN", nome: "Anel", preco: "abc", linhas: [] })).toEqual(["Preço não entendido"])
    expect(errosDoProduto({ codigo: "AN", nome: "Anel", preco: "", linhas: [novaLinhaVariante()] })).toEqual(["Informe o código da variante"])
    expect(errosDoProduto({ codigo: "AN", nome: "Anel", preco: "", linhas: [{ ...novaLinhaVariante(), codigoManual: "AN-X" }] })).toEqual(["Informe a variante (tamanho, cor...)"])
    const repetida = { ...novaLinhaVariante([{ tipo: "cor", valor: "ouro" }]), codigoManual: "an-14" }
    expect(errosDoProduto({ codigo: "AN", nome: "Anel", preco: "", linhas: [l14, repetida] })).toEqual(["O código an-14 se repete nas variantes"])
  })
})

describe("V110: agrupar o Clube por produto", () => {
  it("junta as variantes pelo modelo_id, deixa peça solta sozinha e ordena pelo tamanho", () => {
    const m = [modelo("m1"), modelo("m2", { codigo_base: "BR", nome: "Brinco" })]
    const g = agruparClube([peca("a", "N°16", "m1"), peca("b", null, null), peca("c", "N°9", "m1"), peca("d", "DOURADO", "m2"), peca("e", "PRATA", "m2")], m)
    expect(g.map((x) => [x.chave, x.pecas.map((p) => p.id), x.modelo?.codigo_base ?? null])).toEqual([
      ["m1", ["c", "a"], "AN"], // N°9 antes de N°16
      ["b", ["b"], null],
      ["m2", ["d", "e"], "BR"], // sem tamanho: ordem alfabética
    ])
  })
  it("produto que não veio na lista de modelos (desativado ou antigo) ainda agrupa", () => {
    const g = agruparClube([peca("a", "N°14", "x"), peca("b", "N°16", "x")], [])
    expect(g).toHaveLength(1)
    expect(g[0].modelo).toBeNull()
    expect(g[0].pecas).toHaveLength(2)
  })
  it("rótulo do botão: o tamanho; com tamanhos repetidos (cores diferentes), a variante inteira", () => {
    expect(rotulosDeVariantes(["N°14", "N°16"])).toEqual(["N°14", "N°16"])
    expect(rotulosDeVariantes(["VERDE / N°14", "AZUL / N°14"])).toEqual(["VERDE / N°14", "AZUL / N°14"])
    expect(rotulosDeVariantes(["DOURADO", "PRATA", null])).toEqual(["DOURADO", "PRATA", "—"])
  })
})

describe("V111: envio de fotos em paralelo", () => {
  it("nunca passa de 3 ao mesmo tempo, mantém a ordem e um erro não derruba os outros", async () => {
    let emVoo = 0
    let maximo = 0
    const eventos: string[] = []
    const r = await enviarEmParalelo(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        emVoo++
        maximo = Math.max(maximo, emVoo)
        await new Promise((ok) => setTimeout(ok, 5 + (n % 3)))
        emVoo--
        if (n === 4) throw new Error("falhou")
        return n * 10
      },
      { limite: 3, aoMudar: (i, estado) => eventos.push(`${i}:${estado}`) },
    )
    expect(maximo).toBe(3)
    expect(r.map((x) => (x.ok ? x.valor : "erro"))).toEqual([10, 20, 30, "erro", 50, 60, 70])
    expect(eventos.filter((e) => e.endsWith(":enviando"))).toHaveLength(7)
    expect(eventos).toContain("3:erro")
  })
  it("lista vazia e limite maior que a lista funcionam", async () => {
    expect(await enviarEmParalelo([], async () => 1)).toEqual([])
    expect((await enviarEmParalelo([1], async (n) => n, { limite: 5 }))[0]).toEqual({ ok: true, valor: 1 })
  })
})
