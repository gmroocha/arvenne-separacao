import { expect, test } from "vitest"
import { lerLista } from "@/lib/bling"

test("lê as formas aceitas: SKU x2, SKU 2, 2 SKU, 2x SKU e só SKU", () => {
  const { linhas, ignoradas } = lerLista("AN-1 x2\nBR-2 3\n4 CO-3\n5x PU-4\nCL-5\nDI-6 X 7")
  expect(linhas).toEqual([
    { sku: "AN-1", qtd: 2 }, { sku: "BR-2", qtd: 3 }, { sku: "CO-3", qtd: 4 }, { sku: "PU-4", qtd: 5 }, { sku: "CL-5", qtd: 1 }, { sku: "DI-6", qtd: 7 },
  ])
  expect(ignoradas).toEqual([])
})

test("lê o texto do botão Copiar SKUs e some códigos repetidos", () => {
  const { linhas } = lerLista("AN-1 x2\r\nBR-2 x1\r\nan-1 x3\n\n  \n")
  expect(linhas).toEqual([{ sku: "AN-1", qtd: 5 }, { sku: "BR-2", qtd: 1 }])
})

test("aceita tabulação e ponto e vírgula (colar de planilha) e espaços sobrando", () => {
  expect(lerLista("AN-1\t2\nBR-2;3\n  CO-3   x4  ").linhas).toEqual([{ sku: "AN-1", qtd: 2 }, { sku: "BR-2", qtd: 3 }, { sku: "CO-3", qtd: 4 }])
})

test("SKU com x no meio não é confundido com quantidade", () => {
  expect(lerLista("XB-1\nAX2\nBOX-7 x2").linhas).toEqual([{ sku: "XB-1", qtd: 1 }, { sku: "AX2", qtd: 1 }, { sku: "BOX-7", qtd: 2 }])
})

test("quantidade zero ou absurda vai para as ignoradas, sem entrar na lista", () => {
  const { linhas, ignoradas } = lerLista("AN-1 x0\nBR-2 x99999\nCO-3 x2")
  expect(linhas).toEqual([{ sku: "CO-3", qtd: 2 }])
  expect(ignoradas).toEqual(["AN-1 x0", "BR-2 x99999"])
})

test("texto vazio não gera nada", () => {
  expect(lerLista("  \n\n")).toEqual({ linhas: [], ignoradas: [] })
})
