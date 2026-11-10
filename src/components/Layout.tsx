import { Outlet, useLocation } from "react-router"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import AppSidebar from "@/components/AppSidebar"
import { useTempoReal } from "@/lib/tempoReal"

function titulo(caminho: string) {
  if (caminho === "/") return "Pedidos"
  if (caminho.startsWith("/pedidos/novo")) return "Novo pedido"
  if (caminho.startsWith("/pedidos/")) return "Pedido"
  if (caminho.startsWith("/repetidas")) return "Peças repetidas"
  if (caminho.startsWith("/clube")) return "Clube"
  return "Separação"
}

export default function Layout() {
  useTempoReal()
  const { pathname } = useLocation()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-sm font-medium">{titulo(pathname)}</h1>
        </header>
        <div className="mx-auto w-full max-w-5xl flex-1 p-3 sm:p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
