import type { ReactNode } from "react"
import Logo from "@/components/Logo"

// Casca das páginas públicas (sem login): cabeçalho discreto com a logo e um divisor; coluna estreita.
export function PaginaPublica({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex justify-center border-b py-5">
        <Logo className="h-8" />
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-x-hidden px-4 pt-5 pb-12">{children}</div>
    </div>
  )
}
