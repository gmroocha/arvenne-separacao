import type { ComponentType, ReactNode } from "react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type Props = {
  children?: ReactNode
  icone?: ComponentType
  titulo?: string
  className?: string
}

// Estado vazio. Sem título/ícone é o aviso compacto; com eles, o cabeçalho completo.
export function Vazio({ children, icone: Icone, titulo, className }: Props) {
  const completo = !!(Icone || titulo)
  return (
    <Empty className={cn("border border-dashed", completo ? "p-6" : "gap-2 p-4", className)}>
      {completo ? (
        <EmptyHeader>
          {Icone && (
            <EmptyMedia variant="icon">
              <Icone />
            </EmptyMedia>
          )}
          {titulo && <EmptyTitle>{titulo}</EmptyTitle>}
          {children && <EmptyDescription>{children}</EmptyDescription>}
        </EmptyHeader>
      ) : (
        <EmptyDescription>{children}</EmptyDescription>
      )}
    </Empty>
  )
}

export default Vazio
