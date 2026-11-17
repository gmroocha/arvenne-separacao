import type { CamposPedido } from "@/lib/api"

// Espelho de faltas_para_pagar(jsonb), conferido contra o SQL nos testes de banco.
// Só valida cadastro; todos os valores e totais continuam sendo calculados no banco.
export function faltasPagar(p: CamposPedido): { campo: keyof CamposPedido; nome: string }[] {
  const f: { campo: keyof CamposPedido; nome: string }[] = []
  const texto = (v: unknown) => String(v ?? "").trim()
  const digitos = (v: unknown) => texto(v).replace(/\D/g, "")
  const falta = (campo: keyof CamposPedido, nome: string) => f.push({ campo, nome })
  const tipo = texto(p.frete_tipo)
  const pagoPor = texto(p.frete_pago_por)
  if (!texto(p.cliente_nome)) falta("cliente_nome", "nome da cliente")
  if (![10, 11].includes(digitos(p.cliente_telefone).length)) falta("cliente_telefone", "telefone com DDD")
  if (![11, 14].includes(digitos(p.cliente_cpf).length)) falta("cliente_cpf", "CPF ou CNPJ")
  if (!["PAC", "SEDEX", "retirada", "outro"].includes(tipo)) falta("frete_tipo", "tipo de frete")
  if (!["cliente", "arvenne"].includes(pagoPor)) falta("frete_pago_por", "quem paga o frete")
  else if (pagoPor === "cliente" && tipo && tipo !== "retirada" && !(Number(p.frete_cobrado) > 0))
    falta("frete_cobrado", "frete que a cliente pagou")
  if (tipo !== "retirada") {
    if (digitos(p.entrega_cep).length !== 8) falta("entrega_cep", "CEP")
    if (!texto(p.entrega_logradouro)) falta("entrega_logradouro", "rua")
    if (!texto(p.entrega_numero)) falta("entrega_numero", "número do endereço")
    if (!texto(p.entrega_bairro)) falta("entrega_bairro", "bairro")
    if (!texto(p.entrega_cidade)) falta("entrega_cidade", "cidade")
    if (texto(p.entrega_uf).length !== 2) falta("entrega_uf", "UF")
  }
  return f
}
