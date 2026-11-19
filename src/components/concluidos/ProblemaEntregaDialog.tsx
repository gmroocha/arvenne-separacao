import { useState } from "react"
import RespDialog from "@/components/RespDialog"
import SelectResponsavel from "@/components/pedido/SelectResponsavel"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useRegistrarProblemaEntrega, useResponsavelSugerido, type DetalheConcluido } from "@/lib/api"
import { MOTIVOS_PROBLEMA_ENTREGA, etapaSugerida } from "@/lib/ocorrencias"
import { passosTrabalhoDe } from "@/lib/status"

const SEM_PECA = "sem-peca"

type Props = {
  pedidoId: string
  origem: string
  itens: DetalheConcluido["itens"]
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}

function Formulario({ pedidoId, origem, itens, aoFechar }: Omit<Props, "aberto" | "aoMudar"> & { aoFechar: () => void }) {
  const [motivo, setMotivo] = useState("")
  // undefined = segue a sugestão (a etapa pelo motivo, a pessoa pela etapa); escolher à mão vale no lugar dela.
  const [etapaManual, setEtapaManual] = useState<string | undefined>(undefined)
  const [item, setItem] = useState<string | null>(null)
  const [pessoaManual, setPessoaManual] = useState<string | null | undefined>(undefined)
  const [obs, setObs] = useState("")
  const registrar = useRegistrarProblemaEntrega(pedidoId)
  const etapas = passosTrabalhoDe(origem)
  const etapa = etapaManual ?? (motivo ? etapaSugerida(motivo) : null)
  const sugerido = useResponsavelSugerido(pedidoId, etapa, item)
  const pessoa = pessoaManual !== undefined ? pessoaManual : (sugerido.data ?? null)
  const completo = motivo !== "" && etapa !== null && (motivo !== "outro" || obs.trim() !== "")
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        value={motivo}
        onValueChange={(v) => {
          setMotivo(v)
          setEtapaManual(undefined)
          setPessoaManual(undefined)
        }}
        aria-label="O que deu errado"
        className="grid-cols-1 gap-1 sm:grid-cols-2"
      >
        {MOTIVOS_PROBLEMA_ENTREGA.map((m) => (
          <Label key={m.id} htmlFor={`entrega-${m.id}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-base font-normal hover:bg-muted/60">
            <RadioGroupItem id={`entrega-${m.id}`} value={m.id} />
            {m.nome}
          </Label>
        ))}
      </RadioGroup>

      <Field>
        <FieldLabel>Etapa onde o erro aconteceu</FieldLabel>
        <Select
          value={etapa ?? ""}
          onValueChange={(v) => {
            setEtapaManual(v)
            setPessoaManual(undefined)
          }}
        >
          <SelectTrigger className="h-11 w-full md:h-9" aria-label="Etapa onde o erro aconteceu">
            <SelectValue placeholder="Escolha a etapa" />
          </SelectTrigger>
          <SelectContent>
            {etapas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {itens.length > 0 && (
        <Field>
          <FieldLabel>Peça (opcional)</FieldLabel>
          <Select
            value={item ?? SEM_PECA}
            onValueChange={(v) => {
              setItem(v === SEM_PECA ? null : v)
              setPessoaManual(undefined)
            }}
          >
            <SelectTrigger className="h-11 w-full md:h-9" aria-label="Peça">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PECA}>O pedido todo</SelectItem>
              {itens.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {[i.sku ?? "sem código", i.variante].filter(Boolean).join(" · ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field>
        <FieldLabel>Quem fez essa etapa</FieldLabel>
        <SelectResponsavel valor={pessoa} aoMudar={setPessoaManual} rotulo="Quem fez essa etapa" />
      </Field>

      <Textarea
        aria-label="Observação"
        placeholder={motivo === "outro" ? "Conte o que aconteceu" : "Observação (opcional)"}
        maxLength={500}
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        className="min-h-20"
      />

      <Button
        size="xl"
        disabled={!completo || registrar.isPending}
        onClick={() => registrar.mutate({ motivo, etapa, responsavel: pessoa, item, obs }, { onSuccess: aoFechar })}
      >
        {registrar.isPending && <Spinner />} Registrar problema
      </Button>
    </div>
  )
}

// Problema que a cliente relatou depois da entrega: motivo, etapa (sugerida pelo motivo), peça, responsável e observação.
export default function ProblemaEntregaDialog({ aberto, aoMudar, ...resto }: Props) {
  return (
    <RespDialog
      teclado
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Problema na entrega"
      descricao="Registre o que deu errado e de quem foi a etapa. Isso só serve para acompanhar o time."
    >
      {aberto && <Formulario {...resto} aoFechar={() => aoMudar(false)} />}
    </RespDialog>
  )
}
