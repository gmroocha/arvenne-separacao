import { useRef, useState } from "react"
import { toast } from "sonner"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { lerNumero, reaisTexto } from "@/lib/formato"
import { cn } from "@/lib/utils"

type Props = {
  value: string
  onValueChange: (texto: string) => void
  // Ao sair do campo com um valor entendido (ou vazio = null). Valor inválido nunca chega aqui.
  onCommit?: (n: number | null) => void
  id?: string
  "aria-label"?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  inputClassName?: string
}

// Campo de dinheiro com máscara de reais: "R$" na esquerda, "1.234,50" quando não está em foco.
// Texto que não dá para ler: avisa, volta ao que estava e não chama onCommit (nunca grava null por engano).
export default function CampoReais({
  value,
  onValueChange,
  onCommit,
  id,
  placeholder = "0,00",
  disabled,
  invalid,
  className,
  inputClassName,
  ...resto
}: Props) {
  const [emFoco, setEmFoco] = useState(false)
  const antes = useRef(value)
  const lido = value.trim() ? lerNumero(value) : null
  const mostrado = !emFoco && lido != null ? reaisTexto(lido) : value
  return (
    <InputGroup className={className}>
      <InputGroupAddon>R$</InputGroupAddon>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        aria-label={resto["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn("tabular-nums", inputClassName)}
        placeholder={placeholder}
        disabled={disabled}
        value={mostrado}
        onFocus={(e) => {
          antes.current = value
          setEmFoco(true)
          e.currentTarget.select()
        }}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={() => {
          setEmFoco(false)
          if (!value.trim()) return onCommit?.(null)
          const n = lerNumero(value)
          if (n == null) {
            toast.error("Valor não entendido: o anterior foi mantido")
            onValueChange(antes.current)
            return
          }
          onValueChange(reaisTexto(n))
          onCommit?.(n)
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </InputGroup>
  )
}
