import { Banknote, Barcode, CircleEllipsis, CreditCard, QrCode } from "lucide-react"
import { digitos, lerNumero, mascaraCep, mascaraDocumento, mascaraTelefone, numeroParaTexto } from "@/lib/formato"
import type { CamposPedido } from "@/lib/api"
import type { DescontoTipo, FreteTipo, FretePagoPor, Pedido } from "@/lib/tipos"

// Campos editáveis da venda. Valores em dinheiro ficam como texto enquanto a pessoa digita.
export type FormVenda = {
  cliente_id: string | null
  cliente_nome: string
  cliente_cpf: string
  cliente_razao_social: string
  cliente_ie: string
  cliente_email: string
  cliente_telefone: string
  entrega_cep: string
  entrega_logradouro: string
  entrega_numero: string
  entrega_complemento: string
  entrega_bairro: string
  entrega_cidade: string
  entrega_uf: string
  desconto_tipo: DescontoTipo
  desconto_valor: string
  cupom: string
  frete_tipo: FreteTipo | null
  frete_pago_por: FretePagoPor
  frete_cobrado: string
  observacoes: string
}

export function formDe(p: Pedido): FormVenda {
  return {
    cliente_id: p.cliente_id,
    cliente_nome: p.cliente_nome ?? "",
    cliente_cpf: mascaraDocumento(p.cliente_cpf ?? ""),
    cliente_razao_social: p.cliente_razao_social ?? "",
    cliente_ie: p.cliente_ie ?? "",
    cliente_email: p.cliente_email ?? "",
    cliente_telefone: p.cliente_telefone ?? "",
    entrega_cep: mascaraCep(p.entrega_cep ?? ""),
    entrega_logradouro: p.entrega_logradouro ?? "",
    entrega_numero: p.entrega_numero ?? "",
    entrega_complemento: p.entrega_complemento ?? "",
    entrega_bairro: p.entrega_bairro ?? "",
    entrega_cidade: p.entrega_cidade ?? "",
    entrega_uf: p.entrega_uf ?? "",
    desconto_tipo: p.desconto_tipo ?? "percentual",
    desconto_valor: numeroParaTexto(p.desconto_valor),
    cupom: p.cupom ?? "",
    frete_tipo: p.frete_tipo,
    frete_pago_por: p.frete_pago_por ?? "cliente",
    frete_cobrado: numeroParaTexto(p.frete_cobrado),
    observacoes: p.observacoes ?? "",
  }
}

const t = (s: string) => s.trim() || null

// Campo de dinheiro: vazio = limpar (null); texto que não lê = undefined (não grava, mantém o que já estava).
function dinheiro(texto: string): number | null | undefined {
  if (!texto.trim()) return null
  return lerNumero(texto) ?? undefined
}

// Nomes dos campos de dinheiro com texto que não dá para ler (para avisar; esses não são salvos).
export function dinheiroInvalido(f: FormVenda): string[] {
  const nomes: string[] = []
  if (dinheiro(f.desconto_valor) === undefined) nomes.push("desconto")
  if (dinheiro(f.frete_cobrado) === undefined) nomes.push("frete cobrado")
  return nomes
}

export function camposDe(f: FormVenda): CamposPedido {
  const desconto = dinheiro(f.desconto_valor)
  const frete = dinheiro(f.frete_cobrado)
  const campos: CamposPedido = {
    cliente_id: f.cliente_id,
    cliente_nome: t(f.cliente_nome),
    cliente_cpf: t(digitos(f.cliente_cpf)),
    cliente_razao_social: t(f.cliente_razao_social),
    cliente_ie: t(f.cliente_ie),
    cliente_email: t(f.cliente_email),
    cliente_telefone: t(digitos(mascaraTelefone(f.cliente_telefone))),
    entrega_cep: t(digitos(f.entrega_cep)),
    entrega_logradouro: t(f.entrega_logradouro),
    entrega_numero: t(f.entrega_numero),
    entrega_complemento: t(f.entrega_complemento),
    entrega_bairro: t(f.entrega_bairro),
    entrega_cidade: t(f.entrega_cidade),
    entrega_uf: t(f.entrega_uf.toUpperCase()),
    cupom: t(f.cupom),
    frete_tipo: f.frete_tipo,
    frete_pago_por: f.frete_tipo ? f.frete_pago_por : null,
    observacoes: t(f.observacoes),
  }
  if (desconto !== undefined) {
    campos.desconto_tipo = desconto == null ? null : f.desconto_tipo
    campos.desconto_valor = desconto
  }
  if (frete !== undefined) campos.frete_cobrado = frete
  return campos
}

// O texto em "nome" é o valor gravado no banco: não mudar.
export const FORMAS_PAGAMENTO = [
  { nome: "Pix", icone: QrCode },
  { nome: "Cartão", icone: CreditCard },
  { nome: "Boleto", icone: Barcode },
  { nome: "Dinheiro", icone: Banknote },
  { nome: "Outro", icone: CircleEllipsis },
]
