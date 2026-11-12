import { expect, test } from "vitest"
import { db, one } from "./suporte.mjs"
import { fixture, escolher, concluir, recusa } from "./fixtures.mjs"

// Reproduções abertas da vistoria, NÃO correções. test.fails exige que o comportamento esperado ainda
// falhe; ao corrigir o bug, remova .fails no mesmo commit para virar uma trava permanente.
// Não transformar falhas novas/desconhecidas em .fails para deixar a integração verde.
test.fails("V28: valor de opção concluída não pode reescrever o histórico", async () => {
  const f = await fixture()
  await escolher(f); await concluir(f)
  await recusa(() => db.query("update troca_opcoes set preco=100 where id=$1", [f.opcoes[0].id]), /concluída|histórico/i)
})
