import { useState } from "react"
import { Banknote, CircleEllipsis, CreditCard, Link2, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import RespDialog from "@/components/RespDialog"
import { lerNumero, numeroParaTexto } from "@/lib/formato"

// O texto em "nome" é o valor gravado no banco: não mudar.
const FORMAS = [
  { nome: "Pix", icone: QrCode },
  { nome: "Cartão", icone: CreditCard },
  { nome: "Link de pagamento", icone: Link2 },
  { nome: "Dinheiro", icone: Banknote },
  { nome: "Outro", icone: CircleEllipsis },
]

export type DadosPagamento = { forma: string; valor: number | null; pagoEm: string }

const agoraLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

type Props = {
  aberto: boolean
  aoMudar: (a: boolean) => void
  total: number
  aoConfirmar: (d: DadosPagamento) => Promise<void>
}

function Formulario({ total, aoConfirmar }: Pick<Props, "total" | "aoConfirmar">) {
  const [forma, setForma] = useState("Pix")
  const [valor, setValor] = useState(numeroParaTexto(total))
  const [quando, setQuando] = useState(agoraLocal())
  const [salvando, setSalvando] = useState(false)
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel>Forma de pagamento</FieldLabel>
        <ToggleGroup type="single" variant="outline" spacing={1} className="flex-wrap" value={forma} onValueChange={(v) => v && setForma(v)}>
          {FORMAS.map((f) => (
            <ToggleGroupItem key={f.nome} value={f.nome}>
              <f.icone /> {f.nome}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-valor">Valor pago</FieldLabel>
        <InputGroup>
          <InputGroupAddon>R$</InputGroupAddon>
          <InputGroupInput id="pg-valor" inputMode="decimal" className="tabular-nums" value={valor} onChange={(e) => setValor(e.target.value)} />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-quando">Data e hora do pagamento</FieldLabel>
        <Input id="pg-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Field>
      <Button
        className="h-11 text-base"
        disabled={salvando || !quando}
        onClick={async () => {
          setSalvando(true)
          try {
            await aoConfirmar({ forma, valor: lerNumero(valor), pagoEm: new Date(quando).toISOString() })
          } finally {
            setSalvando(false)
          }
        }}
      >
        {salvando && <Spinner />} Confirmar pagamento
      </Button>
    </FieldGroup>
  )
}

export default function PagoDialog({ aberto, aoMudar, total, aoConfirmar }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Marcar como pago" descricao="O pedido entra na expedição e o prazo de 48 h úteis começa a contar.">
      {aberto && <Formulario total={total} aoConfirmar={aoConfirmar} />}
    </RespDialog>
  )
}
