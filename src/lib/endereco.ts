import { mascaraCep } from "@/lib/formato"
import type { Pedido } from "@/lib/tipos"

export function textoEndereco(p: Pedido): string {
  const rua = [p.entrega_logradouro, p.entrega_numero].filter(Boolean).join(", ")
  const linhas = [
    p.cliente_nome,
    [rua, p.entrega_complemento].filter(Boolean).join(" - "),
    p.entrega_bairro,
    [p.entrega_cidade, p.entrega_uf].filter(Boolean).join("/"),
    p.entrega_cep ? `CEP ${mascaraCep(p.entrega_cep)}` : null,
  ]
  return linhas.filter(Boolean).join("\n")
}
