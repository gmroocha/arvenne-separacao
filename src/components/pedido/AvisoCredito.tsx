import { useState } from "react"
import { PiggyBank, Undo2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useCreditosDisponiveis, useUsarCredito } from "@/lib/api"
import { reais } from "@/lib/formato"
import type { CreditoDisponivel } from "@/lib/tipos"

// Crédito guardado de outro pedido da mesma cliente: avisa aqui para a equipe aplicar como desconto e marcar
// como usado. O app não muda o total sozinho; o valor vem do banco.
export default function AvisoCredito({ pedidoId }: { pedidoId: string }) {
  const { data } = useCreditosDisponiveis(pedidoId)
  const usar = useUsarCredito()
  const [confirmando, setConfirmando] = useState<CreditoDisponivel | null>(null)
  if (!data?.length) return null
  return (
    <>
      {data.map((c) =>
        c.usado_aqui ? (
          <Alert key={c.id}>
            <PiggyBank />
            <AlertTitle>Crédito de {reais(c.valor)} usado neste pedido</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Veio do pedido {c.numero}.</span>
              <Button variant="ghost" size="sm" disabled={usar.isPending} onClick={() => usar.mutate({ creditoId: c.id, pedidoId, desfazer: true })}>
                <Undo2 /> Desfazer
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert key={c.id} variant="success">
            <PiggyBank />
            <AlertTitle>A cliente tem {reais(c.valor)} de crédito</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>Guardado do pedido {c.numero}. Aplique como desconto e marque como usado.</span>
              <Button variant="outline" size="sm" className="text-foreground" disabled={usar.isPending} onClick={() => setConfirmando(c)}>
                Usar neste pedido
              </Button>
            </AlertDescription>
          </Alert>
        ),
      )}
      <Dialog open={!!confirmando} onOpenChange={(a) => !a && setConfirmando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usar o crédito neste pedido?</DialogTitle>
            <DialogDescription>
              {confirmando ? `${reais(confirmando.valor)} do pedido ${confirmando.numero}. ` : ""}
              Lembre de aplicar o desconto. O crédito sai da ficha da cliente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (confirmando) usar.mutate({ creditoId: confirmando.id, pedidoId })
                setConfirmando(null)
              }}
            >
              Usar crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
