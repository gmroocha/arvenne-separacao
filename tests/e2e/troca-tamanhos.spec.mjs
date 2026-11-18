import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

// Página da troca para a cliente (40+): mesmo modelo em outro tamanho aparece sem código, com frase grande e o valor
// só quando muda. A peça que faltou mostra o tamanho, não o código.
test("troca: mesmo modelo em outro tamanho, sem código e com valor só quando muda", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ troca: true })
  await sim.banco.exec("set session_replication_role = replica")
  await sim.banco.query("update pedidos set desconto_valor=0 where id=$1", [sim.pedido.id])
  await sim.banco.query("update pedido_itens set nome='Anel solitário moissanite', sku='ANF168M-18', variante='10mm / N°18', qtd=1 where id=$1", [sim.item.id])
  const tp = await sim.one("select id from troca_pecas where troca_id=$1", [sim.troca.id])
  await sim.banco.query("delete from troca_opcoes where troca_peca_id=$1", [tp.id])
  await sim.banco.query(`insert into troca_opcoes(troca_peca_id,origem,nome,sku,variante,preco) values
    ($1,'site','Anel solitário moissanite','ANF168M-14','10mm / N°14',80),
    ($1,'site','Anel solitário moissanite','ANF168M-20','10mm / N°20',80),
    ($1,'site','Anel solitário moissanite','ANF168M-22','10mm / N°22',80),
    ($1,'site','Anel solitário moissanite','ANF168M-26','10mm / N°26',100)`, [tp.id])
  await sim.banco.exec("set session_replication_role = origin")
  await sim.instalar(context, baseURL, { logado: false })
  await page.goto(`/t/${sim.troca.token}`)

  // Peça que faltou: tamanho em destaque, sem o código.
  await expect(page.getByText("Tamanho N°18", { exact: true })).toBeVisible()
  await expect(page.getByText(/ANF168M/)).toHaveCount(0)
  // Mesmo valor: frase grande, sem preço; tamanhos em botões grandes.
  await expect(page.getByText("Mesmo modelo, outro tamanho")).toHaveCount(2)
  await expect(page.getByText("Mesmo valor, sem pagar nada a mais")).toBeVisible()
  await expect(page.getByText("Toque no tamanho que você quer:")).toBeVisible()
  await expect(page.getByText(/tamanhos disponíveis/)).toHaveCount(0)
  // Outro valor: diz quanto custa a mais.
  await expect(page.getByText(/Custa R\$\s*20,00 a mais/)).toBeVisible()
  await page.screenshot({ path: `capturas/troca-tamanhos-${info.project.name}.png`, fullPage: true, animations: "disabled" })

  await page.getByRole("button", { name: "Tamanho N°20", exact: true }).click()
  await expect.poll(async () => (await sim.one(`select o.variante from troca_escolhas e join troca_opcoes o on o.id=e.opcao_id
    where e.troca_peca_id=$1`, [tp.id]))?.variante).toBe("10mm / N°20")
  // Tamanho sozinho com outro valor: botão "Quero este tamanho".
  await expect(page.getByText("Tamanho N°26", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  expect(sim.bloqueadas).toEqual([])
})
