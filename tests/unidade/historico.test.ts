import { describe, expect, test } from "vitest"
import { agruparPorDia, categoriaEvento, descreverEvento, filtrarHistorico, horaDoEvento, montarHistorico, quemDoEmail, rotuloDia } from "@/lib/historico"
import type { Evento } from "@/lib/tipos"

const ev = (campos: Partial<Evento>): Evento => ({ id: 1, pedido_id: "p", item_id: null, tipo: "nota", de: null, para: null, texto: null, usuario_email: null, created_at: "2026-11-12T15:00:00-03:00", ...campos })
// Meio-dia em São Paulo de 12/11/2026.
const agora = new Date("2026-11-12T12:00:00-03:00")

describe("histórico do pedido", () => {
  test("quem: só a parte antes do @, sistema quando não há", () => {
    expect(quemDoEmail("gustavo@arvenne.com.br")).toBe("gustavo")
    expect(quemDoEmail(null)).toBe("sistema")
    expect(quemDoEmail("cliente")).toBe("cliente")
  })

  test("categorias: etapas, peças, troca e dinheiro, notas", () => {
    expect(categoriaEvento("status")).toBe("etapas")
    expect(categoriaEvento("postado")).toBe("etapas")
    expect(categoriaEvento("conferida")).toBe("pecas")
    expect(categoriaEvento("bipada")).toBe("pecas")
    expect(categoriaEvento("troca_concluida")).toBe("troca")
    expect(categoriaEvento("pago")).toBe("troca")
    expect(categoriaEvento("devolvido")).toBe("troca")
    expect(categoriaEvento("nota")).toBe("notas")
    expect(categoriaEvento("qualquer_coisa_nova")).toBe("outros")
  })

  test("evento de peça separa o SKU (mono) do resto", () => {
    const d = descreverEvento(ev({ tipo: "conferida", texto: "BRI-ESP-1 · Brinco Espiral · Prata", usuario_email: "ana@arvenne.com" }))
    expect(d).toMatchObject({ titulo: "Peça conferida", sku: "BRI-ESP-1", detalhe: "Brinco Espiral · Prata", quem: "ana", categoria: "pecas" })
  })

  test("quantidade e preço mostram de → para", () => {
    expect(descreverEvento(ev({ tipo: "qtd", de: "2", para: "1", texto: "AN-1 · Anel" })).detalhe).toBe("Anel · 2 → 1")
    expect(descreverEvento(ev({ tipo: "preco", de: "50", para: "45.5", texto: "AN-1" })).detalhe).toMatch(/^R\$\s*50,00 → R\$\s*45,50$/)
  })

  test("mudança de etapa usa os nomes das etapas", () => {
    const d = descreverEvento(ev({ tipo: "status", de: "novo", para: "conferencia" }))
    expect(d.titulo).toBe("Mudou de etapa")
    expect(d.detalhe).toBe("Novo → Conferência")
  })

  test("mudança de situação da peça concorda com o gênero", () => {
    expect(descreverEvento(ev({ tipo: "item", para: "encontrado", texto: "AN-1 · Anel" })).titulo).toBe("Peça encontrada")
    expect(descreverEvento(ev({ tipo: "item", para: "removido" })).titulo).toBe("Peça removida")
    expect(descreverEvento(ev({ tipo: "item", para: "falta" })).titulo).toBe("Peça em falta")
  })

  test("nota mantém o texto digitado", () => {
    expect(descreverEvento(ev({ tipo: "nota", texto: "Cliente pediu embrulho" }))).toMatchObject({ titulo: "Nota", detalhe: "Cliente pediu embrulho", categoria: "notas" })
  })

  test("evento desconhecido não quebra", () => {
    expect(descreverEvento(ev({ tipo: "troca_recebida" })).titulo).toBe("troca recebida")
  })

  test("Hoje, Ontem e data por extenso no fuso de São Paulo", () => {
    expect(rotuloDia("2026-11-12T01:00:00-03:00", agora)).toBe("Hoje")
    expect(rotuloDia("2026-11-11T23:30:00-03:00", agora)).toBe("Ontem")
    expect(rotuloDia("2026-11-10T10:00:00-03:00", agora)).toBe("10 de novembro")
    expect(rotuloDia("2025-12-25T10:00:00-03:00", agora)).toBe("25 de dezembro de 2025")
  })

  test("23h30 de São Paulo continua no dia certo (e não vira o dia seguinte em UTC)", () => {
    expect(rotuloDia("2026-11-12T02:30:00Z", agora)).toBe("Ontem") // 23h30 de 11/11 em São Paulo
  })

  test("hora em HH:mm de São Paulo", () => {
    expect(horaDoEvento("2026-11-12T18:05:00Z")).toBe("15:05")
  })

  test("agrupa por dia, do mais novo para o mais antigo", () => {
    const itens = montarHistorico([
      ev({ id: 1, tipo: "criado", para: "novo", created_at: "2026-11-10T10:00:00-03:00" }),
      ev({ id: 3, tipo: "nota", texto: "b", created_at: "2026-11-12T11:00:00-03:00" }),
      ev({ id: 2, tipo: "nota", texto: "a", created_at: "2026-11-11T09:00:00-03:00" }),
      ev({ id: 4, tipo: "nota", texto: "c", created_at: "2026-11-12T08:00:00-03:00" }),
    ])
    const grupos = agruparPorDia(itens, agora)
    expect(grupos.map((g) => g.rotulo)).toEqual(["Hoje", "Ontem", "10 de novembro"])
    expect(grupos[0].itens.map((i) => i.id)).toEqual([3, 4])
  })

  test("filtro por categoria", () => {
    const itens = montarHistorico([ev({ id: 1, tipo: "nota" }), ev({ id: 2, tipo: "troca_concluida" }), ev({ id: 3, tipo: "conferida" })])
    expect(filtrarHistorico(itens, "tudo")).toHaveLength(3)
    expect(filtrarHistorico(itens, "troca").map((i) => i.id)).toEqual([2])
    expect(filtrarHistorico(itens, "notas").map((i) => i.id)).toEqual([1])
    expect(filtrarHistorico(itens, "etapas")).toHaveLength(0)
  })
})
