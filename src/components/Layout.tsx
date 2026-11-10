import { useState } from "react"
import { Outlet, useLocation } from "react-router"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import FeedbackDialog from "@/components/FeedbackDialog"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import AppSidebar from "@/components/AppSidebar"
import { useTempoReal } from "@/lib/tempoReal"

function titulo(caminho: string) {
  if (caminho === "/") return "Expedição"
  if (caminho.startsWith("/vendas/nova")) return "Nova venda"
  if (caminho.startsWith("/vendas/")) return "Venda"
  if (caminho.startsWith("/vendas")) return "Vendas"
  if (caminho.startsWith("/pedidos/")) return "Pedido"
  if (caminho.startsWith("/arquivo")) return "Arquivo"
  if (caminho.startsWith("/repetidas")) return "Peças repetidas"
  if (caminho.startsWith("/clube")) return "Clube"
  if (caminho.startsWith("/feedbacks")) return "Feedbacks"
  return "Separação"
}

export default function Layout() {
  useTempoReal()
  const { pathname } = useLocation()
  const [feedback, setFeedback] = useState(false)
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-sm font-medium">{titulo(pathname)}</h1>
          <Button variant="ghost" size="sm" className="ml-auto max-sm:size-9 max-sm:p-0" aria-label="Feedback" onClick={() => setFeedback(true)}>
            <MessageSquarePlus /> <span className="max-sm:sr-only">Feedback</span>
          </Button>
        </header>
        <div className={`mx-auto w-full flex-1 p-3 sm:p-4 ${pathname === "/" ? "" : "max-w-5xl"}`}>
          <Outlet />
        </div>
        <FeedbackDialog aberto={feedback} aoMudar={setFeedback} pagina={pathname} />
      </SidebarInset>
    </SidebarProvider>
  )
}
