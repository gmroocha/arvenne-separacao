// Fase 3: ocorrências (erro na bipagem, falta indevida, problema na entrega). Só textos e mapas; nada é calculado aqui.
export type TipoOcorrencia = "erro_bipagem" | "falta_indevida" | "problema_entrega"

export const NOME_TIPO: Record<TipoOcorrencia, string> = {
  erro_bipagem: "Erro na bipagem",
  falta_indevida: "Falta indevida",
  problema_entrega: "Problema na entrega",
}

// Motivos do erro achado na Bipagem (a peça volta para a Separação).
export const MOTIVOS_ERRO_BIPAGEM = [
  { id: "peca_incorreta", nome: "Peça incorreta" },
  { id: "quantidade_incorreta", nome: "Quantidade incorreta" },
  { id: "peca_defeito", nome: "Peça com defeito" },
  { id: "peca_suja", nome: "Peça suja" },
  { id: "outro", nome: "Outro" },
] as const

// Motivos do problema na entrega e a etapa que a tela sugere (a mesma regra de etapa_da_ocorrencia no banco).
// "outro" não sugere etapa: a pessoa escolhe.
export const MOTIVOS_PROBLEMA_ENTREGA = [
  { id: "peca_errada", nome: "Peça errada", etapa: "bipagem" },
  { id: "quantidade_errada", nome: "Quantidade errada", etapa: "bipagem" },
  { id: "peca_defeito", nome: "Peça com defeito", etapa: "bipagem" },
  { id: "peca_suja", nome: "Peça suja", etapa: "bipagem" },
  { id: "nota_errada", nome: "Nota errada", etapa: "faturamento" },
  { id: "endereco_errado", nome: "Endereço errado", etapa: "embalagem" },
  { id: "envio_errado", nome: "Envio errado", etapa: "embalagem" },
  { id: "outro", nome: "Outro", etapa: null },
] as const

export type MotivoEntrega = (typeof MOTIVOS_PROBLEMA_ENTREGA)[number]["id"]

const NOME_MOTIVO: Record<string, string> = {
  ...Object.fromEntries(MOTIVOS_ERRO_BIPAGEM.map((m) => [m.id, m.nome])),
  ...Object.fromEntries(MOTIVOS_PROBLEMA_ENTREGA.map((m) => [m.id, m.nome])),
  peca_encontrada: "Peça existia",
}
export const nomeMotivo = (motivo: string) => NOME_MOTIVO[motivo] ?? motivo

export const etapaSugerida = (motivo: string): string | null => MOTIVOS_PROBLEMA_ENTREGA.find((m) => m.id === motivo)?.etapa ?? null

// Uma linha de v_ocorrencias.
export type Ocorrencia = {
  id: string
  pedido_id: string
  item_id: string | null
  tipo: TipoOcorrencia
  motivo: string
  etapa: string
  responsavel_id: string | null
  conferente_id: string | null
  registrado_por: string | null
  observacao: string | null
  created_at: string
  anulada_em: string | null
  responsavel_nome: string | null
  conferente_nome: string | null
  registrado_por_nome: string | null
  sku: string | null
  item_nome: string | null
  variante: string | null
}
