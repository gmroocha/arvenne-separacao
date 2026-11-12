import { expect, test } from "vitest"
import fc from "fast-check"
import { db, one } from "./suporte.mjs"
import { fixture, escolher, concluir } from "./fixtures.mjs"

const opcoes = { numRuns: 80, seed: 20261112, verbose: true }
const centavos = (v) => Math.round(Number(v) * 100)
// Oráculo de teste em centavos inteiros: não é usado pelo app para calcular preços.
const arredondar = (n, divisor = 100n) => (n + divisor / 2n) / divisor

test("propriedade: total = peças − desconto − Pix + frete, sem dinheiro negativo", async () => {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.record({ preco: fc.integer({ min: 0, max: 100_000 }), qtd: fc.integer({ min: 1, max: 8 }) }), { minLength: 1, maxLength: 8 }),
    fc.integer({ min: 0, max: 100 }), fc.boolean(), fc.integer({ min: 0, max: 20_000 }), fc.boolean(),
    async (itens, desconto, pix, frete, clientePaga) => {
      await db.exec("savepoint propriedade")
      try {
        const p = await one(`insert into pedidos(origem,status,desconto_tipo,desconto_valor,forma_pagamento,frete_pago_por,frete_cobrado)
          values ('whatsapp','em_aberto','percentual',$1,$2,$3,$4) returning id`, [desconto, pix ? "Pix" : "Cartão", clientePaga ? "cliente" : "arvenne", frete / 100])
        for (const i of itens) await db.query("insert into pedido_itens(pedido_id,origem,nome,qtd,preco) values ($1,'avulso','Teste',$2,$3)", [p.id, i.qtd, i.preco / 100])
        const v = await one("select subtotal,desconto,desconto_pix,frete_na_conta,total from v_pedidos where id=$1", [p.id])
        const sub = itens.reduce((s, i) => s + BigInt(i.preco * i.qtd), 0n)
        const desc = arredondar(sub * BigInt(desconto))
        const pixBruto = pix ? arredondar(sub * 10n) : 0n
        const descontoPix = pixBruto < sub - desc ? pixBruto : sub - desc
        const esperado = sub - desc - descontoPix + BigInt(clientePaga ? frete : 0)
        expect(centavos(v.total)).toBe(Number(esperado))
        expect(centavos(v.total)).toBe(centavos(v.subtotal) - centavos(v.desconto) - centavos(v.desconto_pix) + centavos(v.frete_na_conta))
        expect(Number(v.total)).toBeGreaterThanOrEqual(0)
      } finally { await db.exec("rollback to savepoint propriedade") }
    },
  ), opcoes)
})

test("propriedade: troca comum sem desconto conserva total + diferença líquida", async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 1, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }),
    fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 20_000 }),
    async (antigo, novo, qtd, cobertura) => {
      await db.exec("savepoint propriedade")
      try {
        const f = await fixture({ desconto: 0, precoOriginal: antigo / 100, qtdOriginal: qtd })
        await db.query("update troca_opcoes set preco=$1 where id=$2", [novo / 100, f.opcoes[0].id])
        await db.query("update trocas set cobrir_ate=$1 where id=$2", [cobertura / 100, f.troca.id])
        const antes = await one("select total from v_pedidos where id=$1", [f.pedido.id])
        await escolher(f)
        const anunciado = await one("select diferenca_total from v_troca_resumo where troca_id=$1", [f.troca.id])
        await concluir(f)
        const depois = await one("select total from v_pedidos where id=$1", [f.pedido.id])
        expect(centavos(depois.total)).toBe(centavos(antes.total) + centavos(anunciado.diferenca_total))
      } finally { await db.exec("rollback to savepoint propriedade") }
    },
  ), { ...opcoes, numRuns: 40 })
})

test('propriedade: troca com desconto, Pix e cobertura conserva centavos anunciados', async () => {
  await fc.assert(fc.asyncProperty(
    fc.integer({min:1,max:20_000}),fc.integer({min:0,max:30_000}),fc.integer({min:1,max:6}),
    fc.integer({min:0,max:70}),fc.boolean(),fc.boolean(),fc.integer({min:0,max:5_000}),
    async (original,novo,qtd,desc,percentual,pix,cobertura) => {
      await db.exec('savepoint propriedade')
      try {
        const sub=BigInt(original*qtd)
        const desconto=percentual?arredondar(sub*BigInt(desc)):BigInt(desc)
        const d=desconto>sub?sub:desconto
        const pixBruto=pix?arredondar(sub*10n):0n
        const pago=sub-d-(pixBruto>sub-d?sub-d:pixBruto)
        const novoUnit=(BigInt(novo)*pago*2n+sub)/(sub*2n)
        const novaCompra=novoUnit*BigInt(qtd)
        const dif=novaCompra-pago
        const coberto=dif>0n?(dif<BigInt(cobertura)?dif:BigInt(cobertura)):0n
        const f=await fixture({desconto:percentual?desc:desc/100,tipoDesconto:percentual?'percentual':'valor',pix,precoOriginal:original/100,qtdOriginal:qtd})
        await db.query('update troca_opcoes set preco=$1 where id=$2',[novo/100,f.opcoes[0].id])
        await db.query('update trocas set cobrir_ate=$1 where id=$2',[cobertura/100,f.troca.id])
        await escolher(f)
        const anunciado=await one('select diferenca_total from v_troca_resumo where troca_id=$1',[f.troca.id])
        expect(centavos(anunciado.diferenca_total)).toBe(Number(dif-coberto))
        await concluir(f)
        expect(centavos((await one('select total from v_pedidos where id=$1',[f.pedido.id])).total)).toBe(Number(novaCompra-coberto))
      } finally {await db.exec('rollback to savepoint propriedade')}
    },
  ),{...opcoes,numRuns:60})
})
