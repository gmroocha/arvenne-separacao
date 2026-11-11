// Usa respostas fictícias: nenhum acesso ou gravação no Supabase real.
// Requer npm run dev. Capturas ficam em capturas/, ignoradas pelo Git.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'

const base = process.env.APP_URL ?? 'http://127.0.0.1:5173'
mkdirSync('capturas', { recursive: true })
const browser = await chromium.launch()
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    const erros = []
    page.on('pageerror', e => erros.push(e.message))
    let falhar = true
    let leitura = 0
    const carrinhos = []
    const dados = {
      numero: 'TESTE-001', cliente: 'Teste', status: 'enviada',
      resumo: { total_pago: 160, diferenca: 0, diferenca_bruta: 0, coberto: 0, cobrir_ate: 10, pecas_total: 2, pecas_respondidas: 0 },
      pecas: [0, 1].map(n => ({
        item_id: `item-${n}`, nome: 'Anel de prata', sku: `ORIGINAL-${n}`, variante: 'Tamanho 18',
        qtd: 2, foto_url: null, valor_pago: 80, escolha_tipo: null, escolha_opcao_id: null, concluida: false,
        carrinho: [], valor_escolhido: 0, unidades: 0,
        opcoes: [{ id: `opcao-${n}`, nome: 'Anel de prata liso', sku: `NOVO-${n}`, variante: 'Tamanho 18',
          foto_url: null, valor: 120, valor_unit: 60, diferenca: 40, situacao: 'paga_diferenca' }],
      })),
    }
    // Banco de mentira: cada unidade da opção custa 60; a peça original custou 80.
    const recalcular = () => {
      for (const p of dados.pecas) {
        p.unidades = p.carrinho.reduce((n, c) => n + c.qtd, 0)
        p.valor_escolhido = p.unidades * 60
        p.escolha_tipo = p.unidades > 0 ? 'opcao' : p.escolha_tipo === 'credito' ? 'credito' : null
        p.escolha_opcao_id = p.unidades > 0 ? p.carrinho[0].opcao_id : null
      }
      dados.resumo.pecas_respondidas = dados.pecas.filter(p => p.escolha_tipo).length
      const bruta = dados.pecas.reduce((n, p) => n + (p.escolha_tipo === 'opcao' ? p.valor_escolhido - 80 : p.escolha_tipo === 'credito' ? -80 : 0), 0)
      dados.resumo.diferenca_bruta = bruta
      dados.resumo.coberto = Math.min(dados.resumo.cobrir_ate, Math.max(bruta, 0))
      dados.resumo.diferenca = bruta - dados.resumo.coberto
      if (dados.resumo.pecas_respondidas === 2) dados.status = 'respondida'
    }
    await context.route('**/rest/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/rpc/troca_publica')) {
        leitura++
        return route.fulfill({ json: dados })
      }
      if (url.pathname.endsWith('/rpc/troca_escolher')) {
        if (falhar) {
          falhar = false
          return route.fulfill({ status: 503, json: { message: 'Falha simulada. Tente novamente.' } })
        }
        const body = route.request().postDataJSON()
        const peca = dados.pecas.find(p => p.item_id === body.p_item)
        assert.ok(peca)
        assert.equal(body.p_token, 'teste-local')
        // "Quero esta" = carrinho só com essa opção na quantidade da peça; crédito esvazia o carrinho.
        peca.carrinho = body.p_tipo === 'opcao' ? [{ opcao_id: body.p_opcao, qtd: peca.qtd }] : []
        peca.escolha_tipo = body.p_tipo
        recalcular()
        return route.fulfill({ json: true })
      }
      if (url.pathname.endsWith('/rpc/troca_carrinho')) {
        const body = route.request().postDataJSON()
        const peca = dados.pecas.find(p => p.item_id === body.p_item)
        assert.ok(peca)
        assert.equal(body.p_token, 'teste-local')
        peca.carrinho = [...peca.carrinho.filter(c => c.opcao_id !== body.p_opcao), ...(body.p_qtd > 0 ? [{ opcao_id: body.p_opcao, qtd: body.p_qtd }] : [])]
        carrinhos.push(body.p_qtd)
        recalcular()
        return route.fulfill({ json: true })
      }
      return route.abort()
    })
    await page.goto(`${base}/t/teste-local`)
    await expect(page.getByText('Olá, Teste! 🤍')).toBeVisible()
    const primeira = page.getByRole('region', { name: 'Peça 1', exact: true })
    const segunda = page.getByRole('region', { name: 'Peça 2', exact: true })
    await primeira.getByRole('button', { name: 'Quero esta' }).click()
    await expect(page.getByText('Falha simulada. Tente novamente.')).toBeVisible()
    await expect(primeira.getByRole('button', { name: 'Quero esta' })).toBeEnabled()
    await primeira.getByRole('button', { name: 'Quero esta' }).click()
    // Carrinho com as 2 unidades da peça: aparece o seletor e a linha "Você escolheu"
    await expect(primeira.getByRole('button', { name: 'Quero esta' })).toHaveCount(0)
    await expect(primeira.getByRole('group', { name: 'NOVO-0' }).getByText('2', { exact: true })).toBeVisible()
    await expect(primeira.getByText(/Você escolheu R\$\s*120,00 de R\$\s*80,00/)).toBeVisible()
    await expect(primeira.getByText('Você paga a diferença.')).toBeVisible()
    // Tira 1 pelo seletor: 60 de 80, a diferença vira crédito
    await primeira.getByRole('button', { name: 'Tirar uma: NOVO-0' }).click()
    await expect(primeira.getByText(/Você escolheu R\$\s*60,00 de R\$\s*80,00/)).toBeVisible()
    await expect(primeira.getByText('A diferença vira crédito para você.')).toBeVisible()
    // Coloca de volta (mais 1): 2 unidades, 120 de 80
    await primeira.getByRole('button', { name: 'Colocar mais uma: NOVO-0' }).click()
    await expect(primeira.getByText(/Você escolheu R\$\s*120,00 de R\$\s*80,00/)).toBeVisible()
    await expect.poll(() => carrinhos).toEqual([1, 2])
    // Loja cobre até R$ 10: diferença 40, coberto 10, a cliente paga 30
    await expect(page.getByText(/A loja cobre até R\$\s*10,00/)).toBeVisible()
    const resumoCob = page.getByRole('region', { name: 'Resumo' })
    await expect(resumoCob.getByText('A loja cobre', { exact: true })).toBeVisible()
    await expect(resumoCob.getByText(/10,00/)).toBeVisible()
    await expect(resumoCob.getByText(/30,00/)).toBeVisible()
    await segunda.getByRole('button', { name: /Prefiro crédito/ }).click()
    await expect(page.getByText('Recebemos todas as suas escolhas.', { exact: false })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumo' }).getByText('Seu crédito')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumo' }).getByText(/40,00/)).toBeVisible()
    await expect(primeira.getByText(/^R\$\s*120,00$/)).toBeVisible() // valor da peça nova
    await page.screenshot({ path: `capturas/troca-testada-${width}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(erros, [])
    dados.status = 'concluida'
    dados.pecas.forEach(p => { p.concluida = true })
    await page.reload()
    await expect(page.getByText('Troca concluída. Obrigada!')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quero esta' })).toHaveCount(0)
    assert.ok(leitura >= 4)
    console.log(`OK ${width}px: erro recuperável, escolha, seletor de quantidade, crédito, resumo, conclusão e largura`)
    await context.close()
  }
} finally {
  await browser.close()
}
