import { test, expect } from "@playwright/test"
import { criarSimulacao } from "../../scripts/simulacao/banco.mjs"
import { capturarTemas } from "./auxiliar.mjs"

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

async function montar(context, baseURL, { pecas = 4, status = "novo", troca = false } = {}) {
  sim = await criarSimulacao({ status, troca })
  if (pecas > 0)
    await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
      select $1,'avulso','Peça '||n,'PC-'||lpad(n::text,2,'0'),1,10,n from generate_series(1,${pecas}) n`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
}
const itemMenu = (page, nome) => page.getByRole("menuitem", { name: nome }).or(page.getByRole("button", { name: nome, exact: true }))
const setaVoltar = (page) => page.locator("main a:has(svg.lucide-arrow-left)")
const caixa = async (loc) => (await loc.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }

// V101: o botão "Voltar" alinha a seta com o nome; o nome, a linha de etapas e a busca ficam presos no topo ao rolar;
// o responsável fica ao lado da busca (e sozinho, à direita, nas etapas sem busca).
test("V101: voltar alinhado, cabeçalho preso ao rolar e responsável ao lado da busca", async ({ page, context, baseURL }, info) => {
  await montar(context, baseURL, { pecas: 14 })
  await sim.banco.query("insert into equipe(nome,email,ativo) values ('Ana Paula','ana@example.test',true)")
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const nome = page.getByRole("heading", { level: 2, name: "Cliente de teste" })
  const voltar = setaVoltar(page)
  await expect(nome).toBeVisible()
  // A seta do "Voltar" começa no mesmo ponto do nome (tolerância de 2 px).
  const seta = await caixa(voltar.locator("svg"))
  expect(Math.abs(seta.x - (await caixa(nome)).x)).toBeLessThanOrEqual(2)
  // Busca e responsável na mesma linha, o responsável à direita.
  const busca = page.getByRole("textbox", { name: "Buscar peça: código, nome ou variante" })
  const resp = page.getByRole("button", { name: /Mudar responsável/ })
  await expect(resp).toBeVisible()
  const b = await caixa(busca), r = await caixa(resp)
  expect(Math.abs(b.y + b.height / 2 - (r.y + r.height / 2))).toBeLessThanOrEqual(2)
  expect(r.x).toBeGreaterThanOrEqual(b.x + b.width - 1)
  await capturarTemas(page, "pedido-cabecalho", info)
  // Rolando pelas peças: nome, etapa e busca continuam à vista; o voltar sai da tela.
  await page.evaluate(() => window.scrollTo(0, 900))
  await expect.poll(async () => (await caixa(nome)).y).toBeGreaterThanOrEqual(0)
  expect((await caixa(nome)).y).toBeLessThan(40)
  expect((await caixa(busca)).y).toBeLessThan(200)
  expect((await caixa(resp)).y).toBeLessThan(200)
  expect((await caixa(voltar)).y + (await caixa(voltar)).height).toBeLessThanOrEqual(0)
  await capturarTemas(page, "pedido-cabecalho-rolado", info)
  // O botão ainda funciona preso: designa a etapa atual.
  await resp.click()
  await itemMenu(page, "Ana Paula").click()
  await expect.poll(async () => Object.keys((await sim.one("select responsaveis from pedidos where id=$1", [sim.pedido.id])).responsaveis)).toEqual(["separacao"])
  expect(sim.bloqueadas).toEqual([])
})

test("V101: com a Bipagem (sem busca) o responsável fica sozinho, à direita", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, { pecas: 2 })
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.banco.query("insert into equipe(nome,email,ativo) values ('Ana Paula','ana@example.test',true)")
  await page.goto(`/pedidos/${sim.pedido.id}`)
  const resp = page.getByRole("button", { name: /Mudar responsável/ })
  await expect(resp).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Buscar peça: código, nome ou variante" })).toHaveCount(0)
  const largura = page.viewportSize().width
  expect((await caixa(resp)).x + (await caixa(resp)).width).toBeGreaterThan(largura - 40)
})

// V100: "Encontrada" tira a peça da troca aberta e a leva para a Conferência.
test("V100: Encontrada numa peça em falta com troca aberta", async ({ page, context, baseURL }, info) => {
  await montar(context, baseURL, { pecas: 0, status: "novo", troca: true })
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Resolver", exact: true }).click()
  await capturarTemas(page, "pedido-resolver", info)
  await itemMenu(page, "Encontrada").click()
  await expect.poll(async () => (await sim.one("select status from pedido_itens where id=$1", [sim.item.id])).status).toBe("encontrado")
  expect((await sim.one("select status from trocas where id=$1", [sim.troca.id])).status).toBe("cancelada")
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("conferencia")
  expect(Number((await sim.one("select count(*) n from listar_inconsistencias() where pedido_id=$1 and regra='troca_inativa_pendente'", [sim.pedido.id])).n)).toBe(0)
  expect(sim.bloqueadas).toEqual([])
})

// V102: ao concluir uma etapa, o aviso diz quem faz a próxima (quando não é a própria pessoa).
async function concluirSeparacao(page) {
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Concluir etapa", exact: true }).click()
  await page.getByRole("dialog", { name: "Concluir Separação?" }).getByRole("button", { name: "Concluir etapa", exact: true }).click()
  const aviso = page.getByRole("dialog", { name: "Etapa Separação concluída" })
  await expect(aviso).toContainText("agora Conferência")
  return aviso
}
test("V102: o aviso de etapa concluída diz para avisar quem faz a próxima etapa", async ({ page, context, baseURL }, info) => {
  await montar(context, baseURL, { pecas: 2 })
  const ana = await sim.one("insert into equipe(nome,email,ativo) values ('Ana Paula','ana@example.test',true) returning id")
  await sim.banco.query("update pedidos set responsaveis=jsonb_build_object('conferencia',$2::text) where id=$1", [sim.pedido.id, ana.id])
  const aviso = await concluirSeparacao(page)
  await expect(aviso).toContainText("A próxima etapa (Conferência) é de Ana Paula. Avise Ana Paula.")
  await capturarTemas(page, "etapa-concluida-avise", info)
})
test("V102: sem aviso quando a próxima etapa é da própria pessoa ou de ninguém", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, { pecas: 2 })
  const eu = await sim.one("insert into equipe(nome,email,ativo) values ('Eu Mesma','teste@example.test',true) returning id")
  await sim.banco.query("update pedidos set responsaveis=jsonb_build_object('conferencia',$2::text) where id=$1", [sim.pedido.id, eu.id])
  const aviso = await concluirSeparacao(page)
  await expect(aviso).not.toContainText("Avise")
})

// V103: a quantidade também pode ser digitada (e a venda continua com uma gravação só).
test("V103: quantidade digitada na venda vale ao sair do campo, com limites e uma gravação só", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  const total = (v) => page.getByText(v, { exact: true }).filter({ visible: true }).last()
  await expect(total("R$ 100,00")).toBeVisible()
  const campo = page.getByRole("textbox", { name: /^Quantidade/ }).first()
  await expect(campo).toHaveValue("2")
  // No celular o campo tem 16 px (sem zoom ao tocar).
  if (page.viewportSize().width < 768) expect(await campo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
  await capturarTemas(page, "quantidade-digitada", info)
  // Gravações da peça: a venda grava com PATCH em pedido_itens (as outras chamadas só leem totais e contagens).
  const escritas = () => sim.requisicoes.filter((r) => (r.metodo === "PATCH" && r.path.endsWith("/pedido_itens")) || r.path.endsWith("/rpc/alterar_item")).length
  const antes = escritas()
  await campo.fill("5")
  await campo.press("Enter")
  await expect(total("R$ 250,00")).toBeVisible()
  expect(Number((await sim.one("select qtd from pedido_itens where id=$1", [sim.item.id])).qtd)).toBe(5)
  expect(escritas() - antes).toBe(1)
  // Vazio volta ao valor anterior, sem gravar; zero sobe ao mínimo (1).
  await campo.fill("")
  await campo.blur()
  await expect(campo).toHaveValue("5")
  expect(escritas() - antes).toBe(1)
  await campo.fill("0")
  await campo.blur()
  await expect(total("R$ 50,00")).toBeVisible()
  await expect(campo).toHaveValue("1")
  expect(Number((await sim.one("select qtd from pedido_itens where id=$1", [sim.item.id])).qtd)).toBe(1)
  expect(sim.bloqueadas).toEqual([])
})

// V104: o link de rastreio é colado na Postagem (não na Embalagem e frete).
test("V104: o link de rastreio fica na Postagem, não na Embalagem e frete", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, { pecas: 1 })
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=qtd,bipado_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set nf_emitida_em=now(),pedido_fornecedor_em=now(),embalado_em=now() where id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='embalagem' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Frete gerado", exact: true })).toBeVisible()
  await expect(page.getByRole("textbox", { name: /rastreio/i })).toHaveCount(0)
  await sim.banco.query("update pedidos set frete_gerado_em=now() where id=$1", [sim.pedido.id])
  await page.reload()
  const link = page.getByRole("textbox", { name: "Link de rastreio (opcional)" })
  await link.fill("https://rastreio.exemplo/XY9")
  await link.press("Enter")
  await expect.poll(async () => (await sim.one("select rastreio_url from pedidos where id=$1", [sim.pedido.id])).rastreio_url).toBe("https://rastreio.exemplo/XY9")
  await expect(page.getByRole("link", { name: /Abrir rastreio/ })).toBeVisible()
})

// V105: depois de marcar como paga, a pessoa continua em Vendas; o pedido abre pelo aviso "Abrir pedido".
test("V105: venda paga fica em Vendas e o aviso abre o pedido", async ({ page, context, baseURL }, info) => {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query(`update pedidos set cliente_telefone='11999990000',cliente_cpf='52998224725',entrega_cep='01001000',
    entrega_logradouro='Rua de teste',entrega_numero='10',entrega_bairro='Centro',entrega_cidade='São Paulo',entrega_uf='SP' where id=$1`, [sim.pedido.id])
  await sim.instalar(context, baseURL)
  await page.goto(`/vendas/${sim.pedido.id}`)
  await expect(page.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Cliente de teste")
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Resumo", exact: true }).click()
  await page.getByRole("button", { name: "Pago", exact: true }).filter({ visible: true }).click()
  const dialog = page.getByRole("dialog", { name: "Marcar como pago", exact: true })
  await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled()
  await dialog.getByRole("button", { name: "Confirmar pagamento" }).click()
  await expect(page).toHaveURL(/\/vendas$/)
  const abrir = page.getByRole("button", { name: "Abrir pedido", exact: true })
  await expect(page.getByText("Pedido entrou na expedição")).toBeVisible()
  await capturarTemas(page, "venda-paga-em-vendas", info)
  expect((await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("novo")
  await abrir.click()
  await expect(page).toHaveURL(new RegExp(`/pedidos/${sim.pedido.id}$`))
  expect(sim.bloqueadas).toEqual([])
})

// V106: copiar a mensagem ou o link da troca só marca a troca como enviada; o pedido segue em "Avisar cliente" até
// "Cliente avisada".
test("V106: copiar o link da troca não move o pedido; Cliente avisada move", async ({ page, context, baseURL }) => {
  await montar(context, baseURL, { pecas: 0, status: "novo", troca: true })
  await sim.banco.query("update trocas set status='rascunho',enviada_em=null where id=$1", [sim.troca.id])
  await sim.banco.query("update pedidos set status='avisar_cliente',etapa_antes_desvio='separacao' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Copiar link", exact: true }).click()
  await expect.poll(async () => (await sim.one("select status from trocas where id=$1", [sim.troca.id])).status).toBe("enviada")
  expect((await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("avisar_cliente")
  await page.getByRole("button", { name: "Cliente avisada", exact: true }).click()
  await expect.poll(async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status).toBe("aguardando_cliente")
  expect(sim.bloqueadas).toEqual([])
})
