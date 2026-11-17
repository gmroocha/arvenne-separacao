import type { ReactNode } from "react"
import Logo from "@/components/Logo"

// Casca das páginas públicas (sem login): cabeçalho com a logo, fixo no topo; coluna estreita.
// --topo-publico: altura do cabeçalho, para o que gruda no topo da página ficar logo abaixo dele.
export function PaginaPublica({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col [--topo-publico:4rem]">
      <header className="sticky top-0 z-30 flex h-(--topo-publico) shrink-0 items-center justify-center border-b bg-background/85 backdrop-blur-md">
        <Logo className="h-8" />
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-x-hidden px-4 pt-5 pb-12">{children}</div>
    </div>
  )
}
