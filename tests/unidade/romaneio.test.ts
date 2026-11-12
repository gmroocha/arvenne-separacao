import { expect, test } from "vitest"
import { seloRomaneio } from "@/lib/status"

test.each([
  ["arquivo", "cancelado", "Pedido cancelado"],
  ["venda", "cancelado", "Pedido cancelado"],
  ["arquivo", "perdida", null],
  ["venda", "em_aberto", null],
  ["expedicao", "separacao", "Pagamento confirmado"],
  ["arquivo", "enviado", "Pagamento confirmado"],
])("V19: romaneio %s/%s mostra %s", (fase, status, texto) => {
  expect(seloRomaneio(fase, status)?.texto ?? null).toBe(texto)
})
