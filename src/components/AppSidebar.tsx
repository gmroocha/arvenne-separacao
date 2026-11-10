import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router"
import { Archive, Gem, LogOut, Moon, Receipt, Repeat, Sun, Truck } from "lucide-react"
import { useTheme } from "next-themes"
import { supabase } from "@/lib/supabase"
import { useContagens, useRepetidas } from "@/lib/api"
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
  useSidebar,
} from "@/components/ui/sidebar"

export default function AppSidebar() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const { data: repetidas } = useRepetidas()
  const { data: contagens } = useContagens()
  const [email, setEmail] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""))
  }, [])

  const itens = [
    { to: "/vendas", nome: "Vendas", icone: Receipt, ativo: pathname.startsWith("/vendas"), badge: contagens?.emAberto },
    {
      to: "/",
      nome: "Expedição",
      icone: Truck,
      ativo: pathname === "/" || pathname.startsWith("/pedidos/"),
      badge: contagens?.atrasados,
      alerta: true,
    },
    { to: "/repetidas", nome: "Peças repetidas", icone: Repeat, ativo: pathname === "/repetidas", badge: repetidas?.length },
    { to: "/clube", nome: "Clube", icone: Gem, ativo: pathname === "/clube" },
    { to: "/arquivo", nome: "Arquivo", icone: Archive, ativo: pathname === "/arquivo" },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold group-data-[collapsible=icon]:hidden">Separação Arvenne</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {itens.map((i) => (
                <SidebarMenuItem key={i.to}>
                  <SidebarMenuButton asChild isActive={i.ativo} tooltip={i.nome}>
                    <Link to={i.to} onClick={() => setOpenMobile(false)}>
                      <i.icone />
                      <span>{i.nome}</span>
                    </Link>
                  </SidebarMenuButton>
                  {i.badge ? (
                    <SidebarMenuBadge className={i.alerta ? "bg-destructive/10 text-destructive" : undefined}>{i.badge}</SidebarMenuBadge>
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
            <div className="truncate px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{email}</div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Alternar tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              <span>Alternar tema</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={() => supabase.auth.signOut()}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
