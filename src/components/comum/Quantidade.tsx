import { useState } from "react"
import { Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import { quantidadeDigitada } from "@/lib/quantidade"
import { cn } from "@/lib/utils"

type Props = {
  valor: number
  min?: number
  max?: number
  aoMudar: (n: number) => void
  tamanho?: "padrao" | "grande"
  rotulo?: string // complementa o aria-label, ex.: "peça"
  de?: number // só no grande: mostra "de N" embaixo do número
}

// Botão da ponta desabilitado (ex.: "−" no mínimo): apaga só o ícone. Com a opacidade no botão inteiro, o
// contorno daquele lado ficava mais fraco que o resto do grupo.
const PONTA = "disabled:opacity-100 disabled:[&_svg]:opacity-40"

// Seletor de quantidade: compacto (padrão) ou o grande do "Quantas faltam?". Os botões somam/subtraem um; o número
// também pode ser digitado: o rascunho fica local e só vale ao sair do campo ou com Enter (uma única mudança), entre
// o mínimo e o máximo; vazio ou inválido volta ao valor anterior.
export function Quantidade({ valor, min = 1, max, aoMudar, tamanho = "padrao", rotulo, de }: Props) {
  const sufixo = rotulo ? ` ${rotulo}` : ""
  const [rascunho, setRascunho] = useState<string | null>(null)
  const confirmar = () => {
    if (rascunho === null) return
    const n = quantidadeDigitada(rascunho, valor, min, max)
    setRascunho(null)
    if (n !== valor) aoMudar(n)
  }
  const campo = (
    <Input
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={`Quantidade${sufixo}`}
      value={rascunho ?? String(valor)}
      onChange={(e) => setRascunho(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onFocus={(e) => e.target.select()}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          confirmar()
        } else if (e.key === "Escape") setRascunho(null)
      }}
      className={cn(
        "text-center tabular-nums",
        tamanho === "grande" ? "h-14 w-20 border-0 bg-transparent px-0 text-4xl leading-none font-semibold shadow-none md:text-4xl dark:bg-transparent" : "w-12 px-1",
      )}
    />
  )
  const menos = (
    <Button
      variant="outline"
      size="icon"
      className={tamanho === "grande" ? "size-12 rounded-full" : PONTA}
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
      className={tamanho === "grande" ? "size-12 rounded-full" : PONTA}
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
          {campo}
          {de != null && <span className="pt-1 text-xs text-muted-foreground">de {de}</span>}
        </div>
        {mais}
      </div>
    )
  return (
    <ButtonGroup>
      {menos}
      {campo}
      {mais}
    </ButtonGroup>
  )
}
