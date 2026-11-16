import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

// Botão grande de fechar a etapa (Concluir separação, conferência...). Fica preso no rodapé da tela enquanto
// a lista rola, para não precisar descer até o fim.
export function ConcluirEtapa({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <div className="sticky bottom-0 z-10 -mb-3 border-t bg-background py-3 sm:-mb-4 sm:pb-4">
      <Button size="xl" className="w-full" disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </div>
  )
}
