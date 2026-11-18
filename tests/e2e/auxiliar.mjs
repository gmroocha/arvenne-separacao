import { expect } from "@playwright/test"

// Depois de qualquer avanço de etapa o pedido mostra "Etapa X concluída → agora Y". Os testes que andam pela esteira
// tocam em "Continuar" (sem isso o aviso cobre a tela e os botões de baixo ficam inalcançáveis).
export async function continuarAviso(page, de, agora) {
  const aviso = page.getByRole("dialog", { name: de ? `Etapa ${de} concluída` : /conclu/ })
  await expect(aviso, `aviso de etapa concluída${de ? ` (${de})` : ""}`).toBeVisible()
  if (agora) await expect(aviso).toContainText(agora === "Concluído" ? "pedido concluído" : `agora ${agora}`)
  await aviso.getByRole("button", { name: "Continuar", exact: true }).click()
  await expect(aviso).toBeHidden()
}
