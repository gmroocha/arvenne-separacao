import { expect, test } from "vitest"
import fc from "fast-check"
import { db, one } from "./suporte.mjs"

// Conservação do dinheiro em sequências aleatórias de operações num mesmo pedido:
// pedido do WhatsApp ou da Shopify, venda somada, retirada, falta parcial, troca por outra peça ou por crédito, cobertura, Pix,
// recebimento da diferença e devolução. Em qualquer ordem:
// - nenhum valor fica negativo e nunca se devolve mais do que foi pago;
// - depois de acertar tudo (receber, dar crédito, devolver), o que foi pago é igual ao total do pacote;
// - sem desconto, Pix e cobertura, o total do pacote é exatamente a soma das peças vivas (oráculo).
const c = (v) => Math.round(Number(v) * 100)
const estado = (id) => one("select total_geral,total_pago,a_devolver,public.saldo_financeiro(id) saldo from v_pedidos where id=$1", [id])

async function montar(cfg) {
  await db.exec("set local role authenticated")
  let p
  if (cfg.shopify) {
    // Shopify: preço pago por linha já com o desconto; o total cobrado é a soma exata das linhas.
    const pago = cfg.principal.map((i) => Math.round(i.preco * (100 - cfg.desconto)) / 100)
    const total = cfg.principal.reduce((s, i, n) => s + Math.round(pago[n] * 100) * i.qtd, 0) / 100
    p = await one(`insert into pedidos (origem,status,cliente_nome,valor_total,valor_pago,pago_em,shopify_order_id,numero)
      values ('shopify','novo','Cliente',$1,$1,now()-interval '1 minute',4242,'ARV-S') returning id`, [total])
    for (const [n, i] of cfg.principal.entries())
      await db.query("insert into pedido_itens (pedido_id,origem,nome,sku,qtd,preco,preco_pago,ordem) values ($1,'shopify','Peça',$2,$3,$4,$5,$6)", [p.id, `P${n}`, i.qtd, i.preco, pago[n], n])
  } else {
    p = await one(`insert into pedidos (origem,status,cliente_nome,desconto_tipo,desconto_valor,forma_pagamento,numero)
      values ('whatsapp','em_aberto','Cliente','percentual',$1,$2,'ARV-P') returning id`, [cfg.desconto, cfg.pix ? "Pix" : "Cartão"])
    for (const [n, i] of cfg.principal.entries())
      await db.query("insert into pedido_itens (pedido_id,origem,nome,sku,qtd,preco,ordem) values ($1,'clube','Peça',$2,$3,$4,$5)", [p.id, `P${n}`, i.qtd, i.preco, n])
    // Pagamento confirmado pelo caminho normal, com o valor que o banco calculou.
    const total = (await one("select total from v_pedidos where id=$1", [p.id])).total
    await db.query("update pedidos set valor_pago=$2,pago_em=now()-interval '1 minute',status='novo' where id=$1", [p.id, total])
  }
  await db.query("update pedidos set status='separacao' where id=$1", [p.id])
  if (cfg.somada.length) {
    const w = await one(`insert into pedidos (origem,status,cliente_nome,desconto_tipo,desconto_valor,forma_pagamento,somar_em)
      values ('whatsapp','em_aberto','Cliente','percentual',$1,$2,$3) returning id`, [cfg.descontoSomada, cfg.pixSomada ? "Pix" : "Cartão", p.id])
    for (const [n, i] of cfg.somada.entries())
      await db.query("insert into pedido_itens (pedido_id,origem,nome,sku,qtd,preco,ordem) values ($1,'clube','Adicional',$2,$3,$4,$5)", [w.id, `S${n}`, i.qtd, i.preco, n])
    const tw = (await one("select total from v_pedidos where id=$1", [w.id])).total
    await one("select somar_venda($1,$2,$3)", [w.id, cfg.pixSomada ? "Pix" : "Cartão", tw])
  }
  return p.id
}

const vivas = async (id) => (await db.query(
  "select id,qtd,preco from pedido_itens where pedido_id=$1 and status in ('pendente','encontrado') order by ordem,id", [id])).rows

