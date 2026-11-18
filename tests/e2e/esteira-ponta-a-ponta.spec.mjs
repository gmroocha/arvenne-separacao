import { test, expect } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { criarSimulacao, SUPABASE_FICTICIO } from "../../scripts/simulacao/banco.mjs"

// A esteira inteira, como a equipe usa: venda paga → separar → conferir → bipar → nota → embalar → frete → postar →
// concluído, com cliques em rajada (sem esperar entre eles). Em cada etapa confere o banco: o dinheiro não muda, o
// status nunca volta, nenhum aviso de erro, poucas requisições (uma em voo por vez) e sem rolagem lateral no celular.
// Limite honesto: o banco do teste atende uma requisição por vez; ele mede correção e quantidade de requisições,
// não a capacidade do Supabase.

let sim
test.afterEach(async () => { await sim?.fechar(); sim = null })

const ORDEM = ["novo", "separacao", "conferencia", "bipagem", "faturamento", "embalagem", "frete", "pronto_envio", "enviado"]

async function montar(context, baseURL, { pecas = 11, origem = "whatsapp" } = {}) {
  sim = await criarSimulacao({ status: "em_aberto" })
  await sim.banco.query(`insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco,ordem)
    select $1,'avulso','Peça '||n,'PC-'||lpad(n::text,2,'0'),1,10,n from generate_series(1,${pecas}) n`, [sim.pedido.id])
  await sim.banco.query(`update pedidos set cliente_telefone='11987654321',cliente_cpf='12345678909',
    entrega_cep='01001000',entrega_logradouro='Rua de teste',entrega_numero='10',entrega_bairro='Centro',
    entrega_cidade='São Paulo',entrega_uf='SP' where id=$1`, [sim.pedido.id])
  if (origem === "shopify") await sim.banco.query("update pedidos set origem='shopify',shopify_order_id=777,numero='ARV-777' where id=$1", [sim.pedido.id])
  await sim.instalar(context, baseURL)
}

// Observa a tela: avisos de erro (sonner), requisições de gravação das peças e quantas estão em voo ao mesmo tempo.
async function observar(page) {
  await page.addInitScript(() => {
    window.__avisos = []
    const ver = (n) => {
      if (n.nodeType !== 1) return
      const el = n.matches?.("[data-sonner-toast]") ? n : n.querySelector?.("[data-sonner-toast]")
      if (el) window.__avisos.push({ tipo: el.getAttribute("data-type"), texto: el.textContent })
    }
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(ver))).observe(document, { childList: true, subtree: true })
  })
  const o = { marcar: 0, alterar: 0, emVoo: 0, maxVoo: 0 }
  const nome = (r) => new URL(r.url()).pathname.match(/^\/rest\/v1\/rpc\/(.+)$/)?.[1]
  page.on("request", (r) => {
    const n = nome(r)
    if (n === "alterar_item") o.alterar++
    if (n !== "marcar_pecas") return
    o.marcar++; o.emVoo++; o.maxVoo = Math.max(o.maxVoo, o.emVoo)
  })
  const fim = (r) => { if (nome(r) === "marcar_pecas") o.emVoo-- }
  page.on("requestfinished", fim)
  page.on("requestfailed", fim)
  o.avisos = (tipos = ["error"]) => page.evaluate((t) => window.__avisos.filter((a) => t.includes(a.tipo)), tipos)
  return o
}

// Capturas para conferir o visual no escuro e no claro (a pasta capturas/ não vai para o git).
async function capturar(page, nome, info) {
  mkdirSync("capturas", { recursive: true })
  for (const tema of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: tema })
    await page.screenshot({ path: `capturas/esteira-${nome}-${tema === "dark" ? "escuro" : "claro"}-${info.project.name}.png`, fullPage: true, animations: "disabled" })
  }
  await page.emulateMedia({ colorScheme: "dark" })
}

