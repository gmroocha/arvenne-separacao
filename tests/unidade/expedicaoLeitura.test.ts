import { expect, test, vi } from "vitest"

// V115 (19/11/2026): a lista da Expedição relia a cada 60 s fixos, com ou sem canal ao vivo. Com 6 aparelhos isso
// sobrecarregou o banco gratuito (tempo esgotado em série, app fora do ar ~10 min). Ela usa o mesmo intervalo das
// outras listas: 5 min com o canal ao vivo, 60 s só quando o canal cai.
const opcoes = vi.hoisted(() => ({ ultima: undefined as { refetchInterval?: unknown } | undefined }))
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQuery: (o: { refetchInterval?: unknown }) => { opcoes.ultima = o; return {} },
  useQueryClient: () => ({}),
}))
vi.mock("@/lib/supabase", () => ({ supabase: {} }))

test("V115: a Expedição relê pelo intervalo das listas, não a cada 60 s fixos", async () => {
  const { usePedidosExpedicao } = await import("@/lib/api")
  const { intervaloListas } = await import("@/lib/tempoReal")
  usePedidosExpedicao()
  expect(opcoes.ultima?.refetchInterval).toBe(intervaloListas)
})
