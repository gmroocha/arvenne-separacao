import { etapaDoResponsavel } from "@/lib/status"
import type { Membro, Pedido } from "@/lib/tipos"

// Iniciais para o avatar: primeira letra do primeiro e do último nome ("Ana Paula Souza" → "AS").
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  const letras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]
  return letras.toLocaleUpperCase("pt-BR")
}

// Responsável pela etapa atual do pedido (o desvio vale como a etapa de origem). Banco sem a coluna ou
// pessoa que saiu da lista: nada.
export function responsavelDaEtapaAtual(p: Pick<Pedido, "status" | "etapa_antes_desvio" | "responsaveis">, membros: Membro[]): Membro | null {
  const etapa = etapaDoResponsavel(p)
  const id = etapa ? (p.responsaveis ?? {})[etapa] : undefined
  return id ? (membros.find((m) => m.id === id) ?? null) : null
}

// Quem avisar quando uma etapa termina: a pessoa que faz a PRÓXIMA etapa, desde que esteja ativa e não seja quem
// acabou de concluir (a pessoa logada). Sem responsável na próxima etapa, ninguém.
export function quemAvisar(
  proximaEtapa: string | null,
  responsaveis: Record<string, string> | null | undefined,
  membros: Membro[],
  meuId?: string | null,
): Membro | null {
  const id = proximaEtapa ? (responsaveis ?? {})[proximaEtapa] : undefined
  if (!id || id === meuId) return null
  const quem = membros.find((m) => m.id === id)
  return quem?.ativo ? quem : null
}