async function aplicar(id, op) {
  const lista = await vivas(id)
  if (!lista.length && op.tipo !== "receber" && op.tipo !== "devolver") return
  const alvo = lista[op.k % Math.max(lista.length, 1)]
  if (op.tipo === "remover") {
    await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where id=$1", [alvo.id])
  } else if (op.tipo === "falta") {
    if (alvo.qtd >= 2) await one("select marcar_falta($1,1)", [alvo.id])
  } else if (op.tipo === "trocar") {
    await db.query("update pedido_itens set status='falta' where id=$1", [alvo.id])
    const t = await one("insert into trocas(pedido_id,cobrir_ate) values ($1,$2) returning id", [id, op.cobertura])
    const tp = await one("insert into troca_pecas(troca_id,item_id) values ($1,$2) returning id", [t.id, alvo.id])
    const o = await one("insert into troca_opcoes(troca_peca_id,origem,nome,sku,preco) values ($1,'clube','Nova','NOVA',$2) returning id", [tp.id, op.preco])
    await db.query("update trocas set status='enviada',enviada_em=now() where id=$1", [t.id])
    await one("select troca_aprovar($1,$2,$3,$4)", [t.id, tp.id, op.credito ? "credito" : "opcao", op.credito ? null : o.id])
  } else if (op.tipo === "receber") {
    await acertar(id, false)
  } else if (op.tipo === "desfazer") {
    // Equipe desfaz um recebimento/crédito já registrado (estorno), se o banco permitir.
    const t = await one("select id from trocas where pedido_id=$1 and acerto_status in ('recebido','credito_registrado') order by acerto_em desc limit 1", [id])
    if (t) {
      await db.exec("savepoint desfazer")
      try { await one("select troca_acerto($1,'pendente')", [t.id]); await db.exec("release savepoint desfazer") }
      catch (e) {
        await db.exec("rollback to savepoint desfazer")
        if (!/já foi devolvido|convertido em crédito/.test(e.message)) throw e
      }
    }
  } else if (op.tipo === "devolver") {
    if (c((await estado(id)).a_devolver) > 0) await one("select marcar_devolvido($1)", [id])
  }
}

// Registra o acerto pendente (cobrança ou crédito) na troca que o banco escolheu como alvo.
async function acertar(id, devolver) {
  for (let n = 0; n < 4; n++) {
    let e = await estado(id)
    if (devolver && c(e.a_devolver) > 0) { await one("select marcar_devolvido($1)", [id]); e = await estado(id) }
    const s = c(e.saldo)
    const alvo = (await one("select acerto_troca_id from pedidos where id=$1", [id])).acerto_troca_id
    if (s === 0 || !alvo) return
    await one("select troca_acerto($1,$2)", [alvo, s > 0 ? "recebido" : "credito_registrado"])
  }
}

async function conferir(id, cfg) {
  const e = await estado(id)
  expect(e.total_pago, "total pago desconhecido em pedido novo").not.toBeNull()
  expect(c(e.total_geral)).toBeGreaterThanOrEqual(0)
  expect(c(e.total_pago)).toBeGreaterThanOrEqual(0)
  expect(c(e.a_devolver)).toBeGreaterThanOrEqual(0)
  expect(c(e.a_devolver)).toBeLessThanOrEqual(c(e.total_pago))
  if (cfg.simples) {
    const soma = (await db.query("select coalesce(sum(qtd*preco),0) v from pedido_itens where pedido_id=$1 and status<>'removido'", [id])).rows[0].v
    expect(c(e.total_geral), "total do pacote = soma das peças vivas").toBe(c(soma))
  }
}

const peca = fc.record({ preco: fc.integer({ min: 1, max: 300 }), qtd: fc.integer({ min: 1, max: 3 }) })
const operacao = fc.oneof(
  fc.record({ tipo: fc.constant("remover"), k: fc.nat(9) }),
  fc.record({ tipo: fc.constant("falta"), k: fc.nat(9) }),
  fc.record({ tipo: fc.constant("trocar"), k: fc.nat(9), preco: fc.integer({ min: 1, max: 400 }), cobertura: fc.integer({ min: 0, max: 50 }), credito: fc.boolean() }),
  fc.record({ tipo: fc.constant("receber") }),
  fc.record({ tipo: fc.constant("devolver") }),
  fc.record({ tipo: fc.constant("desfazer") }),
)
const cenario = fc.record({
  simples: fc.boolean(), shopify: fc.boolean(),
  desconto: fc.integer({ min: 0, max: 30 }), pix: fc.boolean(),
  descontoSomada: fc.integer({ min: 0, max: 20 }), pixSomada: fc.boolean(),
  principal: fc.array(peca, { minLength: 1, maxLength: 3 }),
  somada: fc.array(peca, { minLength: 0, maxLength: 2 }),
  ops: fc.array(operacao, { minLength: 1, maxLength: 8 }),
}).map((x) => x.simples
  ? { ...x, desconto: 0, pix: false, descontoSomada: 0, pixSomada: false, ops: x.ops.map((o) => o.tipo === "trocar" ? { ...o, cobertura: 0 } : o) }
  : x)

test("propriedade: dinheiro se conserva em qualquer sequência de somada, troca, retirada e acerto", async () => {
  await fc.assert(fc.asyncProperty(cenario, async (cfg) => {
    await db.exec("savepoint conservacao")
    try {
      const id = await montar(cfg)
      await conferir(id, cfg)
      for (const op of cfg.ops) { await aplicar(id, op); await conferir(id, cfg) }
      await acertar(id, true)
      const fim = await estado(id)
      expect(c(fim.a_devolver), "nada a devolver depois do acerto").toBe(0)
      expect(c(fim.saldo), "saldo zerado depois do acerto").toBe(0)
      expect(c(fim.total_pago), "pago = total do pacote").toBe(c(fim.total_geral))
    } finally { await db.exec("rollback to savepoint conservacao") }
  }), { numRuns: Number(process.env.PROP_RUNS ?? 150), seed: Number(process.env.PROP_SEED ?? 20261112), verbose: true })
}, 600_000)
