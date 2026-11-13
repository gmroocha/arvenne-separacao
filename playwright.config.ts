import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.mjs",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:4175", actionTimeout: 10_000, colorScheme: "dark", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "celular", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "tablet", testMatch: "**/{acessibilidade,semantica}.spec.mjs", use: { browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "pc", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort --mode test",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: "https://simulacao.supabase.test", VITE_SUPABASE_ANON_KEY: "chave-publica-ficticia-sem-acesso" },
  },
})
