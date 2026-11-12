import { expect, test } from "vitest"
import { motivoEtapa } from "@/lib/regrasEtapas"

test("V14: menu segue a decisão do banco sem inventar pré-requisitos", () => {
  expect(motivoEtapa({ conferencia: null, enviado: "Falta conferir a postagem." }, "conferencia")).toBeNull()
  expect(motivoEtapa({ enviado: "Falta conferir a postagem." }, "enviado")).toBe("Falta conferir a postagem.")
})
test.each([undefined, null, [], {}, { enviado: true }])("V14: contrato ausente ou ilegível bloqueia a etapa (%j)", (regras) => {
  expect(motivoEtapa(regras, "enviado")).toBeTypeOf("string")
})
