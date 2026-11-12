import { useState } from "react"
import { Copy, Send, Store, User, Wallet, XCircle } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import { Button } from "@/components/ui/button"
import { FormaPagamento } from "@/components/comum/FormaPagamento"
import { LinhaValor } from "@/components/comum/LinhaValor"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { reais } from "@/lib/formato"
import { COR_PAC, COR_SEDEX } from "@/lib/selo"
import type { DescontoTipo, FreteTipo, FretePagoPor, Pedido } from "@/lib/tipos"
import type { FormVenda } from "./form"

type Props = {
  pedido: Pedido
  form: FormVenda
  aoMudar: (parcial: Partial<FormVenda>) => void
  aoForma: (forma: string | null) => void
  aoEnviar: () => void
  aoCopiar: () => void
  aoPago: () => void
  aoPerdida: () => void
  enviando: boolean
  prefixo: string
}

function Dinheiro({ id, valor, aoMudar, rotulo }: { id: string; valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
      <CampoReais id={id} value={valor} onValueChange={aoMudar} />
    </Field>
  )
}

// Conteúdo do resumo: card fixo no PC, gaveta no celular. Os números vêm calculados do banco.
// PAC e SEDEX moram em lib/selo; reexportados para a Nota e frete.
export { COR_PAC, COR_SEDEX }

export default function ResumoVenda({ pedido, form, aoMudar, aoForma, aoEnviar, aoCopiar, aoPago, aoPerdida, enviando, prefixo }: Props) {
  const p = (s: string) => `${prefixo}-${s}`
  // A forma muda na hora na tela; o banco grava em seguida (o total com Pix vem dele depois).
  const [formaLocal, setFormaLocal] = useState<string | null | undefined>(undefined)
  const forma = formaLocal !== undefined ? formaLocal : pedido.forma_pagamento
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel>Forma de pagamento</FieldLabel>
        <FormaPagamento
          valor={forma}
          aoMudar={(f) => {
            setFormaLocal(f)
            aoForma(f)
          }}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <LinhaValor rotulo="Subtotal" valor={reais(pedido.subtotal)} />
        {pedido.desconto > 0 && <LinhaValor rotulo="Desconto" valor={`− ${reais(pedido.desconto)}`} />}
        {pedido.desconto_pix > 0 && <LinhaValor rotulo="Desconto Pix (10%)" valor={`− ${reais(pedido.desconto_pix)}`} />}
        {pedido.frete_tipo && <LinhaValor rotulo={`Frete ${pedido.frete_tipo}`} valor={reais(pedido.frete_na_conta)} />}
      </div>

      <Field>
        <FieldLabel>Desconto</FieldLabel>
        <div className="flex gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={form.desconto_tipo}
            onValueChange={(v) => v && aoMudar({ desconto_tipo: v as DescontoTipo })}
          >
            <ToggleGroupItem value="valor" aria-label="Desconto em reais">
              R$
            </ToggleGroupItem>
            <ToggleGroupItem value="percentual" aria-label="Desconto em porcentagem">
              %
            </ToggleGroupItem>
          </ToggleGroup>
          {form.desconto_tipo === "valor" ? (
            <CampoReais aria-label="Valor do desconto" value={form.desconto_valor} onValueChange={(v) => aoMudar({ desconto_valor: v })} />
          ) : (
            <InputGroup>
              <InputGroupInput
                inputMode="decimal"
                aria-label="Porcentagem do desconto"
                className="tabular-nums"
                placeholder="0"
                value={form.desconto_valor}
                onChange={(e) => aoMudar({ desconto_valor: e.target.value })}
              />
              <InputGroupAddon align="inline-end">%</InputGroupAddon>
            </InputGroup>
          )}
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor={p("cupom")}>Cupom</FieldLabel>
        <Input id={p("cupom")} value={form.cupom} onChange={(e) => aoMudar({ cupom: e.target.value })} />
      </Field>

      <Field>
        <FieldLabel>Frete</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          className="flex-wrap"
          value={form.frete_tipo ?? ""}
          onValueChange={(v) => aoMudar({ frete_tipo: (v || null) as FreteTipo | null })}
        >
          {/* PAC laranja, SEDEX verde (iguais às da Nota e frete). */}
          <ToggleGroupItem value="PAC" className={COR_PAC}>
            PAC
          </ToggleGroupItem>
          <ToggleGroupItem value="SEDEX" className={COR_SEDEX}>
            SEDEX
          </ToggleGroupItem>
          <ToggleGroupItem value="retirada">Retirada</ToggleGroupItem>
          <ToggleGroupItem value="outro">Outro</ToggleGroupItem>
        </ToggleGroup>
        {form.frete_tipo && (
          <>
            <Field>
              <FieldLabel>Quem paga</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.frete_pago_por}
                onValueChange={(v) => v && aoMudar({ frete_pago_por: v as FretePagoPor })}
              >
                <ToggleGroupItem value="cliente">
                  <User /> Cliente
                </ToggleGroupItem>
                <ToggleGroupItem value="arvenne">
                  <Store /> Arvenne
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {form.frete_pago_por === "cliente" && (
              <Dinheiro id={p("frete-cobrado")} rotulo="Frete pago pela cliente" valor={form.frete_cobrado} aoMudar={(v) => aoMudar({ frete_cobrado: v })} />
            )}
          </>
        )}
      </Field>

      <div className="border-t pt-3">
        <LinhaValor total rotulo="Total" valor={reais(pedido.total)} />
      </div>

      <div className="flex flex-col gap-2">
        <Button size="xl" onClick={aoEnviar} disabled={enviando}>
          {enviando ? <Spinner /> : <Send />} Enviar à cliente
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="xl" onClick={aoCopiar}>
            <Copy /> Copiar link
          </Button>
          <Button variant="outline" size="xl" onClick={aoPago}>
            <Wallet /> Marcar como pago
          </Button>
        </div>
        <Button variant="ghost" size="toque" className="text-muted-foreground" onClick={aoPerdida}>
          <XCircle /> Marcar como perdida
        </Button>
      </div>
    </div>
  )
}
