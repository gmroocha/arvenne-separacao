import { Fragment, useState, type ComponentType, type ReactNode } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

export type ItemAcao = {
  rotulo: string
  icone?: ComponentType<{ className?: string }>
  aoClicar: () => void
  destrutivo?: boolean
  desabilitado?: boolean
}
export type GrupoAcoes = { titulo?: string; itens: ItemAcao[] }

type Props = {
  grupos: GrupoAcoes[]
  gatilho: ReactNode // um único elemento clicável (ex.: Button)
  titulo?: string // título da gaveta no celular
}

// Menu de ações: lista suspensa no PC, gaveta de baixo com botões grandes no celular.
export default function MenuAcoes({ grupos, gatilho, titulo = "Ações" }: Props) {
  const celular = useIsMobile()
  const [aberto, setAberto] = useState(false)
  const visiveis = grupos.filter((g) => g.itens.length > 0)

  if (celular)
    return (
      <Drawer open={aberto} onOpenChange={setAberto}>
        <DrawerTrigger asChild>{gatilho}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{titulo}</DrawerTitle>
            <DrawerDescription className="sr-only">{titulo}</DrawerDescription>
          </DrawerHeader>
          <div className="flex max-h-[70svh] flex-col gap-4 overflow-y-auto px-4 pb-6">
            {visiveis.map((g, gi) => (
              <div key={gi} className="flex flex-col gap-1.5">
                {g.titulo && <div className="px-1 text-xs font-medium text-muted-foreground">{g.titulo}</div>}
                {g.itens.map((it) => {
                  const Icone = it.icone
                  return (
                    <Button
                      key={it.rotulo}
                      variant="outline"
                      disabled={it.desabilitado}
                      className={cn("h-12 justify-start gap-3 text-base", it.destrutivo && "text-destructive")}
                      onClick={() => {
                        setAberto(false)
                        it.aoClicar()
                      }}
                    >
                      {Icone && <Icone />} {it.rotulo}
                    </Button>
                  )
                })}
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{gatilho}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {visiveis.map((g, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <DropdownMenuSeparator />}
            {g.titulo && <DropdownMenuLabel>{g.titulo}</DropdownMenuLabel>}
            {g.itens.map((it) => {
              const Icone = it.icone
              return (
                <DropdownMenuItem
                  key={it.rotulo}
                  variant={it.destrutivo ? "destructive" : undefined}
                  disabled={it.desabilitado}
                  onClick={it.aoClicar}
                >
                  {Icone && <Icone />} {it.rotulo}
                </DropdownMenuItem>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
