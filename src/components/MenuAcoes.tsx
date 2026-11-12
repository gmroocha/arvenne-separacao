import { Fragment, useState, type ComponentType, type ReactNode } from "react"
import { Check } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

export type ItemAcao = {
  rotulo: string
  icone?: ComponentType<{ className?: string }>
  aoClicar: () => void
  destrutivo?: boolean
  desabilitado?: boolean
  atual?: boolean // etapa em que o pedido já está: marcada com check e sem ação
}
export type GrupoAcoes = { titulo?: string; itens: ItemAcao[]; estilo?: "ghost" | "outline" }

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
          <div className="fade-rolagem max-h-[70svh] overflow-y-auto">
            <div className="flex flex-col gap-1 px-4 py-4 pb-6">
              {visiveis.map((g, gi) => (
                <Fragment key={gi}>
                  {gi > 0 && <Separator className="my-2" />}
                  {g.titulo && <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">{g.titulo}</div>}
                  {g.itens.map((it) => {
                    const Icone = it.icone
                    return (
                      <Button
                        key={it.rotulo}
                        variant={g.estilo ?? "outline"}
                        disabled={it.desabilitado}
                        aria-current={it.atual ? "step" : undefined}
                        className={cn("h-11 w-full justify-start gap-3 text-base", it.destrutivo && "text-destructive hover:text-destructive")}
                        onClick={() => {
                          if (it.atual) return setAberto(false)
                          setAberto(false)
                          it.aoClicar()
                        }}
                      >
                        {Icone && <Icone />} {it.rotulo}
                        {it.atual && <Check className="ml-auto text-success" />}
                      </Button>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )

  // Muitas seções com título (ex.: uma por tamanho): no PC vira grade de 2 colunas, para o menu não
  // ficar mais alto que a tela e encostar na barra do topo.
  const emColunas = visiveis.length > 2 && visiveis.every((g) => g.titulo)
  const item = (it: ItemAcao) => {
    const Icone = it.icone
    return (
      <DropdownMenuItem
        key={it.rotulo}
        variant={it.destrutivo ? "destructive" : undefined}
        disabled={it.desabilitado}
        aria-current={it.atual ? "step" : undefined}
        onSelect={it.atual ? (e) => e.preventDefault() : undefined}
        onClick={it.atual ? undefined : it.aoClicar}
      >
        {Icone && <Icone />} {it.rotulo}
        {it.atual && <Check className="ml-auto text-success" />}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{gatilho}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={16}
        className={cn("min-w-56", emColunas && "grid max-h-[min(70svh,32rem)] w-[26rem] grid-cols-2 gap-1 p-1.5")}
      >
        {emColunas
          ? visiveis.map((g, gi) => (
              <div key={gi} className="flex flex-col rounded-md bg-muted/30 p-0.5">
                <DropdownMenuLabel className="text-xs">{g.titulo}</DropdownMenuLabel>
                {g.itens.map(item)}
              </div>
            ))
          : visiveis.map((g, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <DropdownMenuSeparator />}
                {g.titulo && <DropdownMenuLabel>{g.titulo}</DropdownMenuLabel>}
                {g.itens.map(item)}
              </Fragment>
            ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
