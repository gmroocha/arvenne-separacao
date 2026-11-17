// Só repete uma operação que o PostgreSQL confirmou ter cancelado por tempo limite.
// Falha de rede/resposta perdida pode ter acontecido DEPOIS do commit: nunca repetir +1 nesse caso.
export async function gravarPeca<T extends { error: { code?: string; message?: string } | null }>(executar: () => PromiseLike<T>): Promise<T> {
  const resposta = await executar()
  if (resposta.error?.code !== "57014" || !/statement timeout/i.test(resposta.error.message ?? "")) return resposta
  await new Promise((resolve) => setTimeout(resolve, 350))
  return executar()
}
