import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { completar, DADOS_COMPLETOS, pedidoWhats, recusa, somaFixture, zero } from './fixtures.mjs'
import { faltasPagar } from '../../src/lib/faltasPagar.ts'

test('V73: aviso da tela coincide com a regra SQL para cadastro, entrega, retirada e frete grátis', async () => {
  const casos = [
    {}, DADOS_COMPLETOS,
    ...Object.keys(DADOS_COMPLETOS).map((k) => ({ ...DADOS_COMPLETOS, [k]: null })),
    { ...DADOS_COMPLETOS, cliente_telefone: '(11) 98765-4321', cliente_cpf: '123.456.789-09', entrega_cep: '01001-000' },
    { ...DADOS_COMPLETOS, cliente_cpf: '11.222.333/0001-81', entrega_uf: '  SP  ' },
    { cliente_nome: 'Cliente', cliente_telefone: '11987654321', cliente_cpf: '12345678909', frete_tipo: ' retirada ', frete_pago_por: ' cliente ' },
    ...[null, 0, -1, 0.01, 22.08].map((frete_cobrado) => ({ ...DADOS_COMPLETOS, frete_pago_por: 'cliente', frete_cobrado })),
    { ...DADOS_COMPLETOS, frete_tipo: 'invalido', frete_pago_por: 'invalido' },
  ]
  for (const p of casos) {
    const sql = (await one('select faltas_para_pagar($1::jsonb) as f', [JSON.stringify(p)])).f
    expect(faltasPagar(p).map((f) => f.nome), JSON.stringify(p)).toEqual(sql)
  }
})

const faltas = async (dados) => (await one('select faltas_para_pagar($1::jsonb) f', [JSON.stringify(dados)])).f
const valores = (id) => one('select valor_pago,total_pago,total_geral,a_devolver,acerto_pendente,saldo_financeiro(id) saldo from v_pedidos where id=$1', [id])

test('V73: WhatsApp não sai de venda sem cliente, documento, frete e endereço; retirada dispensa só endereço', async () => {
  const p = await pedidoWhats('em_aberto')
  await db.query("update pedidos set cliente_telefone=null,cliente_cpf=null,entrega_numero=null,frete_tipo=null where id=$1", [p.id])
  await db.exec('set local role authenticated')
  await recusa(() => db.query("update pedidos set status='novo',valor_pago=80 where id=$1", [p.id]), /telefone com DDD, CPF ou CNPJ, tipo de frete.*número do endereço/)
  expect((await one('select status,valor_pago from pedidos where id=$1', [p.id]))).toMatchObject({ status: 'em_aberto', valor_pago: null })
  await completar(p.id, { frete_tipo: 'retirada', entrega_cep: null, entrega_logradouro: null, entrega_numero: null, entrega_bairro: null, entrega_cidade: null, entrega_uf: null })
  await db.query("update pedidos set status='novo',valor_pago=80 where id=$1", [p.id])
  expect((await one('select status from pedidos where id=$1', [p.id])).status).toBe('novo')
})

test('V73: frete da cliente exige valor positivo, grátis não exige valor; somar venda continua usando dados do principal', async () => {
  expect(await faltas({ ...DADOS_COMPLETOS, frete_pago_por: 'cliente' })).toEqual(['frete que a cliente pagou'])
  expect(await faltas({ ...DADOS_COMPLETOS, frete_pago_por: 'cliente', frete_cobrado: 12.50 })).toEqual([])
  expect(await faltas({ ...DADOS_COMPLETOS, frete_tipo: 'retirada', frete_pago_por: 'cliente' })).toEqual([])
  const { w, p } = await somaFixture()
  await one("select somar_venda($1,'Cartão',45)", [w.id])
  expect((await one('select somar_em,status from pedidos where id=$1', [w.id]))).toEqual({ somar_em: p.id, status: 'somada' })
})

