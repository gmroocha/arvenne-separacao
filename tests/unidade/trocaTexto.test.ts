import { expect, test } from "vitest"
import { mensagemTroca } from "@/lib/agente"
import { COBRIR_TUDO, cobreTudo, fraseDiferencaCarrinho, fraseSituacao, rotuloPagamento, textoSituacao, valorPagoPeca } from "@/lib/trocaTexto"
import type { Item, Pedido, TrocaValor, TrocaPeca } from "@/lib/tipos"

const valor = (campos: Partial<TrocaValor>): TrocaValor => ({
  troca_peca_id: "p", troca_id: "t", pedido_id: "pedido", item_id: "item", opcao_id: null,
  tipo: "credito", qtd: 2, valor_pago_item: 80, valor_opcao: 0, diferenca: -80, situacao: "credito", ...campos,
})
test("texto apresenta a diferença recebida do banco sem somar novamente a quantidade", () => {
  expect(textoSituacao(valor({ situacao: "paga_diferenca", diferenca: 40 }))).toMatch(/^\+R\$\s*40,00 a pagar$/)
  expect(fraseSituacao(valor({}))).toMatch(/^cliente fica com R\$\s*80,00 de crédito$/)
  expect(fraseDiferencaCarrinho(0)).toBe("sem diferença")
  expect(textoSituacao(undefined)).toBe("calculando…")
})
test("valor pago da peça usa a linha de crédito da view", () => {
  const peca = { valores: [valor({ tipo: "opcao", valor_pago_item: 999 }), valor({})] } as TrocaPeca
  expect(valorPagoPeca(peca)).toBe(80)
})

// V38: a loja cobre a diferença; o rótulo nunca mostra a diferença bruta como se a cliente pagasse.
test("V38: 'cobrir tudo' é o máximo do banco e só ele conta como tudo", () => {
  expect(COBRIR_TUDO).toBe(99999999.99)
  expect(cobreTudo(COBRIR_TUDO)).toBe(true)
  expect(cobreTudo(99999999)).toBe(true)
  expect(cobreTudo(15)).toBe(false)
  expect(cobreTudo(0)).toBe(false)
  expect(cobreTudo(null)).toBe(false)
  expect(cobreTudo(undefined)).toBe(false)
})
test("V38: rótulo mostra o que a Arvenne cobre e o que a cliente paga, com os valores do banco", () => {
  expect(rotuloPagamento({ diferenca: 0.68, coberto: 0.68, clientePaga: 0 })).toMatch(/^Arvenne cobre R\$\s*0,68$/)
  expect(rotuloPagamento({ diferenca: 40, coberto: 15, clientePaga: 25 })).toMatch(/^Arvenne cobre R\$\s*15,00 · Cliente paga R\$\s*25,00$/)
  expect(rotuloPagamento({ diferenca: 6.58, coberto: 0, clientePaga: 6.58 })).toMatch(/^Cliente paga R\$\s*6,58$/)
  expect(rotuloPagamento({ diferenca: 6.58 })).toMatch(/^Cliente paga R\$\s*6,58$/) // banco sem as colunas novas
  expect(rotuloPagamento({ diferenca: -12, coberto: 0, clientePaga: 0 })).toMatch(/^Crédito de R\$\s*12,00$/)
  expect(rotuloPagamento({ diferenca: 0, coberto: 0, clientePaga: 0 })).toBe("Sem diferença")
  expect(rotuloPagamento({ diferenca: 0.68, coberto: 0.68, clientePaga: 0 }, true)).toBe("Arvenne cobre a diferença")
})
test("V38: texto das opções e do carrinho não chama a diferença coberta de 'a pagar'", () => {
  const v = valor({ tipo: "opcao", situacao: "paga_diferenca", diferenca: 0.68, coberto_previsto: 0.68, cliente_paga_previsto: 0 })
  expect(textoSituacao(v)).toMatch(/^Arvenne cobre R\$\s*0,68$/)
  expect(fraseSituacao(v)).toMatch(/^Arvenne cobre R\$\s*0,68$/)
  const parcial = valor({ tipo: "opcao", situacao: "paga_diferenca", diferenca: 40, coberto_previsto: 15, cliente_paga_previsto: 25 })
  expect(textoSituacao(parcial)).toMatch(/Arvenne cobre R\$\s*15,00 · cliente paga R\$\s*25,00$/i)
  expect(fraseDiferencaCarrinho(40, 15, 25)).toMatch(/^Arvenne cobre R\$\s*15,00 · cliente paga R\$\s*25,00$/)
  expect(fraseDiferencaCarrinho(0.68, 0.68, 0)).toMatch(/^Arvenne cobre R\$\s*0,68$/)
  // Sem cobertura, o texto antigo continua igual.
  expect(textoSituacao(valor({ situacao: "paga_diferenca", diferenca: 40, coberto_previsto: 0, cliente_paga_previsto: 40 }))).toMatch(/^\+R\$\s*40,00 a pagar$/)
})
test("V38: a mensagem para a cliente diz que a loja cobre a diferença sem mostrar o número gigante", () => {
  const pedido = { numero: "ARV-1", cliente_nome: "Ana Souza" } as Pedido
  const itens = [{ id: "i" }] as Item[]
  expect(mensagemTroca(pedido, itens, "https://x/t/1", COBRIR_TUDO)).toContain("Se ela custar mais, a diferença fica por nossa conta")
  expect(mensagemTroca(pedido, itens, "https://x/t/1", COBRIR_TUDO)).not.toContain("99")
  expect(mensagemTroca(pedido, itens, "https://x/t/1", 15)).toMatch(/Se ela custar mais, cobrimos até R\$\s*15,00 da diferença/)
  expect(mensagemTroca(pedido, itens, "https://x/t/1", 0)).toContain("Se ela custar mais, você paga só a diferença")
})
test("mensagem da troca: texto aprovado, com negrito do WhatsApp (asteriscos) e link em linha própria", () => {
  const pedido = { numero: "ARV-1277", cliente_nome: "Karolyne Maciel" } as Pedido
  const uma = mensagemTroca(pedido, [{ id: "i", nome: "Brinco Esplendor", variante: null }] as Item[], "https://x/t/1")
  expect(uma).toBe([
    "Oi, Karolyne! Tudo bem? Aqui é do *time da expedição da Arvenne Pratas* 📦",
    "",
    "Durante a separação do seu pedido, vimos que uma peça não está disponível no nosso estoque 😕 Separamos algumas opções para você escolher a que mais gostar:",
    "",
    "👉🏻 https://x/t/1",
    "",
    "*Como funciona:*",
    "",
    '1️⃣ Abra o link e toque em "*Quero esta*" na peça que gostar. Se ela custar mais, você paga só a diferença. Se custar menos, a diferença vira crédito',
    '2️⃣ Se não quiser trocar, toque em "*Prefiro crédito*"',
    "3️⃣ Se preferir o reembolso ou outra opção, é só me falar por aqui",
    "",
    "Qualquer dúvida, pode me chamar 🤍",
  ].join("\n"))
  expect(uma).not.toContain("Brinco Esplendor") // não cita a peça
  const varias = mensagemTroca(pedido, [{ id: "a" }, { id: "b" }] as Item[], "https://x/t/1")
  expect(varias).toContain("vimos que algumas peças não estão disponíveis no nosso estoque 😕 Separamos algumas opções para você escolher as que mais gostar:")
  expect(mensagemTroca({ numero: "ARV-2", cliente_nome: null } as Pedido, [{ id: "a" }] as Item[], "l")).toMatch(/^Oi! Tudo bem\?/)
})
