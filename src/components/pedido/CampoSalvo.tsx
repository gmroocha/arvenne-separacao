import { useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type Props = {
  id: string
  rotulo: string
  valor: string | null
  aoSalvar: (valor: string | null) => void
  mascara?: (t: string) => string
  placeholder?: string
  inputMode?: "text" | "numeric" | "decimal" | "url"
}

// Campo que grava ao sair (blur) ou ao dar Enter, sem botão. Reinicia se o valor salvo mudar.
export default function CampoSalvo({ id, rotulo, valor, aoSalvar, mascara, placeholder, inputMode }: Props) {
  return <CampoInterno key={valor ?? ""} {...{ id, rotulo, valor, aoSalvar, mascara, placeholder, inputMode }} />
}

function CampoInterno({ id, rotulo, valor, aoSalvar, mascara, placeholder, inputMode }: Props) {
  const [texto, setTexto] = useState(mascara ? mascara(valor ?? "") : (valor ?? ""))
  const salvar = () => {
    const limpo = texto.trim() || null
    if (limpo !== (valor ? (mascara ? mascara(valor) : valor) : null)) aoSalvar(limpo)
  }
  return (
    <Field>
      <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
      <Input
        id={id}
        className="h-11 md:h-9"
        value={texto}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => setTexto(mascara ? mascara(e.target.value) : e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </Field>
  )
}