test('V74: correção do frete muda o pago junto, mantém saldo e histórico, sem duplicar ao repetir', async () => {
  const p = await pedidoWhats()
  await db.query('update pedidos set valor_pago=80 where id=$1', [p.id])
  await db.exec('set local role authenticated')
  await one("select corrigir_frete_pedido($1,'cliente',22.08)", [p.id])
  expect(await valores(p.id)).toMatchObject({ valor_pago: '102.08', total_pago: '102.08', total_geral: '102.08', saldo: '0.00', acerto_pendente: false })
  await one("select corrigir_frete_pedido($1,'cliente',40)", [p.id])
  expect(await valores(p.id)).toMatchObject({ valor_pago: '120.00', total_geral: '120.00', saldo: '0.00' })
  await one("select corrigir_frete_pedido($1,'arvenne',null)", [p.id])
  expect(await valores(p.id)).toMatchObject({ valor_pago: '80.00', total_geral: '80.00', saldo: '0.00' })
  const notas = await one("select count(*)::int n from pedido_eventos where pedido_id=$1 and tipo='nota'", [p.id])
  await one("select corrigir_frete_pedido($1,'arvenne',null)", [p.id])
  expect(await one("select count(*)::int n from pedido_eventos where pedido_id=$1 and tipo='nota'", [p.id])).toEqual(notas)
  expect(notas.n).toBe(3)
})

test('V74: frete preserva Pix, descontos, vendas somadas e reembolso pendente', async () => {
  const { p, w } = await somaFixture()
  await db.query("update pedidos set forma_pagamento='Pix' where id=$1", [p.id])
  await db.query('update pedidos set valor_pago=(select total from v_pedidos where id=$1) where id=$1', [p.id])
  await one("select somar_venda($1,'Cartão',45)", [w.id])
  await one("select corrigir_frete_pedido($1,'cliente',22.08)", [p.id])
  expect(await valores(p.id)).toMatchObject({ total_geral: '147.08', total_pago: '147.08', saldo: '0.00' })
  await db.query("update pedido_itens set status='removido',observacao='cliente desistiu' where pedido_id=$1 and sku='AN'", [p.id])
  const antes = await valores(p.id)
  await one("select corrigir_frete_pedido($1,'cliente',40)", [p.id])
  const depois = await valores(p.id)
  expect([depois.a_devolver,depois.saldo,depois.acerto_pendente]).toEqual([antes.a_devolver,antes.saldo,antes.acerto_pendente])
})

test('V74: dados e correção financeira são uma gravação; falha não deixa edição parcial', async () => {
  const p = await pedidoWhats()
  await db.query('update pedidos set valor_pago=80 where id=$1', [p.id])
  await db.exec('set local role authenticated')
  await one("select corrigir_frete_pedido($1,'cliente',22.08,$2::jsonb)", [p.id, JSON.stringify({ cliente_nome: 'Nome corrigido', frete_tipo: 'SEDEX', frete_custo: 40 })])
  expect(await one('select cliente_nome,frete_tipo,frete_custo,frete_cobrado,valor_pago from pedidos where id=$1', [p.id])).toEqual({ cliente_nome: 'Nome corrigido', frete_tipo: 'SEDEX', frete_custo: '40.00', frete_cobrado: '22.08', valor_pago: '102.08' })
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',30,$2::jsonb)", [p.id, JSON.stringify({ cliente_nome: 'Não gravar', frete_tipo: 'invalido' })]), /check|inválido/)
  expect(await one('select cliente_nome,frete_cobrado,valor_pago from pedidos where id=$1', [p.id])).toEqual({ cliente_nome: 'Nome corrigido', frete_cobrado: '22.08', valor_pago: '102.08' })
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',30,$2::jsonb)", [p.id, JSON.stringify({ status: 'enviado' })]), /Campo não permitido/)
})

test('V74: anon, Shopify, Arquivo, venda aberta, somada, excluída e pagamento desconhecido não corrigem frete', async () => {
  const p = await pedidoWhats()
  await db.exec('set local role anon')
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [p.id]), /permission denied/)
  await db.exec('set local role authenticated')
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [p.id]), /valor pago registrado/)
  await db.query("update pedidos set valor_pago=80,origem='shopify' where id=$1", [p.id])
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [p.id]), /Shopify/)
  await db.query("update pedidos set origem='whatsapp',status='cancelado' where id=$1", [p.id])
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [p.id]), /Arquivo/)
  const aberta = await pedidoWhats('em_aberto')
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [aberta.id]), /ainda não foi paga/)
  const { w } = await somaFixture()
  await one("select somar_venda($1,'Cartão',45)", [w.id])
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [w.id]), /pedido principal/)
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [zero]), /não encontrado/)
  await one('select excluir_pedido($1)', [p.id])
  await recusa(() => one("select corrigir_frete_pedido($1,'cliente',20)", [p.id]), /não encontrado/)
})
