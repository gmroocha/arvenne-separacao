import { expect, test } from "vitest"
import { permitirLeitura } from "../../scripts/simulacao/rede.mjs"

const opcoes = { baseUrl: "http://127.0.0.1:4175", supabaseUrl: "https://teste.supabase.co" }
test.each([
  ["/rest/v1/pedido_itens", "PATCH"], ["/rest/v1/pedidos", "DELETE"],
  ["/functions/v1/catalogo-sync", "POST"], ["/functions/v1/catalogo-sync", "GET"],
  ["/storage/v1/object/fotos/clube/teste.webp", "POST"], ["/auth/v1/token", "POST"],
  ["/rest/v1/rpc/alterar_item", "POST"], ["/rest/v1/rpc/somar_venda", "POST"], ["/rest/v1/rpc/somar_venda", "GET"],
  ["/rest/v1/rpc/troca_carrinho", "POST"], ["/rest/v1/uma_tabela_nova", "GET"],
])("V31: bloqueia %s (%s)", (path, metodo) => {
  expect(permitirLeitura(opcoes.supabaseUrl + path, metodo, opcoes)).toBe(false)
})
test("V31: permite apenas as leituras conhecidas no domínio correto", () => {
  expect(permitirLeitura(opcoes.supabaseUrl + "/rest/v1/v_pedidos?select=*", "GET", opcoes)).toBe(true)
  expect(permitirLeitura(opcoes.supabaseUrl + "/rest/v1/rpc/troca_publica", "POST", opcoes)).toBe(true)
  expect(permitirLeitura("https://outro.test/rest/v1/pedidos", "GET", opcoes)).toBe(false)
  expect(permitirLeitura("https://teste.supabase.co.malicioso.test/rest/v1/pedidos", "GET", opcoes)).toBe(false)
  expect(permitirLeitura(opcoes.baseUrl + "/src/main.tsx", "GET", opcoes)).toBe(true)
  expect(permitirLeitura(opcoes.baseUrl + "/gravacao", "POST", opcoes)).toBe(false)
})

test.each([
  ['/rest/v1/rpc/troca_painel', 'POST'],
  ['/rest/v1/v_pedido_alteracoes?select=*', 'GET'],
])('V44: conferência permite a leitura nova %s sem liberar gravação', (path, metodo) => {
  expect(permitirLeitura(opcoes.supabaseUrl + path, metodo, opcoes)).toBe(true)
  expect(permitirLeitura(opcoes.supabaseUrl + path, 'PATCH', opcoes)).toBe(false)
  expect(permitirLeitura('https://outro.test' + path, metodo, opcoes)).toBe(false)
})
