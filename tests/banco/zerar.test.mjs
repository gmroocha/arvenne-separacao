import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { criarBanco } from "./suporte.mjs"

// Banco próprio: o script tem begin/commit e não pode rodar dentro da transação de cada teste.
test("zerar-testes.sql apaga pedidos, trocas e movimentos e mantém catálogo e feriados", async () => {
  const b = await criarBanco()
  const um = async (sql, args = []) => (await b.query(sql, args)).rows[0]
  try {
    const cli = await um("insert into clientes (nome) values ('Cliente Teste') returning id")
    const ped = await um(`insert into pedidos (origem, status, cliente_nome, cliente_id, valor_total, valor_pago, shopify_order_id)
      values ('shopify', 'separacao', 'Cliente Teste', $1, 100, 100, 9001) returning id`, [cli.id])
    const item = await um(`insert into pedido_itens (pedido_id, origem, nome, sku, qtd, preco, status, ordem)
      values ($1, 'shopify', 'Anel', 'A1', 1, 100, 'falta', 0) returning id`, [ped.id])
    await b.query("insert into bipagens (pedido_id, item_id, codigo, resultado) values ($1, $2, 'A1', 'ok')", [ped.id, item.id])
    await b.query("insert into pedido_eventos (pedido_id, tipo) values ($1, 'nota')", [ped.id])
    await b.query("insert into ocorrencias (pedido_id, item_id, tipo, motivo, etapa) values ($1, $2, 'falta_indevida', 'peca_encontrada', 'separacao')", [ped.id, item.id])
    const troca = await um("insert into trocas (pedido_id) values ($1) returning id", [ped.id])
    const peca = await um("insert into troca_pecas (troca_id, item_id) values ($1, $2) returning id", [troca.id, item.id])
    const op = await um(`insert into troca_opcoes (troca_peca_id, origem, nome, sku, preco)
      values ($1, 'site', 'Anel novo', 'NOVO', 120) returning id`, [peca.id])
    await b.query("insert into troca_escolhas (troca_peca_id, opcao_id, qtd) values ($1, $2, 1)", [peca.id, op.id])
    await b.query(`insert into movimentos_financeiros (pedido_id, troca_id, tipo, valor)
      values ($1, $2, 'troca_recebida', 20)`, [ped.id, troca.id])
    await b.query(`insert into creditos_cliente (troca_id, pedido_id, destino, valor) values ($1, $2, 'reembolso', 20)`, [troca.id, ped.id])
    await b.query("select nextval('pedido_whatsapp_seq')")
    const feriados = Number((await um("select count(*) n from feriados")).n)

    await b.exec(readFileSync("scripts/zerar-testes.sql", "utf8"))

    for (const t of ["creditos_cliente", "movimentos_financeiros", "troca_escolhas", "troca_opcoes", "troca_pecas", "trocas",
      "bipagens", "ocorrencias", "feedbacks", "pedido_eventos", "pedido_itens", "pedidos", "clientes"]) {
      expect(Number((await um(`select count(*) n from ${t}`)).n), t).toBe(0)
    }
    expect(Number((await um("select count(*) n from feriados")).n)).toBe(feriados)
    expect(Number((await um("select nextval('pedido_whatsapp_seq') v")).v)).toBe(1)
  } finally {
    await b.close()
  }
})
