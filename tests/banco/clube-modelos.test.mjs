import { expect, test } from 'vitest'
import { db, one } from './suporte.mjs'
import { pedidoWhats, recusa, entrarComo } from './fixtures.mjs'

// V110/V111: Clube com produto "pai" e variantes (clube_modelos + pecas_clube.modelo_id) e gravação em lote.
const salvar = async (p) => (await one('select salvar_modelo_clube($1::jsonb) as r', [JSON.stringify(p)])).r
const contar = async () => ({
  modelos: (await one('select count(*)::int n from clube_modelos')).n,
  pecas: (await one('select count(*)::int n from pecas_clube')).n,
})
const entrar = () => entrarComo('ana@arvenne.test')

test('V110: produto com variantes: o pai guarda nome, foto, código e preço; cada variante é uma peça do Clube com o preço do pai', async () => {
  await entrar()
  const [r] = await salvar({
    codigo: 'AN-SOL', nome: 'Anel Solitário', preco: 89.9, foto_url: 'https://fotos.test/anel.webp',
    variantes: [
      { codigo: 'AN-SOL-14', variante: 'N°14' },
      { codigo: 'AN-SOL-16', variante: 'N°16', preco: 99 },
    ],
  })
  expect(r.modelo_id).toBeTruthy()
  expect(r.pecas).toHaveLength(2)
  const modelo = await one('select * from clube_modelos where id=$1', [r.modelo_id])
  expect(modelo).toMatchObject({ nome: 'Anel Solitário', codigo_base: 'AN-SOL', foto_url: 'https://fotos.test/anel.webp', ativo: true })
  expect(Number(modelo.preco)).toBe(89.9)
  const pecas = (await db.query('select codigo, nome, variante, foto_url, preco, modelo_id, ativo from pecas_clube order by codigo')).rows
  expect(pecas.map((x) => [x.codigo, x.variante, Number(x.preco)])).toEqual([['AN-SOL-14', 'N°14', 89.9], ['AN-SOL-16', 'N°16', 99]])
  for (const x of pecas) expect(x).toMatchObject({ nome: 'Anel Solitário', foto_url: 'https://fotos.test/anel.webp', modelo_id: r.modelo_id, ativo: true })
})

test('V110: tudo ou nada: uma variante inválida desfaz o produto inteiro e a mensagem diz a linha', async () => {
  await entrar()
  const antes = await contar()
  await recusa(() => salvar({ codigo: 'X', nome: 'X', variantes: [{ codigo: 'X-1', variante: 'A' }, { codigo: '', variante: 'B' }] }), /Linha 1: informe o código de cada variante/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', variantes: [{ codigo: 'X-1', variante: 'A' }, { codigo: 'x-1', variante: 'B' }] }), /se repete/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', variantes: [{ codigo: 'X-1', variante: '' }] }), /informe a variante/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', preco: -1, variantes: [{ codigo: 'X-1', variante: 'A' }] }), /negativo/)
  await recusa(() => salvar({ codigo: 'X', nome: 'X', variantes: [{ codigo: 'X-1', variante: 'A', preco: 'abc' }] }), /preço inválido/)
  expect(await contar()).toEqual(antes)
})

test('V111: cadastro em lote: peça simples e produto com variantes numa chamada só; um erro desfaz todas', async () => {
  await entrar()
  const antes = await contar()
  const r = await salvar([
    { codigo: 'BR-1', nome: 'Brinco Gota', preco: 30 },
    { codigo: 'AN-2', nome: 'Anel Duplo', preco: 50, variantes: [{ codigo: 'AN-2-14', variante: 'N°14' }, { codigo: 'AN-2-16', variante: 'N°16' }] },
    { codigo: 'CO-3', nome: 'Colar Fino', variante: 'DOURADO' },
  ])
  expect(r).toHaveLength(3)
  expect(r[0].modelo_id).toBeNull()
  expect(r[1].modelo_id).toBeTruthy()
  expect(r[2].pecas[0]).toMatchObject({ codigo: 'CO-3', variante: 'DOURADO', modelo_id: null })
  expect(await contar()).toEqual({ modelos: antes.modelos + 1, pecas: antes.pecas + 4 })
  const meio = await contar()
  await recusa(() => salvar([
    { codigo: 'OK-1', nome: 'Peça boa' },
    { codigo: 'OK-2', nome: 'Outra boa', variantes: [{ codigo: 'OK-2-A', variante: 'A' }] },
    { codigo: 'RUIM', nome: '' },
  ]), /Linha 3: informe o nome/)
  expect(await contar()).toEqual(meio)
  await recusa(() => salvar([]), /Nenhuma peça/)
  await recusa(() => salvar('texto'), /Informe a peça/)
})

