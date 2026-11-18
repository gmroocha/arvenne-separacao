import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.mjs",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  // Cada teste tem o próprio banco em memória: dá para rodar vários ao mesmo tempo.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  forbidOnly: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4175", actionTimeout: 10_000, colorScheme: "dark", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    // Chromium de 390 px sem toque: serve para a maioria dos fluxos, mas NÃO reproduz o celular de verdade.
    { name: "celular", testIgnore: "**/celular-largura.spec.mjs", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    // Celular de verdade (toque, viewport "mobile", escala 3x): se algum elemento passar de 390 px o navegador alarga a
    // área visível, dá zoom para fora e deixa arrastar a tela para o lado. Só os testes de layout e a esteira rodam aqui.
    { name: "celular-toque", testMatch: "**/{celular-largura,esteira-ponta-a-ponta}.spec.mjs", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    { name: "tablet", testMatch: "**/{acessibilidade,semantica}.spec.mjs", use: { browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "pc", testIgnore: "**/celular-largura.spec.mjs", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort --mode test",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "https://simulacao.supabase.test", VITE_SUPABASE_ANON_KEY: "chave-publica-ficticia-sem-acesso" },
  },
})