const dinheiro = async () => {
  const p = await sim.one(`select p.valor_pago, v.total_geral, v.total_pago, public.saldo_financeiro(p.id) saldo
    from pedidos p join v_pedidos v on v.id=p.id where p.id=$1`, [sim.pedido.id])
  return { valor_pago: Number(p.valor_pago), total_geral: Number(p.total_geral), total_pago: Number(p.total_pago), saldo: Number(p.saldo) }
}
const status = async () => (await sim.one("select status from pedidos where id=$1", [sim.pedido.id])).status
const contar = async (campo) => Number((await sim.one(`select count(*) n from pedido_itens where pedido_id=$1 and ${campo}`, [sim.pedido.id])).n)
const semRolagemLateral = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

// Confere o que vale em toda etapa: dinheiro igual ao do pagamento, nenhum erro, sem rolagem lateral, nada bloqueado.
async function conferirEtapa(page, o, pago, etapa) {
  expect(await dinheiro(), `dinheiro em ${etapa}`).toEqual(pago)
  expect(await o.avisos(), `avisos de erro em ${etapa}`).toEqual([])
  expect(sim.bloqueadas, `requisições bloqueadas em ${etapa}`).toEqual([])
  await semRolagemLateral(page)
}

async function irParaEtapa(page, nome) {
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: /^Etapa \d+ de \d+/ }).click()
    await page.getByRole("dialog", { name: "Etapas do pedido" }).getByRole("button", { name: new RegExp(`^${nome}`) }).click()
  } else {
    await page.getByRole("list", { name: "Etapas do pedido" }).getByRole("button", { name: new RegExp(`^${nome}`) }).click()
  }
}

