import type { ReactNode } from "react"

type Props = {
  children: ReactNode
  contagem?: number
  acao?: ReactNode // à direita
  as?: "h2" | "h3"
}

// Título de seção: texto pequeno em semibold, com contagem opcional e ação à direita.
export function TituloSecao({ children, contagem, acao, as: Tag = "h2" }: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Tag className="text-sm font-semibold">
        {children}
        {contagem != null && <span className="font-normal text-muted-foreground tabular-nums"> ({contagem})</span>}
      </Tag>
      {acao}
    </div>
  )
}
