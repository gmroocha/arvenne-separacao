import { useCallback, useEffect, useRef, useState } from "react"
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
  formaInicial?: string | null
  // Grava a forma escolhida e devolve o total já recalculado pelo banco (o desconto do Pix vem do SQL).
  aoMudarForma: (forma: string) => Promise<number | null>
  aoConfirmar: (d: DadosPagamento) => Promise<void>
}

function Formulario({ formaInicial, aoMudarForma, aoConfirmar }: Pick<Props, "formaInicial" | "aoMudarForma" | "aoConfirmar">) {
  const [forma, setForma] = useState(formaInicial ?? "Pix")
  const [valor, setValor] = useState("")
  const [calculando, setCalculando] = useState(true)
  const [calculado, setCalculado] = useState(false)
  const [erro, setErro] = useState(false)
  const pedido = useRef({ atual: 0 })

  const calcular = useCallback(async (nova: string) => {
    const n = ++pedido.current.atual
    try {
      const novoTotal = await aoMudarForma(nova)
      if (novoTotal == null) throw new Error("Total indisponível")
      if (n === pedido.current.atual) {
        setValor(numeroParaTexto(novoTotal))
        setCalculado(true)
      }
    } catch {
      if (n === pedido.current.atual) { setErro(true); setCalculado(false) }
    } finally {
      if (n === pedido.current.atual) setCalculando(false)
    }
  }, [aoMudarForma])
  function trocarForma(nova: string) {
    setForma(nova)
    setCalculando(true)
    setCalculado(false)
    setErro(false)
    void calcular(nova)
  }
  useEffect(() => {
    const controle = pedido.current
    let ativo = true
    void Promise.resolve().then(async () => { if (ativo) await calcular(formaInicial ?? "Pix") })
    return () => { ativo = false; controle.atual++ }
  }, [formaInicial, calcular])
  const [quando, setQuando] = useState(agoraLocal())
  const [salvando, setSalvando] = useState(false)
  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel>Forma de pagamento</FieldLabel>
        <FormaPagamento valor={forma} aoMudar={(f) => f && !salvando && void trocarForma(f)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-valor">Valor pago</FieldLabel>
        <CampoReais id="pg-valor" value={valor} onValueChange={setValor} disabled={!calculado || calculando || salvando} />
        {calculando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Recalculando…</p>}
        {erro && <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          <p>Não foi possível atualizar o total.</p>
          <Button variant="outline" size="toque" onClick={() => void trocarForma(forma)}>Tentar recalcular</Button>
        </div>}
      </Field>
      <Field>
        <FieldLabel htmlFor="pg-quando">Data e hora do pagamento</FieldLabel>
        <Input id="pg-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Field>
      <Button
        size="xl"
        disabled={salvando || calculando || !calculado || !quando}
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

export default function PagoDialog({ aberto, aoMudar, formaInicial, aoMudarForma, aoConfirmar }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Marcar como pago" descricao="O pedido entra na expedição e o prazo de 48 h úteis começa a contar.">
      {aberto && <Formulario formaInicial={formaInicial} aoMudarForma={aoMudarForma} aoConfirmar={aoConfirmar} />}
    </RespDialog>
  )
}
