import type { Endereco } from "@/lib/tipos"

// ViaCEP: grátis, chamado do navegador. Devolve null se o CEP não existir.
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  const d = cep.replace(/\D/g, "")
  if (d.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error("Não foi possível consultar o CEP")
  const r = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
  if (r.erro) return null
  return { logradouro: r.logradouro ?? "", bairro: r.bairro ?? "", cidade: r.localidade ?? "", uf: r.uf ?? "" }
}
