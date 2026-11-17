import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Venda: cliques seguidos no "+" não viram uma gravação por clique na fila (cada uma esperava a anterior e o
// total demorava). O total volta do banco numa leitura só da v_pedidos, sem recarregar peças e histórico.
test("V70: venda — quantidade e preço gravam rápido, preço digitado substitui o anterior e o total vem do banco", async ({ page, context, baseURL }) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const total = (v) => page.getByText(v, { exact: true }).filter({ visible: true }).last()
  await expect(total("R$ 100,00")).toBeVisible()
  const antes = sim.requisicoes.length
  const mais = page.getByRole("button", { name: /^Aumentar/ }).first()
  for (let n = 0; n < 5; n++) await mais.click()
  await expect(total("R$ 350,00")).toBeVisible()
  expect((await sim.one("select qtd from pedido_itens where id=$1", [sim.item.id])).qtd).toBe(7)
  const novas = sim.requisicoes.slice(antes)
  expect(novas.filter((r) => r.metodo === "PATCH" && r.path.endsWith("/pedido_itens")).length).toBeGreaterThan(0)
  // Depois de gravar, só a v_pedidos é lida de novo: peças e histórico não são recarregados a cada clique.
  expect(novas.filter((r) => r.metodo === "GET" && r.path.endsWith("/pedido_eventos"))).toEqual([])
  // Preço só desta venda: muda a linha, não o catálogo.
  const preco = page.getByRole("textbox", { name: "Preço" }).first()
  await preco.fill("40")
  await preco.press("Enter")
  await expect(total("R$ 280,00")).toBeVisible()
  expect(Number((await sim.one("select preco from pedido_itens where id=$1", [sim.item.id])).preco)).toBe(40)
  expect(sim.bloqueadas).toEqual([])
})
