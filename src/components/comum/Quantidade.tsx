import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"

type Props = {
  valor: number
  min?: number
  max?: number
  aoMudar: (n: number) => void
  tamanho?: "padrao" | "grande"
  rotulo?: string // complementa o aria-label, ex.: "peça"
  de?: number // só no grande: mostra "de N" embaixo do número
}

// Seletor de quantidade: compacto (padrão) ou o grande do "Quantas faltam?".
export function Quantidade({ valor, min = 1, max, aoMudar, tamanho = "padrao", rotulo, de }: Props) {
  const sufixo = rotulo ? ` ${rotulo}` : ""
  const menos = (
    <Button
      variant="outline"
      size="icon"
      className={tamanho === "grande" ? "size-12 rounded-full" : undefined}
      aria-label={`Diminuir${sufixo}`}
      disabled={valor <= min}
      onClick={() => aoMudar(valor - 1)}
    >
      <Minus />
    </Button>
  )
  const mais = (
    <Button
      variant="outline"
      size="icon"
      className={tamanho === "grande" ? "size-12 rounded-full" : undefined}
      aria-label={`Aumentar${sufixo}`}
      disabled={max != null && valor >= max}
      onClick={() => aoMudar(valor + 1)}
    >
      <Plus />
    </Button>
  )
  if (tamanho === "grande")
    return (
      <div className="flex items-center justify-center gap-6">
        {menos}
        <div className="flex w-20 flex-col items-center">
          <span className="text-4xl leading-none font-semibold tabular-nums" aria-live="polite">
            {valor}
          </span>
          {de != null && <span className="pt-1 text-xs text-muted-foreground">de {de}</span>}
        </div>
        {mais}
      </div>
    )
  return (
    <ButtonGroup>
      {menos}
      <ButtonGroupText className="tabular-nums">{valor}</ButtonGroupText>
      {mais}
    </ButtonGroup>
  )
}
