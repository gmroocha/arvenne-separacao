import { Check, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PedidoDetalhe } from "@/lib/api"
import { mascaraCep, mascaraDocumento, reais } from "@/lib/formato"
import { cn } from "@/lib/utils"
import CampoSalvo from "./CampoSalvo"
import { CopiarTudo, Faltando, FreteCusto, LinhaDado, ModalidadeFrete, Passo, type Dado, type Patch } from "./NotaFrete"

type Props = { pedido: PedidoDetalhe; patch: Patch }

// Etapa Frete (depois da Embalagem): gera-se o frete na Frenet e cola-se o link de rastreio. Sem peso. Um botão só:
// "Frete gerado" leva o pedido para a Postagem (o banco avança sozinho).
export default function Frete({ pedido, patch }: Props) {
  const cpf = pedido.cliente_cpf ? mascaraDocumento(pedido.cliente_cpf) : null
  const cep = pedido.entrega_cep ? mascaraCep(pedido.entrega_cep) : null
  const gerado = Boolean(pedido.frete_gerado_em)
  const diferenca = pedido.frete_custo != null ? pedido.frete_diferenca : null
  // Modalidade enviada: a salva ou, enquanto não houver, a que a cliente escolheu (gravada no "Frete gerado").
  const pedida = pedido.frete_tipo === "PAC" || pedido.frete_tipo === "SEDEX" ? pedido.frete_tipo : null
  const servico = pedido.frete_servico === "PAC" || pedido.frete_servico === "SEDEX" ? pedido.frete_servico : pedido.frete_servico ? null : pedida

  const dadosFrete: Dado[] = [
    { rotulo: "CEP", valor: cep },
    { rotulo: "Valor das peças (com desconto)", valor: reais(pedido.valor_pecas_pacote ?? pedido.valor_pecas_com_desconto) },
    { rotulo: "Tipo de envio", valor: pedido.frete_tipo },
    { rotulo: "CPF/CNPJ", valor: cpf },
    ...(pedido.cliente_ie ? [{ rotulo: "Inscrição estadual", valor: pedido.cliente_ie }] : []),
    { rotulo: "Nome ou razão social", valor: pedido.cliente_razao_social ?? pedido.cliente_nome },
    { rotulo: "Rua", valor: pedido.entrega_logradouro },
    { rotulo: "Número", valor: pedido.entrega_numero },
    { rotulo: "Complemento", valor: pedido.entrega_complemento },
    { rotulo: "Bairro", valor: pedido.entrega_bairro },
    { rotulo: "Cidade", valor: pedido.entrega_cidade },
    { rotulo: "UF", valor: pedido.entrega_uf },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Faltando pedido={pedido} patch={patch} />

      <Passo numero={1} icone={<Truck />} titulo="Frete" feito={gerado} feitoEm={pedido.frete_gerado_em} aoDesfazer={() => patch({ frete_gerado_em: null })} textoDesfazer="Desfazer frete gerado">
        <div className="flex flex-col">
          {dadosFrete.map((d) => (
            <LinhaDado key={d.rotulo} {...d} />
          ))}
        </div>
        <CopiarTudo dados={dadosFrete} />

        <ModalidadeFrete escolhida={servico} clientePediu={pedido.frete_tipo} aoEscolher={(v) => patch({ frete_servico: v })} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Cliente pagou de frete</span>
            <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums sm:h-9">
              {reais(pedido.frete_na_conta)}
              <span className="ml-1.5 truncate text-muted-foreground">
                {pedido.frete_pago_por === "arvenne" ? "· frete grátis" : pedido.origem === "shopify" ? "· no site" : "· no WhatsApp"}
              </span>
            </div>
          </div>
          <FreteCusto key={pedido.frete_custo ?? ""} custo={pedido.frete_custo} patch={patch} />
        </div>
        {/* Diferença calculada no banco (v_pedidos.frete_diferenca = o que a cliente pagou − custo da Frenet). */}
        {diferenca != null && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium tabular-nums",
              diferenca < 0 ? "bg-warning/10 text-warning" : "bg-muted text-foreground",
            )}
          >
            {diferenca < 0 ? `A Arvenne cobre ${reais(-diferenca)} de frete` : diferenca > 0 ? `Sobrou ${reais(diferenca)} do frete pago` : "Frete empatado: a cliente pagou o custo"}
          </p>
        )}
        <CampoSalvo
          id="frete-link"
          rotulo="Link de rastreio (opcional)"
          valor={pedido.rastreio_url}
          inputMode="url"
          aoSalvar={(v) => patch({ rastreio_url: v })}
        />
        {gerado ? (
          <Button variant="ghost" size="toque" className="w-fit" onClick={() => patch({ frete_gerado_em: null })}>
            Desfazer frete gerado
          </Button>
        ) : (
          <Button
            size="xl"
            className="w-full"
            onClick={() => patch({ frete_gerado_em: new Date().toISOString(), ...(!pedido.frete_servico && servico ? { frete_servico: servico } : {}) })}
          >
            <Check /> Frete gerado
          </Button>
        )}
      </Passo>

    </div>
  )
}
