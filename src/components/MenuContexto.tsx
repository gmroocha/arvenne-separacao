import { Fragment, type ReactNode } from "react"
import { Check } from "lucide-react"
import { useAcoesPedido } from "@/components/pedido/useAcoesPedido"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import type { Pedido } from "@/lib/tipos"

// Clique direito no cartão: as mesmas ações do "⋯" do pedido.
export default function MenuContexto({ pedido, children }: { pedido: Pedido; children: ReactNode }) {
  const { grupos, dialogos } = useAcoesPedido(pedido, { abrir: true })
  const visiveis = grupos.filter((g) => g.itens.length > 0)
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          {visiveis.map((g, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <ContextMenuSeparator />}
              {g.titulo && <ContextMenuLabel>{g.titulo}</ContextMenuLabel>}
              {g.itens.map((it) => {
                const Icone = it.icone
                return (
                  <ContextMenuItem
                    key={it.rotulo}
                    variant={it.destrutivo ? "destructive" : undefined}
                    disabled={it.desabilitado}
                    aria-current={it.atual ? "step" : undefined}
                    onSelect={it.atual ? undefined : it.aoClicar}
                  >
                    {Icone && <Icone />} {it.rotulo}
                    {it.atual && <Check className="ml-auto text-success" />}
                  </ContextMenuItem>
                )
              })}
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {dialogos}
    </>
  )
}
