import { test, expect } from "@playwright/test"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function preparar(context, baseURL, completa = true) {
  sim = await criarSimulacao({ status: "em_aberto" })
  if (completa) await sim.banco.query(`update pedidos set cliente_telefone='11987654321',cliente_cpf='12345678909',
    entrega_cep='01001000',entrega_logradouro='Rua de teste',entrega_numero='10',entrega_bairro='Centro',
    entrega_cidade='São Paulo',entrega_uf='SP' where id=$1`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
}

async function pedir(page) {
  await page.getByRole("combobox", { name: "Situação da venda" }).click()
  await page.getByRole("option", { name: "Pago…", exact: true }).click()
  return page.getByRole("dialog", { name: "Marcar como pago", exact: true })
}

test("V71: pagamento abre com gravação pendente e só confirma com o total atualizado do banco", async ({ page, context, baseURL }, info) => {
  await preparar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let liberar
  const retida = new Promise((r) => { liberar = r })
  let recebeu = false
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/pedido_itens", async (route) => {
    if (route.request().method() === "PATCH") { recebeu = true; await retida }
    await route.fallback()
  })
  try {
    await page.getByRole("button", { name: /^Aumentar/ }).first().click()
    await expect.poll(() => recebeu).toBe(true)
    const dialog = await pedir(page)
    await expect(dialog).toBeVisible({ timeout: 1500 })
    await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeDisabled()
    await expect(dialog.getByText("Recalculando…", { exact: true })).toBeVisible()
    await page.screenshot({ path: `capturas/pagamento-recalculando-${info.project.name}.png` })
    liberar()
    await expect(dialog.getByLabel("Valor pago", { exact: true })).toHaveValue("150,00")
    await dialog.getByRole("button", { name: "Confirmar pagamento" }).click()
    // V105: a venda paga continua em Vendas; o pedido abre só pelo aviso.
    await expect(page).toHaveURL(/\/vendas$/)
    await expect(page.getByText("Pedido entrou na expedição")).toBeVisible()
    expect(Number((await sim.one("select valor_pago from pedidos where id=$1", [sim.pedido.id])).valor_pago)).toBe(150)
    expect(sim.bloqueadas).toEqual([])
  } finally { liberar() }
})

test("V71: falha na leitura do total bloqueia confirmação e permite recalcular", async ({ page, context, baseURL }) => {
  await preparar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await page.waitForLoadState("networkidle")
  let falhar = true
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/v_pedidos" && u.searchParams.get("id") === `eq.${sim.pedido.id}`, async (route) => {
    if (falhar) return route.fulfill({ status: 503, json: { message: "Banco indisponível" }, headers: { "access-control-allow-origin": "*" } })
    await route.fallback()
  })
  const dialog = await pedir(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Tentar recalcular" })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeDisabled()
  falhar = false
  await dialog.getByRole("button", { name: "Tentar recalcular" }).click()
  await expect(dialog.getByLabel("Valor pago", { exact: true })).toHaveValue("100,00")
  await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled()
  expect((await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("em_aberto")
  expect(sim.bloqueadas).toEqual([])
})

test("V71: trocar a forma de pagamento recalcula o Pix e descarta uma resposta antiga", async ({ page, context, baseURL }) => {
  await preparar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const dialog = await pedir(page)
  await expect(dialog.getByLabel("Valor pago", { exact: true })).toHaveValue("100,00")
  await dialog.getByRole("radio", { name: "Pix", exact: true }).click()
  await expect(dialog.getByLabel("Valor pago", { exact: true })).toHaveValue("90,00")
  let liberar
  const retida = new Promise((r) => { liberar = r })
  let recebeu = false
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/v_pedidos" && u.searchParams.get("id") === `eq.${sim.pedido.id}`, async (route) => {
    if (!recebeu) {
      // Retém o resultado já calculado para Cartão (100), antes da troca seguinte para Pix (90).
      const antigo = await sim.one('select to_jsonb(v) dado from v_pedidos v where id=$1', [sim.pedido.id])
      recebeu = true
      await retida
      return route.fulfill({ json: antigo.dado, headers: { "access-control-allow-origin": "*" } })
    }
    await route.fallback()
  })
  try {
    await dialog.getByRole("radio", { name: "Cartão", exact: true }).click()
    await expect.poll(() => recebeu).toBe(true)
    await dialog.getByRole("radio", { name: "Pix", exact: true }).click()
    await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled()
    liberar()
    await page.waitForLoadState("networkidle")
    await expect(dialog.getByLabel("Valor pago", { exact: true })).toHaveValue("90,00")
    await expect(page.locator("main").getByText("R$ 90,00", { exact: true }).filter({ visible: true }).last()).toBeVisible()
    await dialog.getByRole("button", { name: "Confirmar pagamento" }).click()
    // V105: a venda paga continua em Vendas; o pedido abre só pelo aviso.
    await expect(page).toHaveURL(/\/vendas$/)
    await expect(page.getByText("Pedido entrou na expedição")).toBeVisible()
    expect(await sim.one("select forma_pagamento,valor_pago from pedidos where id=$1", [sim.pedido.id])).toEqual({ forma_pagamento: "Pix", valor_pago: "90.00" })
    expect(sim.bloqueadas).toEqual([])
  } finally { liberar() }
})

test("V73: venda incompleta mostra o que falta e destaca campos antes de pagar", async ({ page, context, baseURL }, info) => {
  await preparar(context, baseURL, false)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const dialog = await pedir(page)
  await expect(page.getByText(/Falta para marcar como pago:/)).toBeVisible()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel("Telefone", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByLabel("CPF ou CNPJ", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByLabel("CEP", { exact: true })).toHaveAttribute("aria-invalid", "true")
  await page.screenshot({ path: `capturas/venda-dados-obrigatorios-${info.project.name}.png`, fullPage: true })
  expect((await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("em_aberto")
  expect(sim.bloqueadas).toEqual([])
})

test("V72: venda somada sai do Arquivo e continua dentro do pedido principal", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ somada: true })
  await sim.banco.query("update pedidos set status='cancelado' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto("/arquivo")
  await expect(page.locator(`a[href="/pedidos/${sim.pedido.id}"]`)).toBeVisible()
  await expect(page.locator(`a[href="/pedidos/${sim.vendaSomada.id}"]`)).toHaveCount(0)
  await page.getByRole("textbox", { name: "Número, cliente ou telefone" }).fill(sim.vendaSomada.numero)
  await expect(page.getByText("Nenhum pedido encontrado")).toBeVisible()
  await page.goto(`/pedidos/${sim.pedido.id}`)
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Mostrar ou esconder" }).click()
  await expect(page.getByText(new RegExp(sim.vendaSomada.numero)).first()).toBeVisible()
  expect((await sim.one("select status from pedidos where id=$1", [sim.vendaSomada.id])).status).toBe("somada")
  expect(sim.bloqueadas).toEqual([])
})
