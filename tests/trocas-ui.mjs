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
    const dados = {
      numero: 'TESTE-001', cliente: 'Teste', status: 'enviada',
      resumo: { total_pago: 160, diferenca: 0, pecas_total: 2, pecas_respondidas: 0 },
      pecas: [0, 1].map(n => ({
        item_id: `item-${n}`, nome: 'Anel de prata', sku: `ORIGINAL-${n}`, variante: 'Tamanho 18',
        qtd: 2, foto_url: null, valor_pago: 80, escolha_tipo: null, escolha_opcao_id: null, concluida: false,
        opcoes: [{ id: `opcao-${n}`, nome: 'Anel de prata liso', sku: `NOVO-${n}`, variante: 'Tamanho 18',
          foto_url: null, valor: 120, diferenca: 40, situacao: 'paga_diferenca' }],
      })),
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
        peca.escolha_tipo = body.p_tipo
        peca.escolha_opcao_id = body.p_opcao
        dados.resumo.pecas_respondidas = dados.pecas.filter(p => p.escolha_tipo).length
        dados.resumo.diferenca = dados.pecas.reduce((n, p) => n + (p.escolha_tipo === 'opcao' ? 40 : p.escolha_tipo === 'credito' ? -80 : 0), 0)
        if (dados.resumo.pecas_respondidas === 2) dados.status = 'respondida'
        return route.fulfill({ json: true })
      }
      return route.abort()
    })
    await page.goto(`${base}/t/teste-local`)
    await expect(page.getByText('Olá, Teste.')).toBeVisible()
    const primeira = page.getByRole('region', { name: 'Peça 1', exact: true })
    const segunda = page.getByRole('region', { name: 'Peça 2', exact: true })
    await primeira.getByRole('button', { name: 'Quero esta' }).click()
    await expect(page.getByText('Falha simulada. Tente novamente.')).toBeVisible()
    await expect(primeira.getByRole('button', { name: 'Quero esta' })).toBeEnabled()
    await primeira.getByRole('button', { name: 'Quero esta' }).click()
    await expect(primeira.getByRole('button', { name: 'Escolhida' })).toBeDisabled()
    await segunda.getByRole('button', { name: /Prefiro crédito/ }).click()
    await expect(page.getByText('Recebemos todas as suas escolhas.', { exact: false })).toBeVisible()
    await expect(page.getByText(/Com as suas escolhas:.*40,00 de crédito/)).toBeVisible()
    await page.screenshot({ path: `capturas/troca-testada-${width}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(erros, [])
    dados.status = 'concluida'
    dados.pecas.forEach(p => { p.concluida = true })
    await page.reload()
    await expect(page.getByText('Troca concluída. Obrigada!')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Quero esta' })).toHaveCount(0)
    assert.ok(leitura >= 4)
    console.log(`OK ${width}px: erro recuperável, escolha, crédito, resumo, conclusão e largura`)
    await context.close()
  }
} finally {
  await browser.close()
}
