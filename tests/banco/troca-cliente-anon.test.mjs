import assert from 'node:assert/strict'
import { test } from 'vitest'
import { db, one } from './suporte.mjs'
import { fixture, publica, recusa } from './fixtures.mjs'

// V116: na página da troca a cliente recebia "Este pedido não está com você." ao escolher.
// A requisição real da cliente leva JWT com role "anon" (não é "sistema" nem ninguém do Time).
const comoCliente = async () => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','{"role":"anon"}',true)`)
  await db.exec('set local role anon')
}

test('V116: cliente sem login escolhe crédito, opção e carrinho na página da troca', async () => {
  const f = await fixture({ quantidade: 2 })
  await comoCliente()
  await one('select troca_escolher($1, $2, $3, null)', [f.troca.token, f.itens[0].id, 'credito'])
  await one('select troca_escolher($1, $2, $3, $4)', [f.troca.token, f.itens[1].id, 'opcao', f.opcoes[1].id])
  await one('select troca_carrinho($1, $2, $3, 1)', [f.troca.token, f.itens[1].id, f.opcoes[1].id])
  const dados = await publica(f)
  assert.equal(dados.pecas.find((p) => p.item_id === f.itens[0].id).escolha_tipo, 'credito')
  assert.equal(dados.pecas.find((p) => p.item_id === f.itens[1].id).escolha_tipo, 'opcao')
  await db.exec('reset role')
})

test('V116: o miolo do carrinho não é chamável por ninguém; troca_carrinho_definir segue conferindo o pedido', async () => {
  const f = await fixture()
  for (const papel of ['anon', 'authenticated']) {
    const r = await one("select has_function_privilege($1, 'public.troca_carrinho_aplicar(uuid,uuid)', 'execute') as pode", [papel])
    assert.equal(r.pode, false, papel)
  }
  // Pessoa logada que não é do Time (nem gestor) não define carrinho de pedido que não é dela.
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims','{"role":"authenticated","sub":"99999999-9999-4999-8999-999999999999"}',true)`)
  await db.exec('set local role authenticated')
  await recusa(() => one('select troca_carrinho_definir($1, $2)', [f.pecas[0].id, f.opcoes[0].id]), /não está com você/)
  await db.exec('reset role')
})
