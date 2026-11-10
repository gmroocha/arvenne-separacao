import { Copy, Send, Wallet, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { reais } from "@/lib/formato"
import type { DescontoTipo, FreteTipo, FretePagoPor, Pedido } from "@/lib/tipos"
import type { FormVenda } from "./form"

type Props = {
  pedido: Pedido
  form: FormVenda
  aoMudar: (parcial: Partial<FormVenda>) => void
  aoEnviar: () => void
  aoCopiar: () => void
  aoPago: () => void
  aoPerdida: () => void
  enviando: boolean
  prefixo: string
}

function Linha({ rotulo, children, forte }: { rotulo: string; children: React.ReactNode; forte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${forte ? "font-medium" : ""}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

function Dinheiro({ id, valor, aoMudar, rotulo }: { id: string; valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>R$</InputGroupAddon>
        <InputGroupInput id={id} inputMode="decimal" className="tabular-nums" placeholder="0,00" value={valor} onChange={(e) => aoMudar(e.target.value)} />
      </InputGroup>
    </Field>
  )
}

// Conteúdo do resumo: card fixo no PC, gaveta no celular. Os números vêm calculados do banco.
export default function ResumoVenda({ pedido, form, aoMudar, aoEnviar, aoCopiar, aoPago, aoPerdida, enviando, prefixo }: Props) {
  const p = (s: string) => `${prefixo}-${s}`
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Linha rotulo="Subtotal">{reais(pedido.subtotal)}</Linha>
        {pedido.desconto > 0 && <Linha rotulo="Desconto">− {reais(pedido.desconto)}</Linha>}
        {pedido.frete_tipo && <Linha rotulo={`Frete ${pedido.frete_tipo}`}>{reais(pedido.frete_na_conta)}</Linha>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Desconto</span>
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
          <Input
            inputMode="decimal"
            aria-label="Valor do desconto"
            className="tabular-nums"
            placeholder="0"
            value={form.desconto_valor}
            onChange={(e) => aoMudar({ desconto_valor: e.target.value })}
          />
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor={p("cupom")}>Cupom</FieldLabel>
        <Input id={p("cupom")} value={form.cupom} onChange={(e) => aoMudar({ cupom: e.target.value })} />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Frete</span>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          className="flex-wrap"
          value={form.frete_tipo ?? ""}
          onValueChange={(v) => aoMudar({ frete_tipo: (v || null) as FreteTipo | null })}
        >
          <ToggleGroupItem value="PAC">PAC</ToggleGroupItem>
          <ToggleGroupItem value="SEDEX">SEDEX</ToggleGroupItem>
          <ToggleGroupItem value="retirada">Retirada</ToggleGroupItem>
          <ToggleGroupItem value="outro">Outro</ToggleGroupItem>
        </ToggleGroup>
        {form.frete_tipo && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Quem paga</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={form.frete_pago_por}
                onValueChange={(v) => v && aoMudar({ frete_pago_por: v as FretePagoPor })}
              >
                <ToggleGroupItem value="cliente">Cliente</ToggleGroupItem>
                <ToggleGroupItem value="arvenne">Arvenne</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {form.frete_pago_por === "cliente" && (
              <Dinheiro id={p("frete-cobrado")} rotulo="Frete pago pela cliente" valor={form.frete_cobrado} aoMudar={(v) => aoMudar({ frete_cobrado: v })} />
            )}
          </>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-3xl font-semibold tabular-nums">{reais(pedido.total)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Button className="h-11 text-base" onClick={aoEnviar} disabled={enviando}>
          {enviando ? <Spinner /> : <Send />} Enviar à cliente
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={aoCopiar}>
            <Copy /> Copiar link
          </Button>
          <Button variant="outline" className="h-11" onClick={aoPago}>
            <Wallet /> Marcar como pago
          </Button>
        </div>
        <Button variant="ghost" className="text-muted-foreground" onClick={aoPerdida}>
          <XCircle /> Marcar como perdida
        </Button>
      </div>
    </div>
  )
}
