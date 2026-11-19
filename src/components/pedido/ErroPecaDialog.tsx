import { useState } from "react"
import { LinhaPeca } from "@/components/comum/Peca"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useRegistrarErroBipagem, useResponsavelSugerido } from "@/lib/api"
import { MOTIVOS_ERRO_BIPAGEM } from "@/lib/ocorrencias"
import type { Item } from "@/lib/tipos"
import SelectResponsavel from "./SelectResponsavel"

function Formulario({ pedidoId, item, aoFechar }: { pedidoId: string; item: Item; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState("")
  const [obs, setObs] = useState("")
  // undefined = segue a sugestão; a pessoa pode trocar (ou marcar "Não sei").
  const [escolha, setEscolha] = useState<string | null | undefined>(undefined)
  const sugerido = useResponsavelSugerido(pedidoId, "separacao", item.id)
  const registrar = useRegistrarErroBipagem(pedidoId)
  const responsavel = escolha !== undefined ? escolha : (item.separado_por ?? sugerido.data ?? null)
  const completo = motivo !== "" && (motivo !== "outro" || obs.trim() !== "")
  return (
    <div className="flex flex-col gap-4">
      <LinhaPeca item={{ foto_url: item.foto_url, nome: item.nome, sku: item.sku, variante: item.variante, qtd: item.qtd }} tamanho="lg" />
      <RadioGroup value={motivo} onValueChange={setMotivo} aria-label="O que está errado" className="gap-1">
        {MOTIVOS_ERRO_BIPAGEM.map((m) => (
          <Label key={m.id} htmlFor={`erro-${m.id}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-base font-normal hover:bg-muted/60">
            <RadioGroupItem id={`erro-${m.id}`} value={m.id} />
            {m.nome}
          </Label>
        ))}
      </RadioGroup>
      {motivo === "outro" && (
        <Textarea aria-label="O que aconteceu" placeholder="Conte o que aconteceu" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} className="min-h-20" />
      )}
      <Field>
        <FieldLabel>Separada por</FieldLabel>
        <SelectResponsavel valor={responsavel} aoMudar={setEscolha} rotulo="Separada por" />
      </Field>
      <p className="text-sm text-muted-foreground">A peça volta para a Separação e o pedido volta junto. O erro fica registrado para as métricas.</p>
      <Button
        size="xl"
        disabled={!completo || registrar.isPending}
        onClick={() => registrar.mutate({ item, motivo, obs: motivo === "outro" ? obs : "", responsavel }, { onSuccess: aoFechar })}
      >
        {registrar.isPending && <Spinner />} Continuar
      </Button>
    </div>
  )
}

// "Erro na peça" achado na Bipagem: motivo, quem separou (sugerido, editável) e Continuar.
export default function ErroPecaDialog({ pedidoId, item, aoFechar }: { pedidoId: string; item: Item | null; aoFechar: () => void }) {
  return (
    <RespDialog
      teclado
      aberto={item !== null}
      aoMudar={(a) => !a && aoFechar()}
      titulo="Erro na peça"
      descricao="Escolha o que está errado. A peça volta para a Separação."
    >
      {item && <Formulario key={item.id} pedidoId={pedidoId} item={item} aoFechar={aoFechar} />}
    </RespDialog>
  )
}
