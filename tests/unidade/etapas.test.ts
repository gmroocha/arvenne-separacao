import { expect, test } from "vitest"
import { avisoSemPecas, etapaCompleta, etapaDaPeca, pecasPorEtapa, pendenciasDaEtapa, separarAdicionais, statusPelasPecas } from "@/lib/etapa"
import { destinoAoConcluir, ETAPAS, etapaAtual, etapaDoResponsavel, FASE_DE, PASSOS, passoAtual, passoDe, passosDe, proximaEtapa, STATUS_DA_FASE } from "@/lib/status"
import type { Item } from "@/lib/tipos"

const peca = (campos: Partial<Item> = {}): Item => ({
  id: "peca", pedido_id: "pedido", origem: "avulso", nome: "Anel", sku: "AN-1", variante: null,
  shopify_variant_id: null, peca_clube_id: null, foto_url: null, qtd: 2, preco: 50, preco_pago: null,
  status: "encontrado", observacao: null, ordem: 1, conferido_em: null, etiquetado_em: null,
  etiqueta_previa: false, qtd_bipada: 0, bipado_em: null, removido_em: null, devolvido_em: null,
  reembolsado_shopify_em: null, shopify_line_id: null, adicional: false, venda_origem_id: null, valor_pago_linha: null, troca_peca_origem_id: null, entrada: null, nota: null,
  separado_por: null, conferido_por: null, bipado_por: null, falta_por: null,
  created_at: "2026-11-12T12:00:00Z", updated_at: "2026-11-12T12:00:00Z", ...campos,
})

test("cada status pertence a uma fase, sem pedido ficar escondido", () => {
  const todos = Object.values(STATUS_DA_FASE).flat()
  expect(new Set(todos).size).toBe(ETAPAS.length)
  expect(todos).toHaveLength(ETAPAS.length)
  for (const e of ETAPAS) expect(STATUS_DA_FASE[FASE_DE[e.id]]).toContain(e.id)
  expect(FASE_DE.somada).toBe("arquivo")
})
test("o fluxo normal não pula uma etapa", () => {
  expect(proximaEtapa("novo")).toBe("separacao")
  expect(destinoAoConcluir("novo")).toBe("conferencia") // a tela Novo já mostra Separação
  expect(proximaEtapa("conferencia")).toBe("bipagem")
  expect(proximaEtapa("bipagem")).toBe("faturamento")
  expect(proximaEtapa("enviado")).toBeNull()
  expect(proximaEtapa("aguardando_cliente")).toBe("separacao")
})
test("esteira sem Etiquetagem: Nota fiscal → Embalagem e frete → Postagem → Concluído", () => {
  expect(proximaEtapa("faturamento")).toBe("embalagem")
  expect(proximaEtapa("embalagem")).toBe("pronto_envio") // Embalagem e frete é uma etapa só
  // V107: pedido do WhatsApp passa por "Enviar rastreio"; o da Shopify vai direto para Concluído.
  expect(proximaEtapa("pronto_envio")).toBe("enviar_rastreio")
  expect(proximaEtapa("pronto_envio", "whatsapp")).toBe("enviar_rastreio")
  expect(proximaEtapa("pronto_envio", "shopify")).toBe("enviado")
  expect(proximaEtapa("enviar_rastreio")).toBe("enviado")
  expect(destinoAoConcluir("pronto_envio", "shopify")).toBe("enviado")
  expect(destinoAoConcluir("embalagem")).toBe("pronto_envio")
  expect(PASSOS.map((p) => p.id)).toEqual([
    "separacao", "conferencia", "bipagem", "faturamento", "embalagem", "pronto_envio", "enviar_rastreio", "enviado",
  ])
  expect(passosDe("shopify").map((p) => p.id)).toEqual([
    "separacao", "conferencia", "bipagem", "faturamento", "embalagem", "pronto_envio", "enviado",
  ])
  expect(passosDe("whatsapp")).toEqual(PASSOS)
  expect(passoAtual({ status: "enviado", origem: "shopify" })).toBe(6)
  expect(passoAtual({ status: "enviado", origem: "whatsapp" })).toBe(7)
  expect(passoAtual({ status: "enviar_rastreio", origem: "whatsapp" })).toBe(6)
  expect(passoAtual({ status: "enviar_rastreio", origem: "shopify" })).toBe(-1)
  expect(etapaDoResponsavel({ status: "enviar_rastreio", origem: "whatsapp" })).toBe("enviar_rastreio")
  expect(etapaDoResponsavel({ status: "enviado", origem: "whatsapp" })).toBeNull()
  expect(FASE_DE.enviar_rastreio).toBe("expedicao")
  expect(pendenciasDaEtapa("enviar_rastreio", [], {}).texto).toMatch(/mensagem de rastreio/)
  expect(pendenciasDaEtapa("enviar_rastreio", [], { rastreio_enviado_em: "2026-11-18T10:00:00Z" }).qtd).toBe(0)
  expect(PASSOS.at(-1)?.nome).toBe("Concluído")
  expect(PASSOS.find((p) => p.id === "faturamento")?.nome).toBe("Nota fiscal")
  expect(PASSOS.find((p) => p.id === "embalagem")?.nome).toBe("Embalagem e frete")
  expect(PASSOS.some((p) => (p.id as string) === "frete")).toBe(false)
  // A etapa antiga continua conhecida (histórico e banco ainda sem a migration) e vale como Embalagem e frete.
  expect(FASE_DE.frete).toBe("expedicao")
  expect(passoDe("frete")).toBe(passoDe("embalagem"))
  expect(proximaEtapa("frete")).toBe("pronto_envio")
})
test("peça pendente, inclusive adicional, impede completar conferência", () => {
  const pronta = peca({ conferido_em: "2026-11-12T12:00:00Z" })
  expect(etapaCompleta("conferencia", [pronta])).toBe(true)
  expect(etapaCompleta("conferencia", [pronta, peca({ id: "ad", status: "pendente", adicional: true, venda_origem_id: "venda" })])).toBe(false)
  expect(etapaCompleta("conferencia", [pronta, peca({ status: "removido" })])).toBe(true)
})
test("bipagem conta todas as unidades; nenhuma peça viva não é etapa feita", () => {
  const conferida = "2026-11-12T12:00:00Z"
  expect(etapaCompleta("bipagem", [peca({ conferido_em: conferida, qtd_bipada: 1 })])).toBe(false)
  expect(etapaCompleta("bipagem", [peca({ conferido_em: conferida, qtd_bipada: 2 })])).toBe(true)
  expect(etapaCompleta("separacao", [])).toBe(false)
})
test("as adicionais continuam na lista ao separar os grupos", () => {
  const a = peca(), b = peca({ id: "ad", adicional: true, venda_origem_id: "venda" })
  expect(separarAdicionais([a, b])).toEqual({ normais: [a], adicionais: [b] })
})

