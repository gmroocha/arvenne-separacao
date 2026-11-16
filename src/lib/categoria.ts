// Categoria da peça pelo começo do nome ("ANEL ...", "BRINCO ...", "MEIA ALIANÇA ..."), como a loja nomeia
// os produtos. Serve para filtrar listas na tela; não muda nada no banco.
const PREFIXOS: [string, string][] = [
  ["MEIA ALIANCA", "Anel"],
  ["ALIANCA", "Anel"],
  ["ANEL", "Anel"],
  ["EAR CUFF", "Brinco"],
  ["ARGOLA", "Brinco"],
  ["BRINCO", "Brinco"],
  ["PIERCING", "Piercing"],
  ["CHOKER", "Colar"],
  ["CORRENTE", "Colar"],
  ["COLAR", "Colar"],
  ["BERLOQUE", "Pingente"],
  ["PINGENTE", "Pingente"],
  ["BRACELETE", "Pulseira"],
  ["PULSEIRA", "Pulseira"],
  ["TORNOZELEIRA", "Tornozeleira"],
  ["CONJUNTO", "Conjunto"],
  ["KIT", "Conjunto"],
]

export const OUTROS = "Outros"

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "")

export function categoriaDoNome(nome: string | null | undefined): string {
  const n = semAcento((nome ?? "").trim().toUpperCase()).replace(/\s+/g, " ")
  return PREFIXOS.find(([p]) => n === p || n.startsWith(`${p} `))?.[1] ?? OUTROS
}

// Texto para busca: sem acento e em minúsculas ("Aliança" acha "ALIANCA").
export const paraBusca = (t: string | null | undefined) => semAcento(t ?? "").toLowerCase()
