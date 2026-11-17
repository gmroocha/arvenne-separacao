import { useState } from "react"
import { CircleCheck, CircleX, Hourglass, PencilLine } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Situacao = "em_aberto" | "aguardando_pagamento"

type Props = {
  status: string
  aoSituacao: (s: Situacao) => void
  aoPago: () => void
  aoPerdida: () => void
}

// Situação da venda no topo, numa lista que abre: as duas situações gravam na hora; "Pago" e "Perdida"
// abrem a confirmação de sempre (o valor mostrado continua sendo a situação atual).
export default function SituacaoVenda({ status, aoSituacao, aoPago, aoPerdida }: Props) {
  // Mostra a escolha na hora, sem esperar o banco responder.
  const [local, setLocal] = useState<string | null>(null)
  const valor = local ?? status
  return (
    <Select
      value={valor}
      onValueChange={(v) => {
        if (v === "pago") return aoPago()
        if (v === "perdida") return aoPerdida()
        if (v !== "em_aberto" && v !== "aguardando_pagamento") return
        setLocal(v)
        aoSituacao(v)
      }}
    >
      <SelectTrigger aria-label="Situação da venda" className="h-9 min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="em_aberto">
          <PencilLine /> Em aberto
        </SelectItem>
        <SelectItem value="aguardando_pagamento">
          <Hourglass /> Aguardando pagamento
        </SelectItem>
        <SelectSeparator />
        <SelectItem value="pago">
          <CircleCheck /> Pago…
        </SelectItem>
        <SelectItem value="perdida">
          <CircleX /> Perdida…
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
