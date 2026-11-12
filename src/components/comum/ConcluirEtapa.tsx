import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

// Botão grande de fechar a etapa (Concluir separação, conferência...).
export function ConcluirEtapa({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <Button size="xl" className="w-full" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
