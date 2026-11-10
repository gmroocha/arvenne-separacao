import { lerNumero, mascaraCep, mascaraCpf, mascaraTelefone, numeroParaTexto } from "@/lib/formato"
import type { CamposPedido } from "@/lib/api"
import type { DescontoTipo, FreteTipo, FretePagoPor, Pedido } from "@/lib/tipos"

// Campos editáveis da venda. Valores em dinheiro ficam como texto enquanto a pessoa digita.
export type FormVenda = {
  cliente_id: string | null
  cliente_nome: string
  cliente_cpf: string
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
  frete_custo: string
  observacoes: string
  carrinho_url: string
}

export function formDe(p: Pedido): FormVenda {
  return {
    cliente_id: p.cliente_id,
    cliente_nome: p.cliente_nome ?? "",
    cliente_cpf: mascaraCpf(p.cliente_cpf ?? ""),
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
    frete_custo: numeroParaTexto(p.frete_custo),
    observacoes: p.observacoes ?? "",
    carrinho_url: p.carrinho_url ?? "",
  }
}

const t = (s: string) => s.trim() || null

export function camposDe(f: FormVenda): CamposPedido {
  const desconto = lerNumero(f.desconto_valor)
  return {
    cliente_id: f.cliente_id,
    cliente_nome: t(f.cliente_nome),
    cliente_cpf: t(f.cliente_cpf),
    cliente_email: t(f.cliente_email),
    cliente_telefone: t(mascaraTelefone(f.cliente_telefone)),
    entrega_cep: t(f.entrega_cep),
    entrega_logradouro: t(f.entrega_logradouro),
    entrega_numero: t(f.entrega_numero),
    entrega_complemento: t(f.entrega_complemento),
    entrega_bairro: t(f.entrega_bairro),
    entrega_cidade: t(f.entrega_cidade),
    entrega_uf: t(f.entrega_uf.toUpperCase()),
    desconto_tipo: desconto == null ? null : f.desconto_tipo,
    desconto_valor: desconto,
    cupom: t(f.cupom),
    frete_tipo: f.frete_tipo,
    frete_pago_por: f.frete_tipo ? f.frete_pago_por : null,
    frete_cobrado: lerNumero(f.frete_cobrado),
    frete_custo: lerNumero(f.frete_custo),
    observacoes: t(f.observacoes),
    carrinho_url: t(f.carrinho_url),
  }
}