async function pagar(page) {
  await page.goto(`/vendas/${sim.pedido.id}`)
  await expect(page.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Cliente de teste")
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByRole("button", { name: "Resumo", exact: true }).click()
  await page.getByRole("button", { name: "Pago", exact: true }).filter({ visible: true }).click()
  const dialog = page.getByRole("dialog", { name: "Marcar como pago", exact: true })
  await expect(dialog.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled()
  await dialog.getByRole("button", { name: "Confirmar pagamento" }).click()
  await expect(page).toHaveURL(new RegExp(`/pedidos/${sim.pedido.id}$`))
}

// Todos os cliques de uma vez, no mesmo quadro: ninguém espera o banco entre um toque e outro.
const rajada = (page, nome, de = 0, ate = Infinity) =>
  page.getByRole("button", { name: nome, exact: true }).evaluateAll((bs, [a, b]) => bs.slice(a, b).forEach((x) => x.click()), [de, ate])

test("esteira inteira em rajada: venda → separação → conferência → bipagem → nota → embalagem → frete → postagem → concluídos", async ({ page, context, baseURL }, info) => {
  test.setTimeout(120_000)
  await montar(context, baseURL)
  const o = await observar(page)
  await pagar(page)
  const pago = await dinheiro()
  expect(pago.total_geral).toBeGreaterThan(0)
  expect(await status()).toBe("novo")
  mkdirSync("capturas", { recursive: true })

  // 12 linhas (AN-1 tem 2 unidades). Etiquetas: botão no topo da Separação.
  await expect(page.getByRole("button", { name: /^Imprimir todas as etiquetas \(13\)/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(12)
  await capturar(page, "separacao", info)
  await conferirEtapa(page, o, pago, "pagamento")

  // 1) Achei em metade (6 linhas), em rajada.
  await rajada(page, "Achei", 0, 6)
  await expect.poll(() => contar("status='encontrado'")).toBe(6)
  expect(await status()).toBe("separacao")
  expect(o.maxVoo).toBeLessThanOrEqual(1)
  expect(o.marcar).toBeLessThanOrEqual(2)
  await conferirEtapa(page, o, pago, "separação (metade)")

  // 2) Conferência das que já chegaram (a linha de etapas mostra quantas há em cada uma).
  await irParaEtapa(page, "Conferência")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(6)
  await capturar(page, "conferencia", info)
  await rajada(page, "Conferida")
  await expect.poll(() => contar("conferido_em is not null")).toBe(6)
  expect(await status()).toBe("separacao")
  await conferirEtapa(page, o, pago, "conferência (metade)")

  // 3) Bipagem das conferidas (leitor + contagem à mão), com a peça de 2 unidades.
  await irParaEtapa(page, "Bipagem")
  const campo = page.getByRole("textbox", { name: "Código da peça" })
  const primeiras = (await sim.banco.query("select sku,qtd from pedido_itens where pedido_id=$1 and conferido_em is not null order by ordem", [sim.pedido.id])).rows
  expect(primeiras.length).toBe(6)
  for (const { sku, qtd } of primeiras.slice(0, 4)) for (let n = 0; n < qtd; n++) { await campo.fill(sku); await campo.press("Enter") }
  await rajada(page, "Contar 1")
  await expect.poll(async () => Number((await sim.one("select coalesce(sum(qtd_bipada),0) n from pedido_itens where pedido_id=$1", [sim.pedido.id])).n)).toBe(primeiras.reduce((s, p) => s + p.qtd, 0))
  expect(await status()).toBe("separacao")
  await capturar(page, "bipagem", info)
  await conferirEtapa(page, o, pago, "bipagem (metade)")

  // 4) Voltar à Separação e achar o resto: o pedido avança sozinho para a Conferência.
  await irParaEtapa(page, "Separação")
  await rajada(page, "Achei")
  await expect.poll(status).toBe("conferencia")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(6)
  await conferirEtapa(page, o, pago, "separação (completa)")

  // 5) Conferir o resto: segue sozinho para a Bipagem.
  await rajada(page, "Conferida")
  await expect.poll(status).toBe("bipagem")
  await conferirEtapa(page, o, pago, "conferência (completa)")

  // 6) Bipar o resto: segue sozinho para a Nota fiscal.
  const restantes = (await sim.banco.query("select sku,qtd,qtd_bipada from pedido_itens where pedido_id=$1 and qtd_bipada<qtd order by ordem", [sim.pedido.id])).rows
  expect(restantes.length).toBe(6)
  for (const { sku, qtd } of restantes) for (let n = 0; n < qtd; n++) { await campo.fill(sku); await campo.press("Enter") }
  await expect.poll(status).toBe("faturamento")
  expect(await contar("qtd_bipada=qtd")).toBe(12)
  await conferirEtapa(page, o, pago, "bipagem (completa)")

  // 7) Nota fiscal e pedido LR (com copiar por peça): os dois feitos levam à Embalagem sozinhos.
  await expect(page.getByRole("button", { name: /^Copiar código PC-01/ })).toBeVisible()
  await semRolagemLateral(page)
  await capturar(page, "nota", info)
  await page.getByRole("button", { name: "Nota emitida", exact: true }).click()
  await expect.poll(async () => (await sim.one("select nf_emitida_em from pedidos where id=$1", [sim.pedido.id])).nf_emitida_em).not.toBeNull()
  expect(await status()).toBe("faturamento")
  await page.getByRole("button", { name: "Pedido LR feito", exact: true }).click()
  await expect.poll(status).toBe("embalagem")
  await conferirEtapa(page, o, pago, "nota fiscal")

  // 8) Embalagem: um botão.
  for (const item of ["Caixa do tamanho certo", "Nota impressa dentro", "Caixa fechada"]) await page.getByRole("checkbox", { name: item }).click()
  await page.getByRole("button", { name: "Embalado", exact: true }).click()
  await expect.poll(status).toBe("frete")
  await conferirEtapa(page, o, pago, "embalagem")

  // 9) Frete: sem peso; "Frete gerado" avança; o link de rastreio é colado aqui.
  await expect(page.getByRole("textbox", { name: /Peso da caixa/ })).toHaveCount(0)
  const link = page.getByRole("textbox", { name: "Link de rastreio (opcional)" })
  await link.fill("https://rastreio.exemplo/AB123"); await link.press("Enter")
  await expect.poll(async () => (await sim.one("select rastreio_url from pedidos where id=$1", [sim.pedido.id])).rastreio_url).toBe("https://rastreio.exemplo/AB123")
  await page.getByRole("button", { name: "Frete gerado", exact: true }).click()
  await expect.poll(status).toBe("pronto_envio")
  await conferirEtapa(page, o, pago, "frete")

  // 10) Postagem: um botão, sem campo de rastreio; "Postado" conclui o pedido.
  await expect(page.getByRole("textbox", { name: /rastreio/i })).toHaveCount(0)
  await page.getByRole("button", { name: "Postado", exact: true }).click()
  await expect.poll(status).toBe("enviado")
  await conferirEtapa(page, o, pago, "postagem")

  // 11) Concluídos: enviar rastreio (WhatsApp), a caminho, entregue.
  await page.goto("/concluidos")
  await expect(page.getByRole("tab", { name: /^Enviar rastreio/ })).toHaveAttribute("data-state", "active")
  await expect(page.getByRole("link", { name: "Cliente de teste" })).toBeVisible()
  await capturar(page, "concluidos", info)
  await semRolagemLateral(page)
  await page.getByRole("button", { name: "Mensagem enviada", exact: true }).click()
  await page.getByRole("tab", { name: /^A caminho/ }).click()
  await page.getByRole("button", { name: "Marcar entregue", exact: true }).click()
  await page.getByRole("tab", { name: /^Entregues/ }).click()
  await expect(page.getByRole("link", { name: "Cliente de teste" })).toBeVisible()
  await expect.poll(async () => (await sim.one("select entregue_em from pedidos where id=$1", [sim.pedido.id])).entregue_em).not.toBeNull()
  await conferirEtapa(page, o, pago, "concluídos")

  // Resumo: a sequência de status nunca volta; poucas requisições; nenhuma gravação peça a peça; nada de histórico por clique.
  const sequencia = (await sim.banco.query("select para from pedido_eventos where pedido_id=$1 and tipo='status' order by id", [sim.pedido.id])).rows.map((r) => r.para)
  const indices = sequencia.map((s) => ORDEM.indexOf(s))
  expect(indices.every((i) => i >= 0), `status fora da esteira: ${sequencia}`).toBe(true)
  expect(indices, `sequência de status: ${sequencia}`).toEqual([...indices].sort((a, b) => a - b))
  expect(o.alterar).toBe(0)
  expect(o.maxVoo).toBeLessThanOrEqual(1)
  expect(o.marcar).toBeGreaterThan(0)
  expect(o.marcar).toBeLessThanOrEqual(16)
  const tipos = (await sim.banco.query("select distinct tipo from pedido_eventos where pedido_id=$1", [sim.pedido.id])).rows.map((r) => r.tipo)
  for (const t of ["conferida", "etiquetada", "bipada", "desconferida", "desetiquetada"]) expect(tipos).not.toContain(t)
  expect(await o.avisos(["error", "warning"])).toEqual([])
})

test("esteira com pedido da Shopify: sem mensagem de rastreio, vai direto para a caminho", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  await montar(context, baseURL, { pecas: 3, origem: "shopify" })
  await sim.banco.query("update pedidos set forma_pagamento='Cartão',valor_pago=40,pago_em=now(),status='novo' where id=$1", [sim.pedido.id])
  const o = await observar(page)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(4)
  await rajada(page, "Achei")
  await expect.poll(status).toBe("conferencia")
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(4)
  await rajada(page, "Conferida")
  await expect.poll(status).toBe("bipagem")
  await expect(page.getByRole("button", { name: "Contar 1", exact: true })).toHaveCount(4)
  await rajada(page, "Contar 1")
  await expect.poll(() => contar("qtd_bipada>=1")).toBe(4)
  await rajada(page, "Contar 1")
  await expect.poll(status).toBe("faturamento")
  expect(o.maxVoo).toBeLessThanOrEqual(1)
  expect(await o.avisos()).toEqual([])
  await sim.banco.query("select mover_etapa($1,'enviado')", [sim.pedido.id]) // o resto da esteira (documentos) já foi coberto acima
  expect(await status()).toBe("enviado")
  await page.goto("/concluidos")
  await expect(page.getByRole("tab", { name: /^Enviar rastreio/ })).toContainText("0")
  await page.getByRole("tab", { name: /^A caminho/ }).click()
  await expect(page.getByRole("link", { name: "Cliente de teste" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("latência e um tempo limite do banco no meio: a fila se recupera sem perder clique nem desfazer a tela", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  await montar(context, baseURL, { pecas: 7 })
  await sim.banco.query("update pedidos set forma_pagamento='Cartão',valor_pago=40,pago_em=now(),status='novo' where id=$1", [sim.pedido.id])
  const o = await observar(page)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(8)
  let chamadas = 0
  await context.route((u) => u.origin === SUPABASE_FICTICIO && u.pathname === "/rest/v1/rpc/marcar_pecas", async (route) => {
    chamadas++
    await new Promise((r) => setTimeout(r, 250))
    if (chamadas === 2) return route.fulfill({ status: 500, json: { code: "57014", message: "canceling statement due to statement timeout" } })
    await route.fallback()
  })
  await rajada(page, "Achei", 0, 3)
  await page.waitForTimeout(120)
  await rajada(page, "Achei", 0, 3) // as 3 seguintes (as primeiras já saíram da lista)
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(2)
  await page.waitForTimeout(450)
  await rajada(page, "Achei") // as 2 últimas, em cima da falha
  // A tela nunca desfaz: as peças marcadas continuam fora da lista enquanto o banco se recupera.
  await expect(page.getByRole("button", { name: "Achei", exact: true })).toHaveCount(0)
  await expect.poll(() => contar("status='encontrado'"), { timeout: 20_000 }).toBe(8)
  await expect.poll(status).toBe("conferencia")
  expect(chamadas).toBeGreaterThanOrEqual(3)
  expect(o.maxVoo).toBeLessThanOrEqual(1)
  expect(o.alterar).toBe(0)
  expect(await o.avisos(["error"])).toEqual([])
  expect(sim.bloqueadas).toEqual([])
  await semRolagemLateral(page)
})

test("duas telas com Broadcast: a tela de quem marca não relê o pedido; a outra tela acompanha", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  await montar(context, baseURL, { pecas: 5 })
  await sim.banco.query("update pedidos set forma_pagamento='Cartão',valor_pago=40,pago_em=now(),status='novo' where id=$1", [sim.pedido.id])
  const outra = await context.newPage()
  const canais = new Map()
  for (const tela of [page, outra]) {
    await tela.routeWebSocket("wss://simulacao.supabase.test/**", (ws) => {
      ws.onMessage((raw) => {
        const [join, ref, topic, evento] = JSON.parse(raw.toString())
        if (evento === "phx_join") canais.set(tela, { ws, join, topic })
        ws.send(JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response: {} }]))
      })
    })
  }
  const o = await observar(page)
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await outra.goto(`/pedidos/${sim.pedido.id}`)
  await Promise.all([page.waitForLoadState("networkidle"), outra.waitForLoadState("networkidle")])
  await expect.poll(() => canais.size).toBe(2)
  let leiturasDaMinhaTela = 0, leiturasDaOutra = 0
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/rest/v1/pedido_itens") leiturasDaMinhaTela++ })
  outra.on("request", (r) => { if (new URL(r.url()).pathname === "/rest/v1/pedido_itens") leiturasDaOutra++ })
  // O banco avisa as duas telas depois de cada gravação de peças (o eco de quem gravou não deve reler nada).
  page.on("requestfinished", (r) => {
    if (new URL(r.url()).pathname !== "/rest/v1/rpc/marcar_pecas") return
    for (const { ws, join, topic } of canais.values()) ws.send(JSON.stringify([join, null, topic, "broadcast", { event: "mudou", type: "broadcast", payload: { t: "pedido_itens", p: [sim.pedido.id] } }]))
  })
  await rajada(page, "Achei")
  await expect.poll(status).toBe("conferencia")
  await rajada(page, "Conferida")
  await expect.poll(status).toBe("bipagem")
  await page.waitForTimeout(1800)
  expect(leiturasDaMinhaTela, "o eco do próprio lote não relê o pedido").toBe(0)
  // A outra tela (outra pessoa) recebeu o aviso, releu uma vez e mostra a Bipagem.
  await expect.poll(() => leiturasDaOutra).toBeGreaterThanOrEqual(1)
  await expect(outra.getByText("Bipagem", { exact: true }).first()).toBeVisible()
  await expect(outra.getByRole("textbox", { name: "Código da peça" })).toBeVisible()
  expect(o.maxVoo).toBeLessThanOrEqual(1)
  expect(await o.avisos()).toEqual([])
  await outra.close()
})

test("Concluir pedido pelo clique direito marca tudo como feito e vai para Concluídos", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  await montar(context, baseURL, { pecas: 2 })
  await sim.banco.query("update pedidos set forma_pagamento='Cartão',valor_pago=30,pago_em=now(),status='novo' where id=$1", [sim.pedido.id])
  const pago = await dinheiro()
  await page.goto("/")
  const cartao = page.getByRole("link", { name: /Cliente de teste/ })
  await cartao.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Concluir pedido", exact: true }).click()
  const dialogo = page.getByRole("dialog", { name: "Concluir o pedido?" })
  await expect(dialogo).toContainText("marcado como feito")
  await dialogo.getByRole("button", { name: "Concluir pedido", exact: true }).click()
  await expect.poll(status).toBe("enviado")
  const p = await sim.one("select nf_emitida_em,embalado_em,frete_gerado_em,postado_em from pedidos where id=$1", [sim.pedido.id])
  expect(Object.values(p).every(Boolean)).toBe(true)
  expect(Number((await sim.one("select count(*) n from pedido_itens where pedido_id=$1 and qtd_bipada=qtd and conferido_em is not null", [sim.pedido.id])).n)).toBe(3)
  expect(Number((await sim.one("select count(*) n from pedido_eventos where pedido_id=$1 and tipo='etapas_puladas'", [sim.pedido.id])).n)).toBe(1)
  expect(await dinheiro()).toEqual(pago)
  await page.goto("/concluidos")
  await expect(page.getByRole("link", { name: "Cliente de teste" })).toBeVisible()
  expect(sim.bloqueadas).toEqual([])
})

test("mover de etapa para trás pede confirmação e zera só o que vem depois", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000)
  await montar(context, baseURL, { pecas: 2 })
  await sim.banco.query("update pedidos set forma_pagamento='Cartão',valor_pago=30,pago_em=now(),status='novo' where id=$1", [sim.pedido.id])
  await sim.banco.query("update pedido_itens set status='encontrado',conferido_em=now(),etiquetado_em=now(),qtd_bipada=qtd,bipado_em=now() where pedido_id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='bipagem' where id=$1", [sim.pedido.id])
  await sim.banco.query("update pedidos set status='faturamento' where id=$1", [sim.pedido.id])
  await page.goto(`/pedidos/${sim.pedido.id}`)
  await page.getByRole("button", { name: "Mais ações", exact: true }).click()
  await page.getByRole("button", { name: "Conferência", exact: true }).or(page.getByRole("menuitem", { name: "Conferência", exact: true })).click()
  const dialogo = page.getByRole("dialog", { name: "Mover para Conferência?" })
  await expect(dialogo).toContainText("zerar")
  await dialogo.getByRole("button", { name: "Mover", exact: true }).click()
  await expect.poll(status).toBe("conferencia")
  expect(await contar("conferido_em is not null")).toBe(0)
  expect(await contar("status='encontrado'")).toBe(3)
  expect(await contar("qtd_bipada=0")).toBe(3)
  await expect(page.getByRole("button", { name: "Conferida", exact: true })).toHaveCount(3)
  expect(sim.bloqueadas).toEqual([])
})
