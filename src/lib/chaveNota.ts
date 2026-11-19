import { digitos } from "@/lib/formato"

// Chave de acesso da nota fiscal (NF-e): 44 números. Quem cola do Bling ou da Olist traz espaços, pontos ou traços;
// o banco guarda só os dígitos (pedidos.nf_chave, com CHECK de 44 dígitos).
export const TAMANHO_CHAVE_NOTA = 44

// Só os dígitos (sem cortar: quem digitou a mais precisa ver o aviso, não perder números calado).
export const limparChaveNota = (t: string | null | undefined) => digitos(t)

// Grupos de 4 números para conferir com o olho: "3524 0112 3456 ...".
export const formatarChaveNota = (t: string | null | undefined) => limparChaveNota(t).replace(/(\d{4})(?=\d)/g, "$1 ")

export const chaveNotaValida = (t: string | null | undefined) => limparChaveNota(t).length === TAMANHO_CHAVE_NOTA

// Mensagem para quando a chave não tem 44 números; nulo se está vazia (é opcional) ou certa.
export function avisoChaveNota(t: string | null | undefined): string | null {
  const n = limparChaveNota(t).length
  if (n === 0 || n === TAMANHO_CHAVE_NOTA) return null
  return n < TAMANHO_CHAVE_NOTA
    ? `Faltam ${TAMANHO_CHAVE_NOTA - n} números: a chave tem ${TAMANHO_CHAVE_NOTA} (você tem ${n}).`
    : `Sobram ${n - TAMANHO_CHAVE_NOTA} números: a chave tem ${TAMANHO_CHAVE_NOTA} (você tem ${n}).`
}
