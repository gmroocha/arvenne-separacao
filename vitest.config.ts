import path from "node:path"
import { defineConfig } from "vitest/config"

const alias = { "@": path.resolve(import.meta.dirname, "src") }

export default defineConfig({
  resolve: { alias },
  test: {
    allowOnly: false,
    projects: [
      {
        resolve: { alias },
        test: { name: "unidade", include: ["tests/unidade/**/*.test.{ts,mjs}"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "banco",
          include: ["tests/banco/**/*.test.mjs"],
          setupFiles: ["tests/banco/setup.mjs"],
          environment: "node",
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
