import { useSidebar } from "@/components/ui/sidebar-context"
import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router"
import { Archive, BookOpen, ChartNoAxesColumn, CheckCheck, Gem, LogOut, MessageSquare, Moon, Receipt, Repeat, Store, Sun, Truck, Users, Video } from "lucide-react"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import { useContagemFeedbacksAbertos, useContagemRepetidas, useContagens, useMeuMembro, usePendentesRastreio, useSouGestor } from "@/lib/api"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export default function AppSidebar() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const qc = useQueryClient()
  const { data: repetidas } = useContagemRepetidas()
  const { data: contagens } = useContagens()
  const { data: abertos } = useContagemFeedbacksAbertos()
  const { data: semRastreio } = usePendentesRastreio()
  const [email, setEmail] = useState("")
  const gestor = useSouGestor() === true
  const meuMembro = useMeuMembro()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""))
  }, [])

  const itens = [
    { gestor: true, to: "/vendas", nome: "Vendas", icone: Receipt, ativo: pathname.startsWith("/vendas"), badge: contagens?.emAberto },
    {
      to: "/",
      nome: "Expedição",
      icone: Truck,
      ativo: pathname === "/" || pathname.startsWith("/pedidos/"),
      // Vermelho: pedidos atrasados. Sem atrasados, laranja: pedidos já postados esperando a mensagem de rastreio.
      badge: contagens?.atrasados || semRastreio?.length,
      alerta: contagens?.atrasados ? "vermelho" : "laranja",
    },
    { gestor: true, to: "/concluidos", nome: "Concluídos", icone: CheckCheck, ativo: pathname === "/concluidos" },
    { gestor: true, to: "/repetidas", nome: "Peças repetidas", icone: Repeat, ativo: pathname === "/repetidas", badge: repetidas },
    { gestor: true, to: "/catalogo", nome: "Catálogo", icone: BookOpen, ativo: pathname === "/catalogo" },
    { gestor: true, to: "/clube", nome: "Clube", icone: Gem, ativo: pathname === "/clube" },
    { to: "/live", nome: "Live", icone: Video, ativo: pathname === "/live" },
    { gestor: true, to: "/arquivo", nome: "Arquivo", icone: Archive, ativo: pathname === "/arquivo" },
    { gestor: true, to: "/pdv-lr", nome: "PDV LR", icone: Store, ativo: pathname === "/pdv-lr" },
    { gestor: true, to: "/indicadores", nome: "Indicadores", icone: ChartNoAxesColumn, ativo: pathname === "/indicadores" },
    { gestor: true, to: "/time", nome: "Time", icone: Users, ativo: pathname === "/time" },
    { gestor: true, to: "/feedbacks", nome: "Feedbacks", icone: MessageSquare, ativo: pathname === "/feedbacks", badge: abertos },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="font-heading px-2 py-1.5 text-sm font-semibold group-data-[collapsible=icon]:hidden">Separação Arvenne</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {itens.filter((i) => gestor || !i.gestor).map((i) => (
                <SidebarMenuItem key={i.to}>
                  <SidebarMenuButton asChild isActive={i.ativo} tooltip={i.nome}>
                    <Link to={i.to} onClick={() => setOpenMobile(false)}>
                      <i.icone />
                      <span>{i.nome}</span>
                    </Link>
                  </SidebarMenuButton>
                  {i.badge ? (
                    <SidebarMenuBadge className={i.alerta === "vermelho" ? "bg-destructive/10 text-destructive" : i.alerta === "laranja" ? "bg-rastreio/10 text-rastreio" : undefined}>{i.badge}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="truncate px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{meuMembro?.nome ?? (email.endsWith(".invalid") ? "" : email)}</div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Alternar tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              <span>Alternar tema</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={async () => {
                await supabase.auth.signOut()
                qc.clear() // nada da sessão anterior fica na memória
              }}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
