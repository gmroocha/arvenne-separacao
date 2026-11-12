import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { FormaPagamento } from "@/components/comum/FormaPagamento"
import CampoReais from "@/components/CampoReais"
import RespDialog from "@/components/RespDialog"
import { lerNumero, numeroParaTexto } from "@/lib/formato"

export type DadosPagamento = { forma: string; valor: number | null; pagoEm: string }

// Data e hora de São Paulo no formato do campo datetime-local (sem depender do fuso do aparelho).
const agoraLocal = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

type Props = {
  aberto: boolean
  aoMudar: (a: boolean) => void
  total: number
  formaInicial?: string | null
  // Grava a forma escolhida e devolve o total já recalculado pelo banco (o desconto do Pix vem do SQL).
  aoMudarForma: (forma: string) => Promise<number | null>
  aoConfirmar: (d: DadosPagamento) => Promise<void>
}

function Formulario({ total, formaInicial, aoMudarForma, aoConfirmar }: Pick<Props, "total" | "formaInicial" | "aoMudarForma" | "aoConfirmar">) {
  const [forma, setForma] = useState(formaInicial ?? "Pix")
  const [valor, setValor] = useState(numeroParaTexto(total))
  const [calculando, setCalculando] = useState(false)
  const pedido = useRef(0)

  async function trocarForma(nova: string) {
    setForma(nova)
    const n = ++pedido.current
    setCalculando(true)
    try {
      const novoTotal = await aoMudarForma(nova)
      if (n === pedido.current && novoTotal != null) setValor(numeroParaTexto(novoTotal))
    } catch {
      // o erro já aparece no aviso de quem gravou; o valor digitado fica como está
    } finally {
      if (n === pedido.current) setCalculando(false)
    }
  }
  const [quando, setQuando] = useState(agoraLocal())
  const [salvando, setSalvando] = useState(false)
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel>Forma de pagamento</FieldLabel>
        <FormaPagamento valor={forma} aoMudar={(f) => f && void trocarForma(f)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-valor">Valor pago</FieldLabel>
        <CampoReais id="pg-valor" value={valor} onValueChange={setValor} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-quando">Data e hora do pagamento</FieldLabel>
        <Input id="pg-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Field>
      <Button
        size="xl"
        disabled={salvando || calculando || !quando}
        onClick={async () => {
          const lido = lerNumero(valor)
          if (lido == null) return toast.error("Valor pago inválido")
          setSalvando(true)
          try {
            // Horário de São Paulo com deslocamento explícito (sem horário de verão desde 2019).
            await aoConfirmar({ forma, valor: lido, pagoEm: new Date(`${quando}:00-03:00`).toISOString() })
          } finally {
            setSalvando(false)
          }
        }}
      >
        {(salvando || calculando) && <Spinner />} Confirmar pagamento
      </Button>
    </FieldGroup>
  )
}

export default function PagoDialog({ aberto, aoMudar, total, formaInicial, aoMudarForma, aoConfirmar }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Marcar como pago" descricao="O pedido entra na expedição e o prazo de 48 h úteis começa a contar.">
      {aberto && <Formulario total={total} formaInicial={formaInicial} aoMudarForma={aoMudarForma} aoConfirmar={aoConfirmar} />}
    </RespDialog>
  )
}
