import type { ReactNode } from "react"
import Logo from "@/components/Logo"

// Casca das páginas públicas (sem login): coluna estreita com a logo no topo.
export function PaginaPublica({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 overflow-x-hidden px-4 pt-3 pb-12">
      <header className="flex justify-center pt-3">
        <Logo className="h-10" />
      </header>
      {children}
    </div>
  )
}