test("V18: pedido todo convertido em crédito explica como encerrar", () => {
  expect(avisoSemPecas([])).toBe("Este pedido ainda não tem peças.")
  expect(avisoSemPecas([{ status: "removido" }, { status: "removido" }])).toMatch(/cancele o pedido/)
  expect(avisoSemPecas([{ status: "removido" }, { status: "encontrado" }])).toBe("Nenhuma peça pendente.")
})

// V37: o desvio "avisar/aguardando cliente" mostra a etapa de onde o pedido veio.
test("V37: pedido em desvio conta como a etapa de origem; sem origem, como Separação", () => {
  const nome = (p: Parameters<typeof passoAtual>[0]) => PASSOS[passoAtual(p)].id
  expect(nome({ status: "avisar_cliente", etapa_antes_desvio: "conferencia" })).toBe("conferencia")
  expect(nome({ status: "aguardando_cliente", etapa_antes_desvio: "bipagem" })).toBe("bipagem")
  expect(nome({ status: "avisar_cliente", etapa_antes_desvio: "pronto_envio" })).toBe("pronto_envio")
  expect(nome({ status: "avisar_cliente", etapa_antes_desvio: null })).toBe("separacao")
  expect(nome({ status: "aguardando_cliente" })).toBe("separacao")
  expect(nome({ status: "avisar_cliente", etapa_antes_desvio: "enviado" })).toBe("separacao") // origem inválida
  expect(nome({ status: "avisar_cliente", etapa_antes_desvio: "lixo" })).toBe("separacao")
  // Fora do desvio vale o status (e a origem esquecida é ignorada).
  expect(nome({ status: "bipagem", etapa_antes_desvio: "conferencia" })).toBe("bipagem")
  expect(nome({ status: "novo" })).toBe("separacao")
  expect(passoAtual({ status: "cancelado" })).toBe(-1)
  expect(etapaAtual({ status: "avisar_cliente", etapa_antes_desvio: "conferencia" })).toBe("conferencia")
  expect(etapaAtual({ status: "aguardando_cliente" })).toBe("separacao")
  expect(etapaAtual({ status: "faturamento" })).toBe("faturamento")
})

