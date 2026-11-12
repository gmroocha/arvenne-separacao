import { expect, test } from "vitest"
import { assinaturaEscolhas } from "@/lib/trocaConclusao"

const peca = (extra = {}) => ({ item_id: "a", escolha_tipo: "opcao" as const, escolha_opcao_id: "o1", carrinho: [{ opcao_id: "o1", qtd: 1 }], qtd: 1, ...extra })

test("concluir vale para as escolhas exatas: mudar qualquer peça pede concluir de novo", () => {
  const base = assinaturaEscolhas([peca(), peca({ item_id: "b", escolha_tipo: "credito", escolha_opcao_id: null, carrinho: [] })])
  expect(assinaturaEscolhas([peca({ item_id: "b", escolha_tipo: "credito", escolha_opcao_id: null, carrinho: [] }), peca()])).toBe(base)
  expect(assinaturaEscolhas([peca({ carrinho: [{ opcao_id: "o1", qtd: 2 }] }), peca({ item_id: "b", escolha_tipo: "credito", escolha_opcao_id: null, carrinho: [] })])).not.toBe(base)
  expect(assinaturaEscolhas([peca(), peca({ item_id: "b" })])).not.toBe(base)
})