test('V110: editar o produto: muda o pai, edita e acrescenta variantes e desativar o produto desativa as variantes', async () => {
  await entrar()
  const [r] = await salvar({ codigo: 'PU', nome: 'Pulseira', preco: 40, variantes: [{ codigo: 'PU-A', variante: 'DOURADO' }] })
  const a = r.pecas[0]
  const [e] = await salvar({
    id: r.modelo_id, codigo: 'PU2', nome: 'Pulseira Fina', preco: 45,
    variantes: [{ id: a.id, codigo: 'PU-A', variante: 'DOURADO' }, { codigo: 'PU-B', variante: 'PRATA', preco: 50 }],
  })
  expect(e.modelo_id).toBe(r.modelo_id)
  const pecas = (await db.query('select codigo, nome, variante, preco, modelo_id from pecas_clube order by codigo')).rows
  expect(pecas.map((x) => [x.codigo, x.nome, Number(x.preco)])).toEqual([['PU-A', 'Pulseira Fina', 45], ['PU-B', 'Pulseira Fina', 50]])
  expect((await one('select codigo_base, nome from clube_modelos where id=$1', [r.modelo_id]))).toEqual({ codigo_base: 'PU2', nome: 'Pulseira Fina' })
  await salvar({ id: r.modelo_id, codigo: 'PU2', nome: 'Pulseira Fina', preco: 45, ativo: false, variantes: [] })
  expect((await db.query('select ativo from pecas_clube where modelo_id=$1', [r.modelo_id])).rows.every((x) => x.ativo === false)).toBe(true)
  expect((await one('select ativo from clube_modelos where id=$1', [r.modelo_id])).ativo).toBe(false)
  await recusa(() => salvar({ id: r.modelo_id, codigo: 'PU2', nome: 'x', variantes: [{ id: '00000000-0000-0000-0000-000000000000', codigo: 'Z', variante: 'Z' }] }), /não encontrada neste produto/)
  await recusa(() => salvar({ id: '00000000-0000-0000-0000-000000000000', codigo: 'N', nome: 'N' }), /produto não encontrado/)
})

test('V110: uma variante vendida continua uma peça do Clube comum: o pedido aponta para ela e o dinheiro não muda', async () => {
  await db.exec('reset role')
  const p = await pedidoWhats('em_aberto')
  await entrar()
  const [r] = await salvar({ codigo: 'AN', nome: 'Anel', preco: 80, variantes: [{ codigo: 'AN-14', variante: 'N°14' }] })
  await db.exec('reset role')
  const v = r.pecas[0]
  const item = await one(`insert into pedido_itens(pedido_id,origem,peca_clube_id,sku,nome,variante,qtd,preco,ordem)
    values ($1,'clube',$2,$3,$4,$5,2,$6,9) returning *`, [p.id, v.id, v.codigo, v.nome, v.variante, v.preco])
  expect(item.peca_clube_id).toBe(v.id)
  const total = Number((await one('select subtotal from v_pedidos where id=$1', [p.id])).subtotal)
  expect(total).toBe(50 + 30 + 160) // as duas peças do fixture mais 2 x 80
  // Peça simples (sem pai) continua podendo ser gravada direto.
  await db.exec('set local role authenticated')
  expect((await one("insert into pecas_clube(codigo,nome) values ('S-1','Simples') returning modelo_id")).modelo_id).toBeNull()
})

test('V110: permissões: clube_modelos sem DELETE nem acesso do anon; salvar_modelo_clube só para quem tem login', async () => {
  const priv = await one(`select has_table_privilege('authenticated','public.clube_modelos','select,insert,update') as le,
    has_table_privilege('authenticated','public.clube_modelos','delete') as apaga,
    has_table_privilege('anon','public.clube_modelos','select') as anon_le,
    has_function_privilege('authenticated','public.salvar_modelo_clube(jsonb)','execute') as auth,
    has_function_privilege('anon','public.salvar_modelo_clube(jsonb)','execute') as anon,
    (select relrowsecurity from pg_class where relname='clube_modelos') as rls`)
  expect(priv).toEqual({ le: true, apaga: false, anon_le: false, auth: true, anon: false, rls: true })
  await db.exec('set local role anon')
  await recusa(() => one("select salvar_modelo_clube('{\"codigo\":\"A\",\"nome\":\"A\"}'::jsonb)"), /permission denied/)
  await recusa(() => one('select * from clube_modelos'), /permission denied/)
  await db.exec('reset role')
  await entrar()
  await recusa(() => db.query('delete from clube_modelos'), /permission denied/)
})