test("cada peça anda sozinha e o pedido fica na etapa da peça mais atrasada", () => {
  const ok = "2026-11-12T12:00:00Z"
  expect(etapaDaPeca(peca({ status: "pendente" }))).toBe("separacao")
  expect(etapaDaPeca(peca())).toBe("conferencia")
  expect(etapaDaPeca(peca({ conferido_em: ok }))).toBe("bipagem")
  expect(etapaDaPeca(peca({ conferido_em: ok, qtd_bipada: 2 }))).toBe("pronta")
  expect(etapaDaPeca(peca({ status: "falta" }))).toBeNull()
  const lista = [peca({ id: "a", status: "pendente" }), peca({ id: "b" }), peca({ id: "c", conferido_em: ok })]
  expect(pecasPorEtapa(lista)).toEqual({ separacao: 1, conferencia: 1, bipagem: 1 })
  expect(statusPelasPecas("novo", lista)).toBe("separacao")
  expect(statusPelasPecas("novo", [peca({ status: "pendente" })])).toBe("novo")
  expect(statusPelasPecas("separacao", [peca({ id: "b" }), peca({ id: "c", conferido_em: ok })])).toBe("conferencia")
  expect(statusPelasPecas("conferencia", [peca({ conferido_em: ok })])).toBe("bipagem")
  expect(statusPelasPecas("bipagem", [peca({ conferido_em: ok, qtd_bipada: 2 })])).toBe("faturamento")
  expect(statusPelasPecas("separacao", [peca({ status: "falta" })])).toBeNull() // desvio: o banco decide
  expect(statusPelasPecas("faturamento", [peca()])).toBeNull() // documentos não são decididos pelas peças
  expect(statusPelasPecas("separacao", [])).toBeNull()
})

test("V95: o que 'Concluir etapa' vai marcar como feito, por etapa", () => {
  const itens = [peca({ id: "a", status: "pendente" }), peca({ id: "b", conferido_em: "2026-11-12T12:00:00Z" }), peca({ id: "c", status: "removido" }), peca({ id: "d", conferido_em: "2026-11-12T12:00:00Z", qtd_bipada: 2 })]
  expect(pendenciasDaEtapa("separacao", itens, {})).toEqual({ qtd: 1, texto: "1 peça ainda não foi achada" })
  expect(pendenciasDaEtapa("conferencia", itens, {})).toEqual({ qtd: 1, texto: "1 peça ainda não foi conferida" })
  expect(pendenciasDaEtapa("bipagem", itens, {})).toEqual({ qtd: 2, texto: "2 peças ainda não foram bipadas" })
  expect(pendenciasDaEtapa("separacao", [itens[1]], {})).toEqual({ qtd: 0, texto: "" })
  expect(pendenciasDaEtapa("faturamento", itens, { nf_emitida_em: "x" }).texto).toBe("Ainda falta marcar o pedido LR")
  expect(pendenciasDaEtapa("faturamento", itens, {}).texto).toBe("Ainda falta marcar a nota fiscal e o pedido LR")
  expect(pendenciasDaEtapa("faturamento", itens, { nf_emitida_em: "x", pedido_fornecedor_em: "x" })).toEqual({ qtd: 0, texto: "" })
  expect(pendenciasDaEtapa("embalagem", itens, {})).toEqual({ qtd: 2, texto: "Ainda falta marcar a embalagem e o frete" })
  expect(pendenciasDaEtapa("embalagem", itens, { embalado_em: "x" }).texto).toBe("Ainda falta marcar o frete")
  expect(pendenciasDaEtapa("embalagem", itens, { frete_gerado_em: "x" }).texto).toBe("Ainda falta marcar a embalagem")
  expect(pendenciasDaEtapa("embalagem", itens, { embalado_em: "x", frete_gerado_em: "x" })).toEqual({ qtd: 0, texto: "" })
  expect(pendenciasDaEtapa("pronto_envio", itens, { postado_em: "x" }).qtd).toBe(0)
})
