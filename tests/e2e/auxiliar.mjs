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

// Capturas para conferir o visual no escuro e no claro (a pasta capturas/ não vai para o git).
export async function capturarTemas(page, nome, info, opcoes = {}) {
  const { mkdirSync } = await import("node:fs")
  mkdirSync("capturas", { recursive: true })
  for (const tema of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: tema })
    await page.screenshot({ path: `capturas/${nome}-${tema === "dark" ? "escuro" : "claro"}-${info.project.name}.png`, animations: "disabled", ...opcoes })
  }
  await page.emulateMedia({ colorScheme: "dark" })
}
