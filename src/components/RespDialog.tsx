import type { ReactNode } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  titulo: string
  descricao?: string
  largo?: boolean
  children: ReactNode
}

// Dialog no PC, Drawer (gaveta de baixo) no celular.
export default function RespDialog({ aberto, aoMudar, titulo, descricao, largo, children }: Props) {
  const celular = useIsMobile()
  if (celular)
    return (
      <Drawer open={aberto} onOpenChange={aoMudar}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{titulo}</DrawerTitle>
            <DrawerDescription className={descricao ? undefined : "sr-only"}>{descricao ?? titulo}</DrawerDescription>
          </DrawerHeader>
          <div className="min-w-0 overflow-x-hidden overflow-y-auto px-4 pb-6">{children}</div>
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className={`max-h-[90svh] overflow-x-hidden ${largo ? "overflow-y-hidden sm:max-w-4xl" : "overflow-y-auto sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className={descricao ? undefined : "sr-only"}>{descricao ?? titulo}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
