import { expect, test } from "vitest"
import { juntarLidos, lerLinkCarrinho } from "@/lib/carrinho"

// V21: variante repetida perdia quantidade e quantidade 0 virava 1.
test("V21: variante repetida no link soma as quantidades", () => {
  expect(lerLinkCarrinho("https://loja.test/cart/123:1,456:1,123:2")).toEqual({
    tipo: "itens", itens: [{ variantId: "123", qtd: 3 }, { variantId: "456", qtd: 1 }],
  })
})

test("V21: quantidade zero sai do carrinho em vez de virar 1", () => {
  expect(lerLinkCarrinho("https://loja.test/cart/123:0,456:2")).toEqual({ tipo: "itens", itens: [{ variantId: "456", qtd: 2 }] })
  expect(lerLinkCarrinho("https://loja.test/cart/123:0")).toBeNull()
})

test("V21: leitura da função de checkout também junta repetidas", () => {
  expect(juntarLidos([{ variantId: "9", qtd: 1 }, { variantId: "9", qtd: 2 }, { variantId: "8", qtd: Number.NaN }]))
    .toEqual([{ variantId: "9", qtd: 3 }])
})

test("link compartilhado continua indo para a função Edge", () => {
  expect(lerLinkCarrinho("https://loja.test/70987808856/checkouts/ac/abcdefghijk/recover?key=1")?.tipo).toBe("compartilhado")
})
