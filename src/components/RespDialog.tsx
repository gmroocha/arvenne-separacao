import type { ReactNode } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  titulo: string
  descricao?: string
  // Só a largura (PC: sm:max-w-6xl; celular: gaveta mais alta). A rolagem continua do diálogo.
  largo?: boolean
  // O conteúdo cuida da própria rolagem (ex.: TrocaDialog): sem rolagem/respiro extra do diálogo.
  rolagemPropria?: boolean
  children: ReactNode
}

// Dialog no PC, Drawer (gaveta de baixo) no celular.
export default function RespDialog({ aberto, aoMudar, titulo, descricao, largo, rolagemPropria, children }: Props) {
  const celular = useIsMobile()
  if (celular)
    return (
      <Drawer open={aberto} onOpenChange={aoMudar}>
        <DrawerContent className={largo ? "data-[vaul-drawer-direction=bottom]:max-h-[94svh]" : undefined}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{titulo}</DrawerTitle>
            <DrawerDescription className={descricao ? undefined : "sr-only"}>{descricao ?? titulo}</DrawerDescription>
          </DrawerHeader>
          {/* min-h-0 + flex-1: a rolagem fica aqui dentro (sem isso o conteúdo vaza por baixo da gaveta). */}
          <div className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 ${rolagemPropria ? "" : "pb-6"}`}>{children}</div>
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className={`max-h-[94svh] overflow-x-hidden ${rolagemPropria ? "overflow-y-hidden" : "overflow-y-auto"} ${largo ? "sm:max-w-6xl" : "sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className={descricao ? undefined : "sr-only"}>{descricao ?? titulo}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
